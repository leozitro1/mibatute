import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createLocationCatalog } from '../src/data/locationCatalog.js';
import { publicationStepError } from '../src/components/publicationSteps.js';
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

test('shared location reads coalesce, cache for five minutes and retain last good data on failure', async () => {
  let clock = 1000, calls = 0, bad = false;
  const rows = [{ city: 'Ciudad nueva', localities: ['Centro'] }];
  const catalog = createLocationCatalog({ rpc: async name => {
    assert.equal(name, 'market_location_catalog'); calls++;
    return bad ? { error: new Error('Offline') } : { data: rows };
  } }, () => clock);
  let updates = 0;
  const unsubscribe = catalog.subscribe(() => updates++);
  await Promise.all([catalog.refresh(), catalog.refresh(), catalog.refresh()]);
  assert.equal(calls, 1); assert.equal(updates, 1);
  await catalog.refresh(); assert.equal(calls, 1);
  assert.deepEqual(catalog.getSnapshot().LOCATIONS['Ciudad nueva'], ['Centro']);
  const draft = { selectedMode: 'donacion', formData: { city: 'Ciudad nueva', locality: 'Centro' }, locations: catalog.getSnapshot().LOCATIONS };
  assert.equal(publicationStepError(3, draft), '');
  assert.match(publicationStepError(3, { ...draft, formData: { ...draft.formData, locality: 'Suba' } }), /localidad/);
  bad = true; clock += 300001;
  await assert.rejects(catalog.refresh(), /Offline/);
  assert.deepEqual(catalog.getSnapshot().COLOMBIA_DATA, rows);
  await catalog.refresh(); assert.equal(calls, 2);
  bad = false; await catalog.refresh(true); assert.equal(calls, 3);
  unsubscribe();
});

test('an explicit refresh after a save cannot reuse an older in-flight catalog response', async () => {
  let release, calls = 0;
  const waiting = new Promise(resolve => { release = resolve; });
  const catalog = createLocationCatalog({ rpc: async () => {
    const call = ++calls;
    if (call === 1) await waiting;
    return { data: [{ city: 'Bogotá', localities: call === 1 ? ['Suba'] : ['Suba', 'Nueva zona'] }] };
  } });
  const initial = catalog.refresh(), saved = catalog.refresh(true);
  release(); await Promise.all([initial, saved]);
  assert.equal(calls, 2);
  assert.deepEqual(catalog.getSnapshot().LOCATIONS['Bogotá'], ['Suba', 'Nueva zona']);
});

test('location database preserves seeds, requires a live master MFA session and saves changes atomically', async t => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
      create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
      create function auth.jwt() returns jsonb language sql stable as 'select coalesce(nullif(current_setting(''request.jwt.claims'',true),''''),''{}'')::jsonb';
      create table auth.sessions(id uuid,user_id uuid);create table auth.mfa_factors(user_id uuid,status text,factor_type text);
      create table usuarios(id uuid,is_blocked boolean default false,bloqueado boolean default false,ban_until timestamptz,ciudad text,localidad text);
      create table staff_accounts(user_id uuid,role text,active boolean default true,permissions text[] default '{}');
      create table staff_sessions(session_id uuid,user_id uuid,revoked_at timestamptz,expires_at timestamptz,last_seen_at timestamptz);
      create table staff_audit(actor_id uuid,action text,target_id uuid,reason text,changes jsonb);
      create table articulos(id uuid primary key,city text,locality text,title text);
      create table staff_publication_history(city text,locality text);
      create table market_daily_metrics(city text,locality text);
      create table patrocinadores(target_locations jsonb default '[]');
      grant usage on schema public,auth to anon,authenticated;`);
    const source = await readFile(new URL('../supabase/migrations/2026-10-14-staff-console.sql', import.meta.url), 'utf8');
    for (const name of ['staff_permission', 'staff_require']) {
      const start = source.indexOf(`create or replace function public.${name}(`);
      await db.exec(source.slice(start, source.indexOf('$$;', start) + 3));
    }
    for (const [n, role, permissions] of [[1, 'master', []], [2, 'admin', ['team', 'users']]]) {
      await db.query('insert into usuarios(id) values($1)', [id(n)]);
      await db.query('insert into staff_accounts(user_id,role,permissions) values($1,$2,$3)', [id(n), role, permissions]);
      await db.query('insert into auth.sessions values($1,$2)', [id(n + 100), id(n)]);
      await db.query("insert into auth.mfa_factors values($1,'verified','totp')", [id(n)]);
      await db.query("insert into staff_sessions values($1,$2,null,now()+interval '8 hours',now())", [id(n + 100), id(n)]);
    }
    const migration = await readFile(new URL('../supabase/migrations/2026-10-21-location-catalog.sql', import.meta.url), 'utf8');
    await db.exec(migration); await db.exec(migration);
    const editing = await readFile(new URL('../supabase/migrations/2026-10-21-location-editing.sql', import.meta.url), 'utf8');
    await db.exec(editing); await db.exec(editing);
    const asUser = async (n, aal = 'aal2') => {
      await db.exec(n ? 'reset role;set role authenticated' : 'reset role;set role anon');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [n ? id(n) : '']);
      await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ aal, session_id: id((n || 0) + 100) })]);
    };
    const catalog = async () => (await db.query('select market_location_catalog() r')).rows[0].r;
    const staff = async () => (await db.query('select staff_location_catalog() r')).rows[0].r;
    const save = async (action, city = null, name = null, locality = null) => (await db.query('select staff_location_save($1,$2,$3,$4) r', [action, city, name, locality])).rows[0].r;
    await t.test('public readers see only geographic metadata, with no direct table or staff access', async () => {
      await asUser(null); const rows = await catalog();
      assert.deepEqual(rows.filter(row => row.active).map(row => row.city), ['Bogotá']);
      assert.equal(rows.length, 4); assert.equal(rows.every(row => !('id' in row)), true); assert.equal(rows[0].localities.length, 20);
      await assert.rejects(staff(), /permission denied/);
      await assert.rejects(save('add_city', null, 'Prueba', 'Centro'), /permission denied/);
      await assert.rejects(db.exec('select * from market_cities'), /permission denied/);
      await assert.rejects(db.exec("insert into market_localities(city_id,name) values(null,'Fraude')"), /permission denied/);
    });
    await t.test('admins cannot write even if their permission list includes team; master requires MFA', async () => {
      for (const [n, aal] of [[2, 'aal2'], [3, 'aal2'], [1, 'aal1']]) {
        await asUser(n, aal); await assert.rejects(staff(), /Acceso no autorizado/);
        await assert.rejects(save('add_city', null, 'Prueba', 'Centro'), /Acceso no autorizado/);
      }
    });
    await t.test('add city/locality, activate preconfigured city and publish with exact canonical names', async () => {
      await asUser(1); const rows = await save('add_city', null, '  Bucaramanga  ', '  Cabecera  ');
      const city = rows.find(row => row.city === 'Bucaramanga'); assert.ok(city.active);
      assert.deepEqual(city.localities, ['Cabecera']);
      const updated = await save('add_locality', city.id, 'Centro');
      assert.deepEqual(updated.find(row => row.id === city.id).localities, ['Cabecera', 'Centro']);
      const medellin = rows.find(row => row.city === 'Medellín'); assert.equal(medellin.active, false);
      await save('activate_city', medellin.id); await save('activate_city', medellin.id);
      await asUser(null); assert.deepEqual((await catalog()).filter(row => row.active).map(row => row.city), ['Bogotá', 'Medellín', 'Bucaramanga']);
      await db.exec('reset role');
      assert.equal((await db.query('select count(*)::int n from staff_audit')).rows[0].n, 3);
      await db.exec(editing);
      await asUser(1); assert.equal((await staff()).find(row => row.city === 'Medellín').active, true);
    });
    await t.test('deactivation is reversible, keeps localities and cannot disable the last active city', async () => {
      await asUser(1); const initial = await staff();
      const medellin = initial.find(row => row.city === 'Medellín'), bogota = initial.find(row => row.city === 'Bogotá');
      const bucaramanga = initial.find(row => row.city === 'Bucaramanga');
      await db.exec('reset role');
      await db.query('insert into articulos values($1,$2,$3,$4)', [id(500), 'Medellín', 'El Poblado', 'Existente']);
      await asUser(1);
      await save('deactivate_city', medellin.id); await save('deactivate_city', bucaramanga.id);
      await assert.rejects(save('deactivate_city', bogota.id), /al menos una ciudad activa/);
      const inactive = (await staff()).find(row => row.id === medellin.id);
      assert.equal(inactive.active, false); assert.deepEqual(inactive.localities, medellin.localities);
      await asUser(null); const publicRows = await catalog();
      assert.deepEqual(publicRows.filter(row => row.active).map(row => row.city), ['Bogotá']);
      const publicCatalog = createLocationCatalog({ rpc: async () => ({ data: publicRows }) });
      await publicCatalog.refresh(); assert.equal(publicCatalog.getSnapshot().LOCATIONS['Medellín'], undefined);
      assert.equal(publicCatalog.getSnapshot().COLOMBIA_DATA.length, 5);
      await db.exec('reset role');
      await assert.rejects(db.query('insert into articulos values($1,$2,$3,$4)', [id(501), 'Medellín', 'El Poblado', 'Nueva']), /ciudad activa/);
      await assert.rejects(db.query('insert into articulos values($1,$2,$3,$4)', [id(501), 'Bogotá', 'Localidad inventada', 'Nueva']), /localidad (válida|disponible)/);
      await db.query('update articulos set title=$1,city=city,locality=locality where id=$2', ['Existente editada', id(500)]);
      assert.equal((await db.query('select title from articulos where id=$1', [id(500)])).rows[0].title, 'Existente editada');
      await asUser(1); await save('activate_city', medellin.id);
      assert.equal((await staff()).find(row => row.id === medellin.id).active, true);
      await db.exec('reset role');
      await db.query('insert into articulos values($1,$2,$3,$4)', [id(501), 'Medellín', 'El Poblado', 'Nueva']);
      await asUser(1);
    });
    await t.test('duplicates, blank names and invalid cities never create partial entries', async () => {
      await asUser(1); const before = await staff(), bogota = before.find(row => row.city === 'Bogotá');
      await assert.rejects(save('add_city', null, 'bOgOtA', 'Nueva'), /Ya existe/);
      await assert.rejects(save('add_locality', bogota.id, 'ciudad  bolivar'), /Ya existe/);
      await assert.rejects(save('add_city', null, 'Nueva ciudad', ' '), /primera localidad/);
      await assert.rejects(save('add_city', null, 'Nueva\nciudad', 'Centro'), /sin saltos/);
      await assert.rejects(save('add_locality', id(999), 'Centro'), /ciudad válida/);
      await assert.rejects(save('remove_city', bogota.id), /Acción no válida/);
      assert.deepEqual(await staff(), before);
    });
    const edit = async (city, action, zone = null, name = null) => (await db.query('select staff_location_edit($1,$2,$3,$4) r', [city, action, zone, name])).rows[0].r;
    await t.test('retiring and restoring localities preserves old listings while selectors and new listings use available zones', async () => {
      await asUser(1); const medellin = (await staff()).find(row => row.city === 'Medellín');
      const zone = medellin.locality_details.find(row => row.name === 'El Poblado');
      const removed = await edit(medellin.id, 'remove_locality', zone.id);
      assert.equal(removed.find(row => row.id === medellin.id).localities.includes(zone.name), false);
      assert.equal(removed.find(row => row.id === medellin.id).locality_details.find(row => row.id === zone.id).active, false);
      await asUser(null); const rows = await catalog();
      const store = createLocationCatalog({ rpc: async () => ({ data: rows }) }); await store.refresh();
      assert.equal(store.getSnapshot().LOCATIONS['Medellín'].includes(zone.name), false);
      assert.equal(store.getSnapshot().COLOMBIA_DATA.find(row => row.city === 'Medellín').localities.includes(zone.name), true);
      await db.exec('reset role');
      await assert.rejects(db.query('insert into articulos values($1,$2,$3,$4)', [id(510), 'Medellín', zone.name, 'No disponible']), /localidad disponible/);
      await db.query('update articulos set city=city,locality=locality,title=$1 where id=$2', ['Conservada', id(500)]);
      assert.equal((await db.query('select count(*)::int n from articulos where id=$1', [id(500)])).rows[0].n, 1);
      await asUser(1); await edit(medellin.id, 'restore_locality', zone.id);
      await assert.rejects(save('add_locality', medellin.id, 'El Poblado'), /Ya existe/);
    });
    await t.test('an inactive city may have zero available localities but cannot reactivate until one is restored', async () => {
      await asUser(1); const added = await save('add_city', null, 'Ciudad temporal', 'Zona temporal');
      const city = added.find(row => row.city === 'Ciudad temporal'), zone = city.locality_details[0];
      await assert.rejects(edit(city.id, 'remove_locality', zone.id), /Debe quedar una localidad/);
      await save('deactivate_city', city.id); await edit(city.id, 'remove_locality', zone.id);
      await assert.rejects(save('activate_city', city.id), /al menos una localidad/);
      const store = createLocationCatalog({ rpc: async () => ({ data: await catalog() }) });
      await store.refresh(); assert.ok(store.getSnapshot().LOCATIONS['Bogotá']);
      await edit(city.id, 'restore_locality', zone.id); await save('activate_city', city.id);
    });
    await t.test('unused labels can be corrected, while articles, profiles, targeting and historic metrics prevent name changes', async () => {
      await asUser(1); const rows = await save('add_city', null, 'Ciudad sin uso', 'Zona inicial');
      const city = rows.find(row => row.city === 'Ciudad sin uso');
      await assert.rejects(edit(city.id, 'rename_city', null, 'Nombre nuevo'), /Desactiva/);
      await save('deactivate_city', city.id);
      const renamed = await edit(city.id, 'rename_city', null, 'Ciudad corregida');
      assert.equal(renamed.find(row => row.id === city.id).city, 'Ciudad corregida');
      await edit(city.id, 'rename_locality', city.locality_details[0].id, 'Zona corregida');
      await assert.rejects(edit(city.id, 'rename_city', null, 'cali'), /Ya existe/);
      await assert.rejects(edit(city.id, 'rename_locality', city.locality_details[0].id, 'x'), /2 a 80/);
      await db.exec('reset role'); await db.query('insert into staff_publication_history values($1,$2)', ['Ciudad corregida', 'Zona corregida']);
      await asUser(1); await assert.rejects(edit(city.id, 'rename_city', null, 'No cambiar'), /historial/);
      await assert.rejects(edit(city.id, 'rename_locality', city.locality_details[0].id, 'No cambiar'), /historial/);
      const medellin = (await staff()).find(row => row.city === 'Medellín');
      await assert.rejects(edit(medellin.id, 'rename_locality', medellin.locality_details.find(row => row.name === 'El Poblado').id, 'No cambiar'), /historial/);
      for (const table of ['usuarios', 'market_daily_metrics', 'patrocinadores']) {
        const zoneName = `Zona para ${table}`;
        const updated = await save('add_locality', city.id, zoneName), zone = updated.find(row => row.id === city.id).locality_details.find(row => row.name === zoneName);
        await db.exec('reset role');
        if (table === 'usuarios') await db.query('update usuarios set ciudad=$1,localidad=$2 where id=$3', ['Ciudad corregida', zoneName, id(1)]);
        else if (table === 'market_daily_metrics') await db.query('insert into market_daily_metrics values($1,$2)', ['Ciudad corregida', zoneName]);
        else await db.query('insert into patrocinadores values($1)', [JSON.stringify([{ city: 'Ciudad corregida', locality: zoneName }])]);
        await asUser(1); await assert.rejects(edit(city.id, 'rename_locality', zone.id, 'No cambiar'), /historial/);
      }
    });
    await t.test('editing rejects foreign locality IDs and non-master sessions', async () => {
      await asUser(1); const rows = await staff(), bogota = rows.find(row => row.city === 'Bogotá'), cali = rows.find(row => row.city === 'Cali');
      await assert.rejects(edit(bogota.id, 'remove_locality', cali.locality_details[0].id), /de esta ciudad/);
      await asUser(2); await assert.rejects(edit(bogota.id, 'remove_locality', bogota.locality_details[0].id), /Acceso no autorizado/);
      await asUser(null); await assert.rejects(edit(bogota.id, 'restore_locality', bogota.locality_details[0].id), /permission denied/);
      await asUser(1, 'aal1'); await assert.rejects(edit(bogota.id, 'rename_city', null, 'No cambiar'), /Acceso no autorizado/);
    });
    await t.test('expired and revoked master sessions cannot add cities', async () => {
      await db.exec("reset role;update staff_sessions set expires_at=now()-interval '1 second' where user_id='" + id(1) + "'");
      await asUser(1); await assert.rejects(save('add_city', null, 'Otra ciudad', 'Centro'), /Acceso no autorizado/);
      await db.exec("reset role;update staff_sessions set expires_at=now()+interval '1 hour',revoked_at=now() where user_id='" + id(1) + "'");
      await asUser(1); await assert.rejects(staff(), /Acceso no autorizado/);
    });
  } finally { await db.close(); }
});
