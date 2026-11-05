import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createAuthRequestGuard } from '../src/supabase/authRequestGuard.js';
import { captchaOptions } from '../src/security/turnstile.js';

const base = 'https://auth-test.supabase.co';
const post = { method: 'POST' };
function setup() {
  let stamp = 1000000, calls = 0;
  const stored = new Map();
  const storage = { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value) };
  const create = () => createAuthRequestGuard({ now: () => stamp, getStorage: () => storage });
  return { create, storage, stored, advance: ms => { stamp += ms; }, calls: () => calls,
    fetch: async () => { calls++; return Response.json({}); } };
}

test('email sends share a persistent cooldown across actions, clients and remounts without storing PII', async () => {
  const env = setup(), guard = env.create(), publicFetch = guard(base, env.fetch), staffFetch = guard(base, env.fetch);
  assert.equal((await publicFetch(`${base}/auth/v1/signup`, { ...post, body: JSON.stringify({ email: 'private@example.com', password: 'private' }) })).status, 200);
  assert.equal((await staffFetch(`${base}/auth/v1/recover`, post)).status, 429);
  const afterReload = env.create()(base, env.fetch);
  assert.equal((await afterReload(`${base}/auth/v1/resend`, post)).headers.get('Retry-After'), '60');
  assert.equal(env.calls(), 1);
  const [persisted] = env.stored.values();
  assert.deepEqual(Object.keys(JSON.parse(persisted)).sort(), ['emailUntil', 'failures', 'loginUntil']);
  assert.equal(persisted.includes('private'), false);
  env.advance(60000);
  assert.equal((await afterReload(`${base}/auth/v1/recover`, post)).status, 200);
  assert.equal(env.calls(), 2);
});

test('concurrent sends in one page make only one network request', async () => {
  const env = setup(); let release, calls = 0;
  const fetch = env.create()(base, () => { calls++; return new Promise(resolve => { release = resolve; }); });
  const pending = fetch(`${base}/auth/v1/recover`, post);
  assert.equal((await fetch(`${base}/auth/v1/resend`, post)).status, 429);
  assert.equal(calls, 1);
  release(Response.json({})); await pending;
});

test('failed validation permits correction but lost email responses are not retried', async () => {
  const env = setup(); let calls = 0;
  const fetch = env.create()(base, async () => { calls++; if (calls === 1) return Response.json({}, { status: 400 }); throw new Error('lost response'); });
  assert.equal((await fetch(`${base}/auth/v1/signup`, post)).status, 400);
  await assert.rejects(fetch(`${base}/auth/v1/signup`, post), /lost response/);
  assert.equal((await fetch(`${base}/auth/v1/recover`, post)).status, 429);
  assert.equal(calls, 2);
});

test('server 429 wait is respected and denied clicks do not extend it', async () => {
  const env = setup(); let calls = 0;
  const fetch = env.create()(base, async () => { calls++; return Response.json({}, { status: 429, headers: { 'Retry-After': '180' } }); });
  await fetch(`${base}/auth/v1/recover`, post);
  env.advance(60000);
  assert.equal((await fetch(`${base}/auth/v1/signup`, post)).headers.get('Retry-After'), '120');
  env.advance(120000);
  await fetch(`${base}/auth/v1/recover`, post);
  assert.equal(calls, 2);
});

test('five password failures pause further attempts while refresh, PKCE, MFA, logout, REST and other hosts pass through', async () => {
  const env = setup(); let calls = 0;
  const guard = env.create(), fetch = guard(base, async () => { calls++; return Response.json({}, { status: 400 }); });
  for (let i = 0; i < 5; i++) { await fetch(`${base}/auth/v1/token?grant_type=password`, post); env.advance(1000); }
  assert.equal((await fetch(`${base}/auth/v1/token?grant_type=password`, post)).status, 429);
  assert.equal(calls, 5);
  for (const path of ['/auth/v1/token?grant_type=refresh_token', '/auth/v1/token?grant_type=pkce', '/auth/v1/verify', '/auth/v1/factors/id/verify', '/auth/v1/logout', '/rest/v1/usuarios']) {
    assert.equal((await fetch(`${base}${path}`, post)).status, 400);
  }
  assert.equal((await fetch('https://another.supabase.co/auth/v1/recover', post)).status, 400);
  env.advance(60000);
  assert.equal((await fetch(`${base}/auth/v1/token?grant_type=password`, post)).status, 400);
});

test('storage blocked or corrupt still prevents repeated calls in memory', async () => {
  for (const storage of [{ getItem() { throw new Error('blocked'); } }, { getItem: () => '{broken', setItem() {} }]) {
    let calls = 0;
    const fetch = createAuthRequestGuard({ getStorage: () => storage })(base, async () => { calls++; return Response.json({}); });
    await fetch(new Request(`${base}/auth/v1/resend`, post));
    assert.equal((await fetch(`${base}/auth/v1/recover`, post)).status, 429);
    assert.equal(calls, 1);
  }
});

test('Supabase SDK receives local 429 as an Auth error, and recovery serializes captchaToken for server verification', async () => {
  const env = setup(); let sent;
  const fetch = env.create()(base, async (url, init) => { sent = JSON.parse(init.body); return Response.json({}); });
  const client = createClient(base, 'public-test-key', { global: { fetch }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { error } = await client.auth.resetPasswordForEmail('private@example.com', captchaOptions('one-use-token', 'public-site-key'));
  assert.equal(error, null);
  assert.equal(sent.gotrue_meta_security.captcha_token, 'one-use-token');
  const denied = await client.auth.resend({ type: 'signup', email: 'private@example.com' });
  assert.equal(denied.error.status, 429);
  assert.equal(denied.error.code, 'over_request_rate_limit');
  assert.match(denied.error.message, /Espera 60 segundos/);
});

test('configured CAPTCHA fails closed before Auth when missing; no configuration leaves current behavior intact', () => {
  assert.deepEqual(captchaOptions(undefined, ''), {});
  for (const token of [undefined, null, '', ' ']) assert.throws(() => captchaOptions(token, 'public-site-key'), { code: 'captcha_required' });
  assert.deepEqual(captchaOptions('verified-token', 'public-site-key'), { captchaToken: 'verified-token' });
});
