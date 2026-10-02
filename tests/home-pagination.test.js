import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('home pagination filters before counting, keeps featured separate and respects RLS', async () => {
  const db = new PGlite();
  const owner = '11111111-1111-1111-1111-111111111111';
  const buyer = '22222222-2222-2222-2222-222222222222';
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql stable as
        'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
      create table public.articulos (
        id uuid primary key, created_at timestamptz, is_featured boolean,
        usuario_id uuid, owner_id uuid, ganador_id uuid, winner_id uuid, recipient_id uuid,
        buyer_id uuid, estado text, status text, mode text, title text,
        category text, categoria text, subcategory text, subcategoria text,
        city text, locality text
      );
      grant usage on schema public, auth to anon, authenticated;
      grant select on public.articulos to anon, authenticated;
      alter table public.articulos enable row level security;
      create policy visible on public.articulos for select using (title <> 'Private');
    `);
    await db.exec(await readFile(new URL('../supabase/migrations/2026-10-01-home-pagination.sql', import.meta.url), 'utf8'));
    for (let index = 1; index <= 16; index++) {
      await db.query(`insert into public.articulos
        (id, created_at, is_featured, owner_id, estado, status, mode, title, category, subcategory, city, locality)
        values ($1, $2, $3, $4, 'disponible', 'disponible', $5, $6, 'Hogar', 'Muebles', 'Bogotá', $7)`,
      [`00000000-0000-0000-0000-${String(index).padStart(12, '0')}`, `2026-09-${String(index).padStart(2, '0')}T12:00:00Z`,
        index <= 3, index % 2 ? owner : buyer, index % 2 ? 'venta' : 'donacion', `Silla ${index}`, index <= 6 ? 'Chapinero' : 'Suba']);
    }
    await db.exec('set role anon');
    const page = async (filters = {}, number = 1) => (await db.query(
      'select public.home_article_page($1::jsonb, $2) as result', [JSON.stringify(filters), number])).rows[0].result;
    const first = await page();
    const second = await page({}, 2);
    assert.equal(first.total, 16);
    assert.equal(first.ids.length, 9);
    assert.equal(second.ids.length, 7);
    assert.equal(first.ids.some(id => second.ids.includes(id)), false);
    assert.deepEqual(first.featuredIds, second.featuredIds);
    assert.equal(first.featuredIds.length, 3);
    assert.equal(first.ids.some(id => first.featuredIds.includes(id)), false);
    assert.equal((await page({}, 500)).page, 2);
    assert.equal((await page({}, -1)).page, 1);
    assert.equal((await page({ locality: 'Chapinero' })).total, 6);
    assert.equal((await page({ locality: 'Chapinero', kind: 'venta' })).total, 3);
    assert.equal((await page({ search: 'SILLA', category: ' hogar ' })).total, 16);
    assert.equal((await page({ search: '%' })).total, 0);
    assert.equal((await page({ search: 'missing' }, 4)).page, 1);
    const oldest = await page({ sort: 'oldest' });
    assert.equal(oldest.ids[0], second.ids.at(-1));
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [owner]);
    assert.equal((await page({ hideOwn: true })).total, 8);
    await db.exec('reset role');
    await db.exec(`update public.articulos set estado = 'reservado', buyer_id = '${buyer}' where title = 'Silla 1';
      update public.articulos set estado = 'entregado', buyer_id = '${buyer}' where title = 'Silla 3';
      update public.articulos set estado = 'pausado' where title = 'Silla 5';
      update public.articulos set title = 'Private' where title = 'Silla 7';`);
    await db.exec('set role anon');
    assert.equal((await page()).total, 12); // Delivered excluded even for its owner.
    assert.equal((await page({ onlyActive: false })).total, 13);
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
    assert.equal((await page()).total, 12);
    assert.equal((await page({ onlyActive: false })).total, 13);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [buyer]);
    assert.equal((await page()).total, 12);
    assert.equal((await page({ onlyActive: false })).total, 13);
    await db.exec('reset role');
    await db.exec("update public.articulos set estado = 'reserved', status = 'reservado' where title = 'Silla 2'");
    await db.exec(`update public.articulos set estado = '', status = 'delivered',
      ganador_id = '${owner}', is_featured = true where title = 'Silla 4'`);
    const reservedSale = '00000000-0000-0000-0000-000000000001';
    const reservedDonation = '00000000-0000-0000-0000-000000000002';
    for (const uid of ['', owner, buyer, '44444444-4444-4444-4444-444444444444']) {
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
      await db.exec(uid ? 'set role authenticated' : 'set role anon');
      const filters = { locality: 'Chapinero' };
      const active = await page({ ...filters, onlyActive: true });
      const includingReserved = await page({ ...filters, onlyActive: false });
      for (const delivered of ['00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004']) {
        assert.equal(includingReserved.ids.includes(delivered), false);
        assert.equal(includingReserved.featuredIds.includes(delivered), false);
      }
      for (const search of ['Silla 3', 'Silla 4']) {
        const deliveredSearch = await page({ search, onlyActive: false });
        assert.equal(deliveredSearch.total, 0);
        assert.deepEqual(deliveredSearch.ids, []);
        assert.deepEqual(deliveredSearch.featuredIds, []);
      }
      assert.equal(includingReserved.total - active.total, 2);
      for (const id of [reservedSale, reservedDonation]) {
        assert.equal(active.ids.includes(id), false);
        assert.equal(includingReserved.ids.includes(id), true);
        assert.equal(active.featuredIds.includes(id), false);
        assert.equal(includingReserved.featuredIds.includes(id), true);
      }
      assert.equal((await page({ ...filters, onlyActive: true, kind: 'venta' })).ids.includes(reservedSale), false);
      assert.equal((await page({ ...filters, onlyActive: false, kind: 'venta' })).ids.includes(reservedSale), true);
      await db.exec('reset role');
    }
    await db.exec('reset role');
    await db.exec('delete from public.articulos where created_at > \'2026-09-09\'');
    await db.exec('set role anon');
    assert.equal((await page({}, 2)).page, 1);
  } finally { await db.close(); }
});
