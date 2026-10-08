import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { DAY_MS, publicationDaysRemaining, publicationExpiresAt,
  isPublicationExpired, isPublicationUnavailable } from '../src/components/articleLifetime.js';
import { filterProfileItems, DEFAULT_PROFILE_FILTERS } from '../src/components/profileFilters.js';

test('publication lifetime uses creation time, rounds partial days up and expires at exactly 60 days', () => {
  const created = Date.parse('2026-10-02T12:00:00Z');
  const article = { created_at: new Date(created).toISOString(), updated_at: '2027-01-01', estado: 'disponible' };
  assert.equal(publicationExpiresAt(article), created + 60 * DAY_MS);
  assert.equal(publicationDaysRemaining(article, created), 60);
  assert.equal(publicationDaysRemaining(article, created + DAY_MS), 59);
  assert.equal(publicationDaysRemaining(article, created + 60 * DAY_MS - 1), 1);
  assert.equal(isPublicationExpired(article, created + 60 * DAY_MS - 1), false);
  assert.equal(isPublicationExpired(article, created + 60 * DAY_MS), true);
  assert.equal(publicationDaysRemaining(article, created + 80 * DAY_MS), 0);
  assert.equal(isPublicationUnavailable({ ...article, estado: 'reservado' }, created + 80 * DAY_MS), false);
  assert.equal(publicationDaysRemaining({ created_at: 'invalid' }, created), null);
  const expired = filterProfileItems([article], { ...DEFAULT_PROFILE_FILTERS, status: 'vencido' }, { now: created + 60 * DAY_MS });
  assert.equal(expired.length, 1);
  assert.equal(filterProfileItems([article], { ...DEFAULT_PROFILE_FILTERS, status: 'disponible' }, { now: created + 60 * DAY_MS }).length, 0);
});

test('server hides expired listings and protects timestamps, requests, reservations and available slots', async () => {
  const db = new PGlite();
  const owner = '11111111-1111-1111-1111-111111111111';
  const id = index => `00000000-0000-0000-0000-${String(index).padStart(12, '0')}`;
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql stable as
        'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
      create table public.articulos (
        id uuid primary key, owner_id uuid, usuario_id uuid, created_at timestamptz default now(),
        updated_at timestamptz, is_featured boolean default false, estado text default 'disponible',
        status text default 'disponible', mode text default 'venta', title text, category text,
        categoria text, subcategory text, subcategoria text, city text default 'Bogotá', locality text
      );
      create table public.postulaciones (articulo_id uuid, usuario_id uuid);
      grant usage on schema public, auth to anon, authenticated;
      grant select on public.articulos to anon;
      grant select, insert, update on public.articulos, public.postulaciones to authenticated;
      alter table public.articulos enable row level security;
      create policy visible on public.articulos for select using (title is distinct from 'Private');
      create policy owner_write on public.articulos for all to authenticated
        using (owner_id = auth.uid()) with check (owner_id = auth.uid());
    `);
    for (let index = 1; index <= 20; index++) {
      await db.query(`insert into public.articulos(id, owner_id, title, created_at, is_featured)
        values ($1, $2, 'Old listing', now() - interval '1441 hours', true)`, [id(index), owner]);
    }
    await db.query(`insert into public.articulos(id,owner_id,title,created_at,estado,status)
      values ($1,$2,'Old reservation',now() - interval '1441 hours','reservado','reservado')`, [id(21), owner]);
    await db.query(`insert into public.articulos(id,owner_id,title,created_at,estado,status)
      values ($1,$2,'Old paused',now() - interval '1441 hours','pausado','pausado')`, [id(22), owner]);
    await db.query(`insert into public.articulos(id,owner_id,title,created_at,estado,status)
      values ($1,$2,'Cancelable reservation',now() - interval '1441 hours','reservado','reservado')`, [id(43), owner]);
    await db.exec(await readFile(new URL('../supabase/migrations/2026-10-01-publication-limit.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../supabase/migrations/2026-10-02-publication-expiry.sql', import.meta.url), 'utf8'));
    await db.exec('set role anon');
    const page = async () => (await db.query("select home_article_page('{\"onlyActive\":false}'::jsonb,1) as result")).rows[0].result;
    assert.deepEqual(await page(), { total: 0, page: 1, ids: [], featuredIds: [] });
    await db.exec('reset role; set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    await assert.rejects(db.query("update public.articulos set created_at=now() where id=$1", [id(1)]), /fecha de creacion/);
    await assert.rejects(db.query("update public.articulos set estado='reservado',status='reservado' where id=$1", [id(1)]), /vencio/);
    await assert.rejects(db.query("update public.articulos set estado='disponible',status='disponible' where id=$1", [id(22)]), /vencio/);
    await db.query('update public.articulos set is_featured=false where id=$1', [id(1)]);
    await assert.rejects(db.query('update public.articulos set is_featured=true where id=$1', [id(1)]), /vencio/);
    await assert.rejects(db.query('insert into public.postulaciones values ($1,$2)', [id(1), owner]), /no acepta nuevas solicitudes/);
    await db.query("update public.articulos set title='Edited without renewing' where id=$1", [id(1)]);
    await db.query("update public.articulos set estado='disponible',status='disponible' where id=$1", [id(43)]);
    for (let index = 23; index <= 41; index++) {
      await db.query(`insert into public.articulos(id,owner_id,title,created_at)
        values ($1,$2,'Fresh listing',now() - interval '100 days')`, [id(index), owner]);
    }
    const created = (await db.query('select created_at from public.articulos where id=$1', [id(23)])).rows[0].created_at;
    assert.ok(Date.now() - new Date(created).getTime() < 60_000, 'Clients cannot backdate or extend creation time.');
    await assert.rejects(db.query("insert into public.articulos(id,owner_id,title) values ($1,$2,'Too many')", [id(42), owner]), /máximo de 20/);
    await db.exec('reset role; set role anon');
    assert.equal((await page()).total, 19);
    assert.equal((await page()).featuredIds.length, 0);
    await db.exec('reset role; set role authenticated');
    await db.query("update public.articulos set estado='entregado',status='entregado' where id=$1", [id(21)]);
    await db.query("insert into public.articulos(id,owner_id,title) values ($1,$2,'Freed slot')", [id(42), owner]);
    await db.exec('reset role; set role anon');
    assert.equal((await page()).total, 20);
  } finally { await db.close(); }
});
