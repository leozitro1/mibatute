import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import process from 'node:process';

const docker = '/Applications/Docker.app/Contents/Resources/bin/docker';
const endpoint = process.env.DOCKER_HOST || execFileSync(docker, ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'], { encoding: 'utf8' }).trim();
assert.ok(endpoint.startsWith('unix://'), 'Only the local Docker socket is allowed');
const database = `mibatute_metric_test_${randomUUID().replaceAll('-', '')}`;
assert.match(database, /^mibatute_metric_test_[a-f0-9]{32}$/);
const args = name => ['exec', '-i', 'supabase_db_mibatute', 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', name];
const sql = (input, name = database) => execFileSync(docker, args(name), { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const start = input => {
  const child = spawn(docker, args(database), { stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '', error = '';
  child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { error += chunk; });
  const done = new Promise((resolve, reject) => {
    child.on('error', reject); child.on('close', code => code === 0 ? resolve(output) : reject(new Error(error)));
  });
  child.stdin.end(input); return { child, done };
};
let created = false;
try {
  sql(`create database ${database}`, 'postgres'); created = true;
  // Only the private counter is tested here; real ingestion functions are covered by PGlite.
  sql(`create function public.record_article_view(p_article uuid,p_session uuid) returns boolean language plpgsql security definer as $$begin
    if p_session is null then return false;end if;return true;end$$;
    create function public.record_market_metrics(p_visit uuid,p_events jsonb) returns void language plpgsql security definer as $$begin
    perform pg_advisory_xact_lock(hashtextextended(p_visit::text,20261017));end$$;
    create function public.record_sponsor_metrics(p_visit uuid,p_events jsonb) returns void language plpgsql security definer as $$begin
    perform pg_advisory_xact_lock(hashtextextended(p_visit::text,20261016));end$$;`);
  sql(await readFile(new URL('../supabase/migrations/2026-11-05-global-metric-budgets.sql', import.meta.url), 'utf8'));
  sql("update metric_write_budgets set minute_limit=2,day_limit=2 where kind='article_views'");
  let second, prefix = '';
  const first = start("begin;select 'budget='||reserve_metric_budget('article_views',1);select pg_sleep(0.75);commit;");
  first.child.stdout.on('data', chunk => {
    prefix += chunk;
    if (!second && prefix.includes('budget=true')) second = start("begin;set local statement_timeout='500ms';select 'budget='||reserve_metric_budget('article_views',1);commit;");
  });
  assert.match(await first.done, /budget=true/); assert.ok(second, 'Start while the first connection holds the row lock');
  assert.match(await second.done, /budget=false/);
  assert.equal(sql("select reserve_metric_budget('article_views',1)"), 't');
  assert.equal(sql("select reserve_metric_budget('article_views',1)"), 'f');
  // Crossing a minute boundary during the short test may reset only that counter.
  assert.match(sql("select minute_used||','||day_used from metric_write_budgets where kind='article_views'"), /^[12],2$/);
  console.log('OK: concurrent work rejected without waiting; accepted reservations stay within both global caps.');
} finally {
  if (created) { sql(`drop database ${database} with (force)`, 'postgres'); console.log('Temporary test database removed; application data unchanged.'); }
}
