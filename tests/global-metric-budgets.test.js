import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const read = name => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8');
const definition = (sql, name) => {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0); const end = sql.indexOf('$$;', start); assert.ok(end > start);
  return sql.slice(start, end + 3);
};

test('global metric budgets constrain the real three ingestion functions without exposing their counters', async t => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table auth.users(id uuid primary key,raw_app_meta_data jsonb default '{}');
      create table staff_accounts(user_id uuid,role text);
      create function public.staff_permission(text) returns boolean language sql stable as $$select false$$;
      create table articulos(id uuid primary key,owner_id uuid,usuario_id uuid,status text,estado text,review_status text,
        created_at timestamptz default now(),category text,categoria text,city text,locality text);
      create table patrocinadores(id uuid primary key,activo boolean,placement text,starts_at timestamptz,ends_at timestamptz,
        impresiones bigint default 0,clics bigint default 0);
      grant usage on schema public,auth to anon,authenticated,service_role;
      insert into articulos(id,status,review_status,city,locality,category) values('${id(1)}','disponible','approved','Bogotá','Suba','Hogar');
      insert into patrocinadores(id,activo,placement) values('${id(2)}',true,'hero');`);
    const views = await read('2026-10-27-article-views');
    await db.exec(views.slice(0, views.indexOf('create or replace function public.staff_article_preview')) + '\ncommit;');
    const market = await read('2026-10-16-market-analytics');
    await db.exec(market.slice(0, market.indexOf('alter table public.staff_publication_history')) + '\ncommit;');
    await db.exec(definition(market, 'record_market_metrics'));
    const sponsors = await read('2026-10-15-sponsor-campaigns');
    await db.exec(sponsors.slice(sponsors.indexOf('create table if not exists public.sponsor_daily_metrics'), sponsors.indexOf('drop function if exists public.public_sponsor_slots')));
    await db.exec(definition(sponsors, 'record_sponsor_metrics'));
    await db.exec(`revoke all on function record_market_metrics(uuid,jsonb),record_sponsor_metrics(uuid,jsonb) from public;
      grant execute on function record_market_metrics(uuid,jsonb),record_sponsor_metrics(uuid,jsonb) to anon,authenticated;`);
    const metadata = () => db.query("select proname,proowner,proacl::text,prosecdef from pg_proc where proname in ('record_article_view','record_market_metrics','record_sponsor_metrics') order by proname");
    const before = (await metadata()).rows;
    const migration = await read('2026-11-05-global-metric-budgets'); await db.exec(migration); await db.exec(migration);
    assert.deepEqual((await metadata()).rows, before);
    const as = role => db.exec(`reset role;set role ${role}`);
    const view = session => db.query('select record_article_view($1,$2) as allowed', [id(1), id(session)]).then(r => r.rows[0].allowed);
    const record = (kind, visit, events) => db.query(`select public.record_${kind}_metrics($1,$2::jsonb)`, [id(visit), JSON.stringify(events)]);
    const event = { kind: 'search', term: 'silla', city: 'Bogotá', locality: 'Suba', category: 'Hogar', empty: false };
    const sponsored = { id: id(2), placement: 'hero', seen: true, clicked: false };
    await t.test('RLS, client revocations and private helper survive reapplication', async () => {
      assert.equal((await db.query('select count(*)::int n from metric_write_budgets')).rows[0].n, 3);
      assert.equal((await db.query("select relrowsecurity from pg_class where oid='metric_write_budgets'::regclass")).rows[0].relrowsecurity, true);
      for (const role of ['anon', 'authenticated']) {
        await as(role);
        await assert.rejects(db.query('select * from metric_write_budgets'), /permission denied/);
        await assert.rejects(db.query("select reserve_metric_budget('market',1)"), /permission denied/);
        for (const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE']) {
          assert.equal((await db.query('select has_table_privilege(current_user,\'metric_write_budgets\',$1) as allowed',[privilege])).rows[0].allowed, false);
        }
      }
      await as('postgres');
    });
    await t.test('rotating anonymous session UUIDs cannot exceed the shared minute allowance', async () => {
      await db.exec("update metric_write_budgets set minute_limit=2,day_limit=3 where kind='article_views'");
      await as('anon'); assert.equal(await view(10), true); assert.equal(await view(11), true); assert.equal(await view(12), false);
      await as('postgres');
      assert.equal((await db.query('select count(*)::int n from article_view_visitors')).rows[0].n, 2);
      assert.equal(Number((await db.query('select view_count from article_view_totals')).rows[0].view_count), 2);
    });
    await t.test('a fresh minute retains the day budget; denied attempts do not update counters', async () => {
      await db.exec("update metric_write_budgets set minute_start=now()-interval '2 minutes' where kind='article_views'");
      await as('anon'); assert.equal(await view(13), true); assert.equal(await view(14), false);
      await as('postgres'); const before = (await db.query("select * from metric_write_budgets where kind='article_views'")).rows;
      await as('authenticated'); assert.equal(await view(15), false); await as('postgres');
      assert.deepEqual((await db.query("select * from metric_write_budgets where kind='article_views'")).rows, before);
      await db.exec("update metric_write_budgets set minute_start=now()-interval '2 minutes',window_day=current_date-2 where kind='article_views'");
      await as('anon'); assert.equal(await view(16), true); await as('postgres');
    });
    await t.test('market and sponsor budgets are independent, apply to entire batches and stop writes silently', async () => {
      await db.exec("update metric_write_budgets set minute_limit=2,day_limit=2 where kind in ('market','sponsors')");
      await as('anon');
      await record('market',20,[event]); await record('market',21,[event]); await record('market',22,[event]);
      await record('sponsor',30,[sponsored,sponsored]); await record('sponsor',31,[sponsored]);
      await as('postgres');
      assert.equal((await db.query('select count(*)::int n from market_metric_events')).rows[0].n, 2);
      assert.equal((await db.query('select count(*)::int n from sponsor_visit_metrics')).rows[0].n, 1);
      assert.equal(Number((await db.query('select impresiones from patrocinadores')).rows[0].impresiones), 1);
      assert.equal((await db.query("select day_used from metric_write_budgets where kind='sponsors'")).rows[0].day_used, 2);
    });
    await t.test('empty/oversized payloads do not reserve; a failed RPC rolls back its budget reservation', async () => {
      await db.exec("update metric_write_budgets set minute_used=0,day_used=0 where kind='sponsors'");
      await as('anon'); await record('sponsor',40,[]);
      await assert.rejects(record('sponsor',41,[{ ...sponsored, ignored: 'x'.repeat(24000) }]), /Lote no valido/);
      await assert.rejects(record('sponsor',42,[{ ...sponsored, placement:'invalid' }]), /Evento no valido/);
      await as('postgres');
      assert.equal((await db.query("select day_used from metric_write_budgets where kind='sponsors'")).rows[0].day_used, 0);
      const snapshot = (await db.query('select * from metric_write_budgets order by kind')).rows;
      await db.exec(migration);
      assert.deepEqual((await db.query('select * from metric_write_budgets order by kind')).rows, snapshot);
      assert.equal((await db.query('select count(*)::int n from metric_write_budgets')).rows[0].n, 3);
    });
  } finally { await db.close(); }
});
