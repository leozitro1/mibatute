import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const user = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';

test('upload reservations enforce private rolling limits without growing logs or touching credits', async t => {
  const db = new PGlite();
  const migration = await readFile(new URL('../supabase/migrations/2026-11-05-image-upload-limits.sql', import.meta.url), 'utf8');
  const admin = () => db.exec('reset role');
  const asUser = async (uid = user) => {
    await db.exec('reset role;set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  };
  const reserve = async (scope = 'articulos') => (await db.query('select public.reserve_image_upload($1) as result', [scope])).rows[0].result;
  const reset = async () => { await admin(); await db.exec('truncate public.image_upload_limits'); await asUser(); };
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
      create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
      create table auth.users(id uuid primary key);
      create table public.usuarios(id uuid primary key,is_blocked boolean default false,bloqueado boolean default false,ban_until timestamptz);
      insert into auth.users values('${user}'),('${other}');insert into public.usuarios(id) select id from auth.users;
      grant usage on schema public,auth to anon,authenticated,service_role;`);
    await db.exec(migration);

    await t.test('20 per ten minutes shared across scopes, without extending a denial', async () => {
      await reset();
      for (let i = 0; i < 20; i++) assert.equal((await reserve(i < 2 ? 'perfiles' : 'articulos')).allowed, true);
      const denied = await reserve();
      assert.equal(denied.allowed, false); assert.equal(denied.limit, 'burst');
      assert.ok(denied.retryAfter > 590 && denied.retryAfter <= 600);
      assert.ok(Math.abs(Date.parse((await reserve()).retryAt) - Date.parse(denied.retryAt)) < 1);
      await admin();
      assert.equal((await db.query('select cardinality(issued_at) as total from image_upload_limits')).rows[0].total, 20);
      await db.exec("update image_upload_limits set issued_at=array_fill(clock_timestamp()-interval '10 minutes',array[20])");
      await asUser(); assert.equal((await reserve()).allowed, true);
    });

    await t.test('120 per rolling day, independently per account, with expired reservations compacted', async () => {
      await reset(); await admin();
      await db.query(`insert into image_upload_limits(user_id,issued_at)
        select $1,array_agg(clock_timestamp()-interval '2 hours'+i*interval '1 second') from generate_series(1,119) i`, [user]);
      await asUser(); assert.equal((await reserve()).allowed, true);
      const denied = await reserve(); assert.equal(denied.limit, 'daily'); assert.equal(denied.allowed, false);
      await asUser(other); assert.equal((await reserve()).allowed, true);
      await admin(); await db.query("update image_upload_limits set issued_at=array_fill(clock_timestamp()-interval '24 hours',array[120]) where user_id=$1", [user]);
      await asUser(); assert.equal((await reserve()).allowed, true);
      await admin(); assert.equal((await db.query('select cardinality(issued_at) as total from image_upload_limits where user_id=$1', [user])).rows[0].total, 1);
    });

    await t.test('four profile reservations count in the global allowance, while articles remain available', async () => {
      await reset();
      for (let i = 0; i < 4; i++) assert.equal((await reserve('perfiles')).allowed, true);
      const denied = await reserve('perfiles'); assert.equal(denied.allowed, false); assert.equal(denied.limit, 'profile');
      assert.equal((await reserve()).allowed, true);
      await admin(); assert.deepEqual((await db.query('select cardinality(issued_at) as total,cardinality(profile_issued_at) as profiles from image_upload_limits')).rows[0], { total: 5, profiles: 4 });
    });

    await t.test('retry time satisfies every applicable limit rather than the shortest wait', async () => {
      await reset(); await admin();
      await db.query(`insert into image_upload_limits(user_id,issued_at,profile_issued_at)
        select $1,array[clock_timestamp()-interval '23 hours']
          ||array_fill(clock_timestamp()-interval '2 hours',array[95])
          ||array_fill(clock_timestamp()-interval '10 hours',array[4])
          ||array_fill(clock_timestamp()-interval '1 minute',array[20]),
          array_fill(clock_timestamp()-interval '10 hours',array[4])`, [user]);
      await asUser(); const denied = await reserve('perfiles');
      assert.equal(denied.allowed, false); assert.equal(denied.limit, 'profile');
      assert.ok(denied.retryAfter > 13 * 3600 && denied.retryAfter <= 14 * 3600);
    });

    await t.test('anonymous calls, forged identities and direct counter edits are rejected', async () => {
      await reset(); assert.equal((await reserve()).allowed, true);
      await assert.rejects(db.query('select * from image_upload_limits'), /permission denied/);
      await assert.rejects(db.exec('delete from image_upload_limits'), /permission denied/);
      await assert.rejects(db.exec('truncate image_upload_limits'), /permission denied/);
      await assert.rejects(db.exec("update image_upload_limits set issued_at='{}'"), /permission denied/);
      await assert.rejects(db.query('insert into image_upload_limits(user_id) values($1)', [other]), /permission denied/);
      await assert.rejects(db.query("select reserve_image_upload('articulos',$1)", [other]), /does not exist/);
      await assert.rejects(reserve('other'), /Destino/);
      await asUser(''); await assert.rejects(reserve(), /Inicia/);
      await db.exec('reset role;set role anon'); await assert.rejects(reserve(), /permission denied/);
    });

    await t.test('suspended accounts cannot reserve; reapplying the migration preserves limits', async () => {
      await reset(); assert.equal((await reserve()).allowed, true); await admin();
      await db.exec(migration);
      assert.equal((await db.query('select cardinality(issued_at) as total from image_upload_limits')).rows[0].total, 1);
      await db.query('update usuarios set is_blocked=true where id=$1', [user]);
      await asUser(); await assert.rejects(reserve(), /Tu cuenta/);
      await admin(); await db.query("update usuarios set is_blocked=false,ban_until=clock_timestamp()+interval '1 hour' where id=$1", [user]);
      await asUser(); await assert.rejects(reserve(), /Tu cuenta/);
      await admin(); await db.query('delete from auth.users where id=$1', [user]);
      assert.equal((await db.query('select count(*)::integer as total from image_upload_limits')).rows[0].total, 0);
    });
  } finally { await db.close(); }
});
