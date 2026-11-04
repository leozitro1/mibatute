import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('removing client TRUNCATE preserves records, ordinary CRUD, RLS and server privileges', async () => {
  const db = new PGlite();
  const migration = await readFile(new URL('../supabase/migrations/2026-11-04-revoke-client-truncate.sql', import.meta.url), 'utf8');
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      grant usage on schema public to anon,authenticated,service_role;
      create table security_fixture(id integer primary key, owner_id integer, body text);
      insert into security_fixture values(1,1,'Own'),(2,2,'Other');
      alter table security_fixture enable row level security;
      create policy owner_only on security_fixture to authenticated
        using(owner_id=nullif(current_setting('app.uid',true),'')::integer)
        with check(owner_id=nullif(current_setting('app.uid',true),'')::integer);
      grant select,insert,update,delete,truncate on security_fixture to anon,authenticated,service_role;
      grant truncate on security_fixture to public;
      alter default privileges for role postgres in schema public
        grant select,insert,update,delete,truncate on tables to anon,authenticated,service_role;
      alter default privileges for role postgres in schema public grant truncate on tables to public;`);
    const before = await db.query("select has_table_privilege('anon','security_fixture','TRUNCATE') as allowed");
    assert.equal(before.rows[0].allowed, true);
    await db.exec(migration);
    await db.exec(migration);
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.exec('truncate security_fixture'), /permission denied/);
      await db.exec('reset role');
    }
    assert.equal((await db.query('select count(*)::integer as total from security_fixture')).rows[0].total, 2);
    assert.equal((await db.query("select has_table_privilege('service_role','security_fixture','TRUNCATE') as allowed")).rows[0].allowed, true);
    await db.exec("set role authenticated; select set_config('app.uid','1',false)");
    assert.deepEqual((await db.query('select id from security_fixture order by id')).rows, [{ id: 1 }]);
    assert.equal((await db.query("update security_fixture set body='Denied' where id=2 returning id")).rows.length, 0);
    await db.exec("insert into security_fixture values(3,1,'New'); update security_fixture set body='Edited' where id=3; delete from security_fixture where id=3");
    await db.exec('reset role; create table future_security_fixture(id integer)');
    for (const table of ['security_fixture', 'future_security_fixture']) {
      for (const role of ['anon', 'authenticated']) {
        const permissions = await db.query(`select has_table_privilege($1,$2,'TRUNCATE') as truncate,
          (has_table_privilege($1,$2,'SELECT') and has_table_privilege($1,$2,'INSERT')
           and has_table_privilege($1,$2,'UPDATE') and has_table_privilege($1,$2,'DELETE')) as crud`, [role, table]);
        assert.equal(permissions.rows[0].truncate, false);
        assert.equal(permissions.rows[0].crud, true);
      }
    }
    assert.equal((await db.query('select body from security_fixture where id=2')).rows[0].body, 'Other');
  } finally {
    await db.close();
  }
});
