import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';

const owner = '11111111-1111-1111-1111-111111111111';
const other = '22222222-2222-2222-2222-222222222222';
const id = index => `00000000-0000-0000-0000-${String(index).padStart(12, '0')}`;
const migration = name => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8');

async function fixture(existingExtension = false) {
  const db = new PGlite({ extensions: { unaccent } });
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql stable as
        'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
      create table public.articulos (
        id uuid primary key, created_at timestamptz default now(), is_featured boolean default false,
        usuario_id uuid, owner_id uuid, estado text default 'disponible', status text default 'disponible',
        mode text default 'venta', title text, titulo text, description text,
        category text, categoria text, subcategory text, subcategoria text,
        city text default 'Bogotá', locality text default 'Suba', estado_producto integer
      );
      create table public.postulaciones (articulo_id uuid);
      grant usage on schema public, auth to anon, authenticated;
      grant select on public.articulos to anon, authenticated;
      alter table public.articulos enable row level security;
      create policy visible on public.articulos for select using (title is distinct from 'Private');
    `);
    if (existingExtension) {
      await db.exec('create schema extensions; create extension unaccent with schema extensions');
    }
    // Preexisting rows must be indexed when the migration adds the stored vector.
    for (let index = 1; index <= 16; index++) {
      await db.query(`insert into public.articulos
        (id, created_at, is_featured, owner_id, title, description, category, subcategory, locality, mode)
        values ($1, now() - $2 * interval '1 hour', $3, $4, 'Sillón', 'De madera CÓMODA',
          'Hogar', 'Muebles', $5, $6)`,
      [id(index), index, index <= 3, index % 2 ? owner : other,
        index <= 6 ? 'Chapinero' : 'Suba', index % 2 ? 'venta' : 'donacion']);
    }
    await db.exec(await migration('2026-10-01-home-pagination'));
    await db.exec(await migration('2026-10-02-publication-expiry'));
    await db.exec('set role anon');
    const page = async (filters = {}, number = 1) => (await db.query(
      'select public.home_article_page($1::jsonb, $2) as result', [JSON.stringify(filters), number])).rows[0].result;
    const before = await page();
    await db.exec('reset role');
    await db.exec(await migration('2026-10-08-home-article-search'));
    await db.exec(await migration('2026-10-08-related-article-search'));
    await db.exec(await migration('2026-10-09-condition-filter'));
    await db.exec('set role anon');
    return { db, page, before };
  } catch (error) {
    await db.close();
    throw error;
  }
}

test('the app opts into ten mobile rows without changing other clients or bypassing filters and RLS', async () => {
  const {db,page}=await fixture();
  try {
    await db.exec('reset role');
    await db.exec(await migration('2026-10-16-home-desktop-page-size'));
    await db.exec(`update public.articulos set is_featured=false;
      insert into public.articulos(id,owner_id,title,category,estado_producto)
      select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'${owner}','Sillón','Hogar',8 from generate_series(17,76) n;
      insert into public.articulos(id,owner_id,title) values ('${id(1000)}','${owner}','Private');
      create function public.market_reuse_impact() returns jsonb language sql stable as 'select ''{}''::jsonb';`);
    await db.exec('set role anon');
    const oldMobile=await page({layout:'mobile'}),oldDesktop=await page({desktopPageSize:12});
    await db.exec('reset role');
    const sql=await migration('2026-10-30-mobile-app-page-size');
    await db.exec(sql);await db.exec(sql);
    await db.exec('set role anon');
    for (const [filters,before] of [[{layout:'mobile'},oldMobile],[{desktopPageSize:12},oldDesktop]]) {
      const {reuseImpact,...after}=await page(filters);
      assert.deepEqual(after,before);assert.deepEqual(reuseImpact,{});
    }
    const app={layout:'mobile',mobilePageRows:10,sort:'newest'};
    const pages=await Promise.all([1,2,3,4].map(number=>page(app,number)));
    assert.deepEqual(pages.map(result=>result.ids.length),[20,20,20,16]);
    const ids=pages.flatMap(result=>result.ids);
    assert.equal(new Set(ids).size,76);assert.equal(ids.includes(id(1000)),false);
    assert.equal(pages[0].pageCount,4);assert.equal((await page(app,999)).page,4);
    assert.equal((await page({...app,search:'inexistente'})).total,0);
    for(const mobilePageRows of [100000,'invalid',-1,0]) assert.equal((await page({...app,mobilePageRows})).ids.length,8);
    assert.equal((await page({desktopPageSize:12,mobilePageRows:10})).ids.length,12);
    await db.exec('reset role');
    await db.exec('update public.articulos set is_featured=true where id in ('+[1,2,3,4,5].map(n=>`'${id(n)}'`).join(',')+')');
    await db.exec('set role anon');
    const first=await page(app);
    assert.equal(first.ids.length,17);
    const mixed=[];
    for(let number=1;number<=first.pageCount;number++)mixed.push(...(await page(app,number)).ids);
    assert.equal(mixed.length,76);assert.equal(new Set(mixed).size,76);
    assert.equal((await page({...app,kind:'destacado'})).ids.length,5);
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
    await db.exec('set role authenticated');
    assert.equal((await page({...app,hideOwn:true})).total,8);
  } finally {await db.close();}
});

test('desktop can request twelve articles without gaps, duplicates or changing mobile pagination', async () => {
  const { db, page } = await fixture();
  try {
    await db.exec('reset role');
    await db.exec(await migration('2026-10-13-home-random-order'));
    await db.exec('set role anon');
    const previousMobile = await page({ layout: 'mobile', featuredSeed: 'size-test' });
    await db.exec('reset role');
    await db.exec(await migration('2026-10-16-home-desktop-page-size'));
    await db.exec('set role anon');
    for (const sort of ['random', 'newest', 'oldest']) {
      const filters = { desktopPageSize: 12, sort, featuredSeed: 'size-test' };
      const first = await page(filters);
      const second = await page(filters, 2);
      assert.equal(first.ids.length, 12);
      assert.equal(second.ids.length, 4);
      assert.equal(first.pageCount, 2);
      assert.equal(new Set([...first.ids, ...second.ids]).size, 16);
      assert.deepEqual(await page(filters, 500), second);
      const legacy = [...(await page({ ...filters, desktopPageSize: 9 })).ids,
        ...(await page({ ...filters, desktopPageSize: 9 }, 2)).ids];
      assert.deepEqual([...first.ids, ...second.ids], legacy);
    }
    assert.deepEqual(await page({ layout: 'mobile', desktopPageSize: 12, featuredSeed: 'size-test' }), previousMobile);
    assert.equal((await page({ desktopPageSize: 10000 })).ids.length, 9);
    assert.equal((await page({ desktopPageSize: 'invalid' })).ids.length, 9);
    assert.equal((await page()).ids.length, 9);
  } finally { await db.close(); }
});

test('latest catalog shuffles stably, interleaves filtered features every six normal articles and preserves group order', async () => {
  const { db, page } = await fixture();
  try {
    await db.exec('reset role');
    await db.exec(await migration('2026-10-13-home-random-order'));
    await db.exec('set role anon');
    for (const sort of ['random', 'newest', 'oldest']) {
      const filters = { sort, featuredSeed: 'visit-one' };
      const first = await page(filters);
      const second = await page(filters, 2);
      assert.deepEqual(await page(filters), first);
      assert.equal(first.ids.length, 9);
      assert.equal(second.ids.length, 7);
      assert.equal(new Set([...first.ids, ...second.ids]).size, 16);
      let base;
      if (sort === 'random') {
        base = (await db.query("select id from public.articulos order by md5(id::text || 'visit-one'), id")).rows.map(r => r.id);
      } else {
        base = Array.from({ length: 16 }, (_, i) => id(sort === 'oldest' ? 16 - i : i + 1));
      }
      const featured = base.filter(value => [id(1), id(2), id(3)].includes(value));
      const normal = base.filter(value => !featured.includes(value));
      const all = [...first.ids, ...second.ids];
      assert.deepEqual(all.filter(value => featured.includes(value)), featured);
      assert.deepEqual(all.filter(value => !featured.includes(value)), normal);
      assert.deepEqual(featured.map(value => all.indexOf(value)), [0, 7, 14]);
      assert.deepEqual(all.slice(1, 7), normal.slice(0, 6));
      assert.deepEqual(all.slice(8, 14), normal.slice(6, 12));
      const mobileFilters = { ...filters, layout: 'mobile' };
      const mobileFirst = await page(mobileFilters);
      assert.equal(mobileFirst.pageCount, 3);
      assert.equal(mobileFirst.ids.length, 7);
      assert.equal((await page(mobileFilters, 2)).ids.length, 7);
      assert.deepEqual([
        ...mobileFirst.ids, ...(await page(mobileFilters, 2)).ids, ...(await page(mobileFilters, 3)).ids,
      ], all);
      assert.equal((await page(mobileFilters, 999)).page, 3);
    }
    assert.deepEqual(await page({ featuredSeed: 'visit-one' }), await page({ sort: 'random', featuredSeed: 'visit-one' }));
    assert.notDeepEqual((await page({ featuredSeed: 'visit-one' })).ids, (await page({ featuredSeed: 'visit-two' })).ids);

    // No featured item in Suba: chronological order is untouched and unrelated features never leak.
    const noFeatured = await page({ locality: 'Suba', sort: 'oldest' });
    assert.deepEqual(noFeatured.ids, Array.from({ length: 9 }, (_, i) => id(16 - i)));
    assert.deepEqual(noFeatured.featuredIds, []);
    const mobileNoFeatured = { locality: 'Suba', sort: 'oldest', layout: 'mobile' };
    assert.equal((await page(mobileNoFeatured)).ids.length, 8);
    assert.equal((await page(mobileNoFeatured, 2)).ids.length, 2);
    assert.equal((await page(mobileNoFeatured)).pageCount, 2);
    for (const filters of [
      { locality: 'Chapinero', kind: 'venta' },
      { category: 'Hogar', subcategory: 'Muebles', search: 'sillon' },
      { kind: 'destacado' },
    ]) {
      const result = await page({ ...filters, sort: 'oldest' });
      assert.ok(result.featuredIds.includes(result.ids[0]));
    }
    for (const filters of [{ city: 'Cali' }, { category: 'Deportes' }, { search: 'bicicleta' }]) {
      assert.deepEqual((await page(filters)).ids, []);
      assert.deepEqual((await page(filters)).featuredIds, []);
    }
    await db.exec(`reset role;
      update public.articulos set estado_producto=8;
      update public.articulos set estado_producto=2 where id='${id(1)}';
      update public.articulos set title='Private' where id='${id(2)}';
      update public.articulos set estado='reservado' where id='${id(3)}';
      set role anon;`);
    const filtered = await page({ sort: 'oldest', minCondition: 7, onlyActive: true });
    assert.deepEqual(filtered.featuredIds, []);
    assert.equal(filtered.ids[0], id(16));
    const reserved = await page({ sort: 'newest', minCondition: 7, onlyActive: false });
    assert.equal(reserved.ids[0], id(3));
    assert.deepEqual(reserved.featuredIds, [id(3)]);
    await db.exec('reset role');
    await db.exec(await migration('2026-10-13-home-random-order'));
    await db.exec('set role anon');
    assert.deepEqual(await page({ sort: 'newest', minCondition: 7, onlyActive: false }), reserved);
    // Exhausted normal inventory and featured-only filters never lose or duplicate articles.
    await db.exec(`reset role;
      update public.articulos set title='Sillon', estado='disponible', estado_producto=8, is_featured=true;
      set role anon;`);
    const featuredOnly = [...(await page({ kind: 'destacado' })).ids, ...(await page({ kind: 'destacado' }, 2)).ids];
    assert.equal(new Set(featuredOnly).size, 16);
    const mobileFeatures = await page({ kind: 'destacado', layout: 'mobile' });
    assert.equal(mobileFeatures.ids.length, 4);
    assert.equal(mobileFeatures.pageCount, 4);
    const allMobileFeatures = [];
    for (let number = 1; number <= mobileFeatures.pageCount; number++) {
      allMobileFeatures.push(...(await page({ kind: 'destacado', layout: 'mobile' }, number)).ids);
    }
    assert.equal(new Set(allMobileFeatures).size, 16);
    await db.exec(`reset role;
      update public.articulos set is_featured=false where id in ('${id(15)}','${id(16)}');
      set role anon;`);
    const scarce = [...(await page({ sort: 'newest' })).ids, ...(await page({ sort: 'newest' }, 2)).ids];
    assert.equal(new Set(scarce).size, 16);
    assert.deepEqual(scarce.slice(0, 4), [id(1), id(15), id(16), id(2)]);
    const scarceMobile = await page({ sort: 'newest', layout: 'mobile' });
    assert.deepEqual(scarceMobile.ids, [id(1), id(15), id(16), id(2), id(3)]);
    assert.equal((await page({ city: 'Cali', layout: 'mobile' })).pageCount, 1);
  } finally { await db.close(); }
});

test('home search requires all word prefixes across fields and preserves pagination and featured ordering', async () => {
  const { db, page, before } = await fixture();
  try {
    assert.deepEqual(await page(), before);
    const filters = { search: '  COMODA\tSiLlOn\nMADERA hogar muebles  ' };
    const first = await page(filters);
    const second = await page(filters, 2);
    assert.deepEqual(first, before);
    assert.equal(second.total, 16);
    assert.equal(second.ids.length, 7);
    assert.equal(first.ids.some(value => second.ids.includes(value)), false);
    assert.deepEqual(first.featuredIds, second.featuredIds);
    assert.equal(first.featuredIds.length, 3);
    assert.equal((await page(filters, 500)).page, 2);
    assert.equal((await page(filters, -1)).page, 1);
    assert.deepEqual((await page({ ...filters, sort: 'oldest' })).ids,
      Array.from({ length: 9 }, (_, index) => id(16 - index)));
    assert.equal((await page({ search: 'SILLÓN CÓMODA' })).total, 16);
    assert.equal((await page({ search: 'de' })).total, 16);
    assert.equal((await page({ search: 'sillon inexistente' })).total, 0);
    assert.equal((await page({ search: 'sill' })).total, 16);
    assert.deepEqual(await page({ search: '\t\n ' }), before);
    assert.deepEqual(await page({ search: null }), before);
    for (const search of ['%', '_', "' & | ! :*", "sillon' OR '1'='1"]) {
      assert.deepEqual(await page({ search }, 4), { total: 0, page: 1, ids: [], featuredIds: [] });
    }
    assert.equal((await page({ ...filters, locality: 'Chapinero' })).total, 6);
    assert.equal((await page({ ...filters, locality: 'Chapinero', kind: 'venta' })).total, 3);
    assert.equal((await page({ ...filters, category: ' hogar ', subcategory: ' muebles ' })).total, 16);
    assert.equal((await page({ ...filters, category: 'Otro' })).total, 0);
    assert.equal((await page({ ...filters, subcategory: 'Otro' })).total, 0);
    assert.equal((await page({ ...filters, city: 'Cali' })).total, 0);
    assert.equal((await page({ ...filters, kind: 'destacado' })).total, 3);
    const seed = { ...filters, featuredSeed: 'rotation' };
    assert.deepEqual((await page(seed)).featuredIds, (await page(seed, 2)).featuredIds);
    await db.exec('reset role');
    const expectedFeatured = (await db.query(`select id from public.articulos where is_featured
      order by md5(id::text || 'rotation') limit 12`)).rows.map(row => row.id);
    await db.exec('set role anon');
    assert.deepEqual((await page(seed)).featuredIds, expectedFeatured);
  } finally { await db.close(); }
});

test('prefix search matches bicicleta and normalizes accents and punctuation without query operators', async () => {
  const { db, page } = await fixture();
  try {
    await db.exec(`reset role;
      insert into public.articulos (id, title, description, category, subcategory)
        values ('${id(20)}', 'Bicicleta', 'ELÉCTRICA cómoda', 'Deportes', 'Ciclismo'),
          ('${id(21)}', 'Bicicleta', 'Manual', 'Deportes', 'Ciclismo');
      set role anon;
    `);
    assert.deepEqual((await page({ search: 'bici' })).ids, [id(20), id(21)]);
    for (const search of ['bici elec', 'ELEC BÍCI', '  ¡BÍCI!, ELÉC. ', 'bici, cómoda; dep cic', 'bici bici elec']) {
      assert.deepEqual((await page({ search })).ids, [id(20)], search);
    }
    assert.equal((await page({ search: 'cicle' })).total, 0);
    assert.equal((await page({ search: 'bici inexistente' })).total, 0);
    assert.equal((await page({ search: 'bici | sillon' })).total, 0, 'An operator cannot turn AND into OR');
    assert.equal((await page({ search: 'bici OR sillon' })).total, 0);
    assert.equal((await page({ search: 'bici !manual' })).total, 1, 'Negation is treated as punctuation');
    for (const search of ["bici'", 'bici:*', '"bici"', 'bici &']) {
      assert.deepEqual((await page({ search })).ids, [id(20), id(21)], search);
    }
    for (const search of ["' & | ! :*", 'https://example.com/bici', String.raw`bici\inexistente`]) {
      assert.equal((await page({ search })).total, 0, search);
    }
    await db.exec('reset role; set enable_seqscan = off');
    const plan = await db.query(`explain (format json) select id from public.articulos
      where home_search_document @@ 'bici:* & elec:*'::tsquery`);
    assert.match(JSON.stringify(plan.rows), /articulos_home_search_gin/);
  } finally { await db.close(); }
});

test('related search includes cycling accessories, prioritizes direct matches and keeps other filters', async () => {
  const { db, page } = await fixture();
  try {
    await db.exec(`reset role;
      insert into public.articulos (id, title, description, category, subcategory, created_at)
        values ('${id(20)}', 'Bicicleta', 'Manual', 'Deportes', 'Ciclismo', now() - interval '1 hour'),
          ('${id(21)}', 'Casco', 'Proteccion para ciclistas', 'Deportes', 'Accesorios', now()),
          ('${id(22)}', 'Casco de moto', 'Proteccion', 'Movilidad', 'Motos', now()),
          ('${id(23)}', 'Inflador', 'Compacto', 'Deportes', 'Ciclismo', now());
      set role anon;`);
    for (const search of ['bicicleta', 'BÍCI', 'bic', 'ciclismo']) {
      const result = await page({ search, searchMode: 'related' });
      assert.equal(result.total, 3, search);
      assert.equal(result.ids.includes(id(22)), false);
    }
    assert.equal((await page({ search: 'bicicleta', searchMode: 'related' })).ids[0], id(20));
    assert.deepEqual((await page({ search: 'bicicleta', searchMode: 'specific' })).ids, [id(20)]);
    assert.deepEqual((await page({ search: 'bici protec', searchMode: 'related' })).ids, [id(21)]);
    assert.equal((await page({ search: 'bici inexistente', searchMode: 'related' })).total, 0);
    assert.equal((await page({ search: 'bici', searchMode: 'related', city: 'Cali' })).total, 0);
    assert.deepEqual((await page({ search: 'bici', searchMode: 'related', subcategory: 'Accesorios' })).ids, [id(21)]);
    assert.equal((await page({ search: "' & | ! :*", searchMode: 'related' })).total, 0);
    assert.deepEqual(await page({ searchMode: 'related' }), await page());
  } finally { await db.close(); }
});

test('condition minimum filters before pagination, counts and featured results and includes unknowns only at zero', async () => {
  const { db, page } = await fixture();
  try {
    await db.exec(`reset role;
      update public.articulos set estado_producto = case
        when id <= '${id(12)}' then 8
        when id = '${id(13)}' then 10
        when id = '${id(14)}' then 6
        when id = '${id(15)}' then 1 else null end;
      update public.articulos set is_featured = true where id = '${id(14)}';
      set role anon;`);
    const all = await page();
    assert.deepEqual(await page({ minCondition: 0 }), all);
    assert.deepEqual(await page({ minCondition: -1 }), all);
    const first = await page({ minCondition: 7 });
    const second = await page({ minCondition: 7 }, 2);
    assert.equal(first.total, 13);
    assert.equal(first.ids.length, 9);
    assert.equal(second.ids.length, 4);
    assert.equal(second.page, 2);
    assert.equal(first.featuredIds.includes(id(14)), false);
    assert.deepEqual((await page({ minCondition: 9 })).ids, [id(13)]);
    assert.deepEqual(await page({ minCondition: 11 }), await page({ minCondition: 10 }));
    assert.equal((await page({ minCondition: 1 })).total, 15);
    assert.equal((await page({ minCondition: 7, locality: 'Chapinero' })).total, 6);
    assert.equal((await page({ minCondition: 7, search: 'sill' })).total, 13);
    assert.equal((await page({ minCondition: 7, city: 'Cali' })).total, 0);
    await db.exec(`reset role; update public.articulos set title = 'Private' where id = '${id(13)}'; set role anon;`);
    assert.equal((await page({ minCondition: 9 })).total, 0);
    await db.exec('reset role');
    await db.exec(await migration('2026-10-09-condition-filter'));
    await db.exec('set role anon');
    assert.equal((await page({ minCondition: 7 })).total, 12);
  } finally { await db.close(); }
});

test('search migration can be reapplied without recreating dictionary, config, column or index', async () => {
  const { db, page } = await fixture(true);
  try {
    const filters = { search: 'sill com', featuredSeed: 'reapply' };
    const before = await page(filters);
    await db.exec('reset role');
    const objects = async () => (await db.query(`select
      'public.article_unaccent'::regdictionary::oid as dictionary,
      'public.article_search'::regconfig::oid as config,
      'public.articulos_home_search_gin'::regclass::oid as index,
      (select relfilenode from pg_class where oid = 'public.articulos_home_search_gin'::regclass) as index_file,
      (select attnum from pg_attribute where attrelid = 'public.articulos'::regclass
        and attname = 'home_search_document') as column_number,
      (select array_agg(row(m.maptokentype, m.mapseqno, m.mapdict)::text order by m.maptokentype, m.mapseqno)
        from pg_ts_config_map m where m.mapcfg = 'public.article_search'::regconfig) as mappings
    `)).rows[0];
    const originalObjects = await objects();
    await db.exec(await migration('2026-10-08-home-article-search'));
    assert.deepEqual(await objects(), originalObjects);
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      assert.deepEqual(await page(filters), before);
      await db.exec('reset role');
    }
    await db.exec(`update public.articulos set description = 'Bicicleta eléctrica' where id = '${id(1)}';
      set role anon;`);
    assert.deepEqual((await page({ search: 'bici elec' })).ids, [id(1)]);
  } finally { await db.close(); }
});

test('home search keeps expiry and RLS for anonymous users, owners and other authenticated users', async () => {
  const { db, page } = await fixture(true);
  try {
    await db.exec(`reset role;
      update public.articulos set estado = 'reserved' where id = '${id(1)}';
      update public.articulos set estado = '', status = 'delivered' where id = '${id(2)}';
      update public.articulos set estado = 'pausado' where id = '${id(3)}';
      update public.articulos set title = 'Private' where id = '${id(4)}';
      begin;
      insert into public.articulos (id, title, description, created_at, is_featured)
        values ('${id(17)}', 'Sillón', 'madera cómoda', now() - interval '1440 hours', true),
          ('${id(18)}', 'Sillón', 'madera cómoda', now() - interval '1441 hours', true);
    `);
    for (const uid of ['', owner, other]) {
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
      await db.exec(uid ? 'set role authenticated' : 'set role anon');
      const filters = { search: 'madera comoda' };
      const active = await page(filters);
      const reserved = await page({ ...filters, onlyActive: false });
      assert.equal(active.total, 12);
      assert.equal(reserved.total, 13);
      assert.deepEqual(active.featuredIds, []);
      assert.deepEqual(reserved.featuredIds, [id(1)]);
      for (const hidden of [2, 3, 4, 17, 18]) {
        assert.equal(reserved.ids.includes(id(hidden)), false);
        assert.equal(reserved.featuredIds.includes(id(hidden)), false);
      }
      assert.equal((await page({ ...filters, hideOwn: true })).total, uid ? 6 : 12);
      assert.equal((await page({ search: 'Private', onlyActive: false })).total, 0);
      await db.exec('reset role');
    }
    await db.exec('commit');
    const security = (await db.query(`select prosecdef from pg_proc
      where oid = 'public.home_article_page(jsonb,integer)'::regprocedure`)).rows[0];
    assert.equal(security.prosecdef, false);
  } finally { await db.close(); }
});

test('stored search vector handles nulls, legacy labels and writes and has a usable GIN index', async () => {
  const { db, page } = await fixture();
  try {
    await db.exec(`reset role;
      insert into public.articulos (id, titulo, categoria, subcategoria)
        values ('${id(20)}', 'ÁRBOL', 'Jardín', 'Decoración');
      insert into public.articulos (id) values ('${id(21)}');
      set role anon;
    `);
    assert.deepEqual((await page({ search: 'arbol jardin decoracion' })).ids, [id(20)]);
    await db.exec(`reset role;
      update public.articulos set titulo = null, description = 'Pingüino azul' where id = '${id(20)}';
      set role anon;
    `);
    assert.equal((await page({ search: 'arbol' })).total, 0);
    assert.deepEqual((await page({ search: 'PINGUINO AZUL' })).ids, [id(20)]);
    await db.exec('reset role; set enable_seqscan = off');
    const plan = await db.query(`explain (format json) select id from public.articulos
      where home_search_document @@ plainto_tsquery('public.article_search', 'sillon madera')`);
    assert.match(JSON.stringify(plan.rows), /articulos_home_search_gin/);
    const column = (await db.query(`select attgenerated from pg_attribute
      where attrelid = 'public.articulos'::regclass and attname = 'home_search_document'`)).rows[0];
    assert.equal(column.attgenerated, 's');
  } finally { await db.close(); }
});
