import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { paginateProfileItems } from '../src/components/profilePageData.js';
import { filterProfileItems, DEFAULT_PROFILE_FILTERS } from '../src/components/profileFilters.js';

test('profile lists have at most five entries and clamp empty or shrinking pages', () => {
  const items = Array.from({ length: 12 }, (_, id) => ({ id: String(id) }));
  assert.equal(paginateProfileItems(items).items.length, 5);
  assert.deepEqual(paginateProfileItems(items, 2).items, items.slice(5, 10));
  assert.deepEqual(paginateProfileItems(items, 3).items, items.slice(10));
  assert.equal(paginateProfileItems(items, 100).page, 3);
  assert.equal(paginateProfileItems(items.slice(0, 4), 3).page, 1);
  assert.deepEqual(paginateProfileItems([], 2), { page: 1, pages: 1, total: 0, items: [] });
  assert.equal(paginateProfileItems(items, -1).page, 1);
  assert.equal(items.length, 12);
});

test('ratings are prioritized before pagination and move to the last page after rating', () => {
  const items = Array.from({ length: 10 }, (_, id) => ({ id: String(id), estado: 'disponible' }));
  items.push({ id: 'pending', estado: 'entregado', mode: 'venta', buyer_id: 'buyer' });
  const pending = filterProfileItems(items, DEFAULT_PROFILE_FILTERS);
  assert.equal(paginateProfileItems(pending).items[0].id, 'pending');
  const rated = filterProfileItems(items, DEFAULT_PROFILE_FILTERS, { rated: new Set(['pending']) });
  assert.equal(paginateProfileItems(rated, 3).items[0].id, 'pending');
});

test('server allows 20 live publications per owner and delivered history frees a slot', async () => {
  const db = new PGlite();
  const owner = '11111111-1111-1111-1111-111111111111';
  const other = '22222222-2222-2222-2222-222222222222';
  try {
    await db.exec(`create role anon; create role authenticated;
      create table public.articulos (id integer primary key, owner_id uuid not null, estado text, status text, title text);
      alter table public.articulos enable row level security;
      create policy visible on public.articulos for select using (false);
      create policy write_articles on public.articulos for insert with check (true);
      grant usage on schema public to authenticated;
      grant select, insert on public.articulos to authenticated;`);
    await db.exec(await readFile(new URL('../supabase/migrations/2026-10-01-publication-limit.sql', import.meta.url), 'utf8'));
    const insert = (id, user = owner, state = 'disponible', status = 'disponible') => db.query(
      'insert into public.articulos (id, owner_id, estado, status) values ($1, $2, $3, $4)', [id, user, state, status]);
    for (let id = 1; id <= 20; id++) {
      await insert(id, owner, ['disponible', 'reservado', 'pausado', 'en_revision'][id % 4]);
    }
    await db.exec('set role authenticated');
    await assert.rejects(insert(21), /máximo de 20/);
    await db.exec('reset role');
    await insert(22, other);
    await insert(23, owner, 'entregado');
    await insert(24, owner, '', 'delivered');
    await db.exec("update public.articulos set title = 'Edited' where id = 1");
    await assert.rejects(db.exec("update public.articulos set estado = 'disponible' where id = 23"), /máximo de 20/);
    await assert.rejects(db.query('update public.articulos set owner_id = $1 where id = 22', [owner]), /máximo de 20/);
    await db.exec("update public.articulos set estado = 'entregado' where id = 1");
    await insert(25);
    await assert.rejects(insert(26), /máximo de 20/);
    await db.exec('delete from public.articulos where id = 2');
    await insert(27);
    assert.equal((await db.query("select count(*)::integer as n from public.articulos where owner_id = $1 and coalesce(nullif(estado, ''), status) not in ('entregado', 'delivered')", [owner])).rows[0].n, 20);
  } finally { await db.close(); }
});
