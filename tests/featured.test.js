import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { orderFeaturedItems } from '../src/components/featuredOrder.js';

test('featured order stays stable with refreshed items and normal-list sorting', () => {
  const items = Array.from({ length: 12 }, (_, id) => ({ id: String(id), title: 'before' }));
  const ids = list => list.map(item => item.id);
  const ordered = orderFeaturedItems(items, 123);
  assert.deepEqual(ids(ordered), ids(orderFeaturedItems([...items].reverse(), 123)));
  assert.notDeepEqual(ids(ordered), ids(orderFeaturedItems(items, 456)));
  const refreshed = orderFeaturedItems(items.map(item => ({ ...item, title: 'updated' })), 123);
  assert.equal(refreshed[0].title, 'updated');
  assert.deepEqual(ids(orderFeaturedItems([{ id: 'new-category' }], 123)), ['new-category']);
  assert.deepEqual(ids(items), Array.from({ length: 12 }, (_, i) => String(i)));
});

test('highlighting validates ownership and charges exactly one credit atomically', async () => {
  const db = new PGlite();
  const owner = '11111111-1111-1111-1111-111111111111';
  const other = '22222222-2222-2222-2222-222222222222';
  const article = '33333333-3333-3333-3333-333333333333';
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql stable as
        'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
      create table public.usuarios (id uuid primary key, is_blocked boolean default false, bloqueado boolean default false);
      create table public.articulos (id uuid primary key, owner_id uuid, is_featured boolean default false, updated_at timestamptz);
      create table public.cupos (usuario_id uuid primary key, saldo integer, updated_at timestamptz);
      create table public.cupos_historial (usuario_id uuid, cantidad integer, concepto text, referencia_id uuid);
      insert into public.usuarios(id) values ('${owner}'), ('${other}');
      insert into public.articulos values ('${article}', '${owner}', false, now());
      insert into public.cupos values ('${owner}', 2, now());
    `);
    await db.exec(await readFile(new URL('../supabase/migrations/2026-10-01-feature-article.sql', import.meta.url), 'utf8'));
    const asUser = uid => db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
    const feature = async () => (await db.query('select public.feature_article($1::uuid) as result', [article])).rows[0].result;
    await asUser(other);
    await assert.rejects(feature(), /Solo puedes destacar/);
    await asUser(owner);
    assert.equal((await feature()).balance, 1);
    assert.equal((await feature()).balance, 1);
    assert.equal((await db.query('select * from public.cupos_historial')).rows.length, 1);
    await db.exec('update public.articulos set is_featured = false; update public.cupos set saldo = 0;');
    await assert.rejects(feature(), /creditos suficientes/);
    assert.equal((await db.query('select is_featured from public.articulos')).rows[0].is_featured, false);
    await db.exec('update public.cupos set saldo = 2; alter table public.cupos_historial add constraint fail_history check (false) not valid;');
    await assert.rejects(feature(), /fail_history/);
    assert.equal((await db.query('select saldo from public.cupos')).rows[0].saldo, 2);
    assert.equal((await db.query('select is_featured from public.articulos')).rows[0].is_featured, false);
    await asUser('');
    await assert.rejects(feature(), /iniciar sesion/);
  } finally { await db.close(); }
});
