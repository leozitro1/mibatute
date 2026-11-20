// Isolated PostgreSQL/WASM fixture. No HTTP, Docker connection or production access.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const flatten = plan => [plan, ...(plan.Plans || []).flatMap(flatten)];
const queries = {
  participants: `select id from public.articulos where owner_id=md5('account-5000')::uuid
    or usuario_id=md5('account-5000')::uuid or buyer_id=md5('account-5000')::uuid
    or ganador_id=md5('account-5000')::uuid or winner_id=md5('account-5000')::uuid
    or recipient_id=md5('account-5000')::uuid order by created_at desc limit 100`,
  purchases: `select id from public.articulos where buyer_id=md5('account-5000')::uuid order by created_at desc limit 100`,
};
const measure = async query => {
  const [row] = (await db.query(`explain (analyze, buffers, format json) ${query}`)).rows;
  const report = row['QUERY PLAN'][0];
  const nodes = flatten(report.Plan);
  return { ms: report['Execution Time'], rows: report.Plan['Actual Rows'],
    filteredRows: nodes.reduce((total, node) => total + (node['Rows Removed by Filter'] || 0) * (node['Actual Loops'] || 1), 0),
    indexes: [...new Set(nodes.map(node => node['Index Name']).filter(Boolean))] };
};
try {
  await db.exec(`create table synthetic_accounts(id uuid primary key);
    insert into synthetic_accounts select md5('account-'||i)::uuid from generate_series(1,10000) i;
    create table public.articulos(id uuid primary key,owner_id uuid,usuario_id uuid,buyer_id uuid,
      ganador_id uuid,winner_id uuid,recipient_id uuid,created_at timestamptz);
    insert into public.articulos select md5('article-'||i)::uuid,
      md5('account-'||(((i-1)%10000)+1))::uuid,md5('account-'||(((i-1)%10000)+1))::uuid,
      case when i%3=0 then md5('account-'||(((i+16)%10000)+1))::uuid end,
      case when i%5=0 then md5('account-'||(((i+36)%10000)+1))::uuid end,
      case when i%5=0 then md5('account-'||(((i+36)%10000)+1))::uuid end,
      case when i%5=0 then md5('account-'||(((i+36)%10000)+1))::uuid end,
      '2026-01-01'::timestamptz+i*interval '1 second' from generate_series(1,100000) i;
    create index articulos_owner_id_idx on public.articulos(owner_id);
    create index articulos_created_at_idx on public.articulos(created_at desc);
    analyze public.articulos;`);
  const before = {}, expected = {};
  for (const [name, query] of Object.entries(queries)) {
    expected[name] = (await db.query(query)).rows;
    before[name] = await measure(query);
  }
  const migration = await readFile(new URL('../supabase/migrations/2026-11-20-growth-participant-indexes.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(migration); // Reapplication must be safe.
  await db.exec('analyze public.articulos');
  const after = {};
  for (const [name, query] of Object.entries(queries)) {
    assert.deepEqual((await db.query(query)).rows, expected[name], 'Indexes preserve results and order');
    after[name] = await measure(query);
    assert.ok(after[name].indexes.some(index => index.endsWith('_recent_idx')), `${name}: new indexes are used`);
    assert.ok(after[name].filteredRows < before[name].filteredRows, `${name}: fewer unrelated rows scanned`);
  }
  console.log(JSON.stringify({ fixture: 'isolated local PostgreSQL/WASM; no network', syntheticAccounts: 10000,
    syntheticArticles: 100000, before, after,
    limitation: 'Query planning check, not a measurement of production or 10000 simultaneous sessions' }, null, 2));
} finally { await db.close(); }
