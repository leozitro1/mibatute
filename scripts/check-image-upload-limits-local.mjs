import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import process from 'node:process';

const docker = '/Applications/Docker.app/Contents/Resources/bin/docker';
const container = 'supabase_db_mibatute';
const endpoint = process.env.DOCKER_HOST || execFileSync(docker, ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'], { encoding: 'utf8' }).trim();
assert.ok(endpoint.startsWith('unix://'), 'Only the local Docker socket is allowed');
const database = `mibatute_upload_test_${randomUUID().replaceAll('-', '')}`;
assert.match(database, /^mibatute_upload_test_[a-f0-9]{32}$/);
const user = '00000000-0000-4000-8000-000000000001';
const args = name => ['exec', '-i', container, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', name];
const sql = (text, name = database) => execFileSync(docker, args(name), { input: text, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const asynchronous = text => {
  const child = spawn(docker, args(database), { stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '', error = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { error += chunk; });
  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(output) : reject(new Error(error)));
  });
  child.stdin.end(text);
  return { child, done };
};
const request = (scope, hold = false) => `begin;set local role authenticated;
 select set_config('request.jwt.claim.sub','${user}',true);
 select 'reservation='||(public.reserve_image_upload('${scope}')->>'allowed');
 ${hold ? 'select pg_sleep(0.75);' : ''}commit;`;
async function race(expectedSecond) {
  let second;
  const first = asynchronous(request('articulos', true));
  let prefix = '';
  first.child.stdout.on('data', chunk => {
    prefix += chunk;
    if (!second && prefix.includes('reservation=true')) second = asynchronous(request('perfiles'));
  });
  assert.match(await first.done, /reservation=true/);
  assert.ok(second, 'The second connection must start while the first transaction holds its lock');
  assert.match(await second.done, new RegExp(`reservation=${expectedSecond}`));
}

let created = false;
try {
  sql(`create database ${database}`, 'postgres'); created = true;
  sql(`create schema auth;
   create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
   create table auth.users(id uuid primary key);
   create table public.usuarios(id uuid primary key,is_blocked boolean default false,bloqueado boolean default false,ban_until timestamptz);
   insert into auth.users values('${user}');insert into public.usuarios(id) values('${user}');
   grant usage on schema public,auth to authenticated,anon,service_role;`);
  sql(await readFile(new URL('../supabase/migrations/2026-11-05-image-upload-limits.sql', import.meta.url), 'utf8'));
  await race(true);
  assert.equal(sql('select cardinality(issued_at)||\',\'||cardinality(profile_issued_at) from image_upload_limits'), '2,1');
  sql(`truncate image_upload_limits;insert into image_upload_limits(user_id,issued_at)
   values('${user}',array_fill(clock_timestamp()-interval '1 minute',array[19]));`);
  await race(false);
  assert.equal(sql('select cardinality(issued_at) from image_upload_limits'), '20');
  sql(`truncate image_upload_limits;insert into image_upload_limits(user_id,issued_at)
   values('${user}',array_fill(clock_timestamp()-interval '2 hours',array[119]));`);
  await race(false);
  assert.equal(sql('select cardinality(issued_at) from image_upload_limits'), '120');
  console.log('OK: three races on independent PostgreSQL connections; first-use count preserved, burst capped at 20 and rolling day at 120.');
} finally {
  if (created) {
    sql(`drop database ${database} with (force)`, 'postgres');
    console.log('Temporary test database removed; application database and user data were not changed.');
  }
}
