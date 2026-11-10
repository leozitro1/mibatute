import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import handler from '../api/profile-photo.js';

const owner = '00000000-0000-4000-8000-000000000001';
const cdn = 'https://ik.imagekit.io/example';
const photo = `${cdn}/tr:w-500,q-auto:eco,f-auto/mibatute/perfiles/${owner}/foto.webp`;

test('the public profile projection returns names but masks photos without a registered session', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create schema auth;
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
      create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
      create role anon; create role authenticated;
      grant usage on schema auth to anon,authenticated;
      create function public.account_is_verified(uuid) returns boolean language sql as $$ select true $$;
      create table public.usuarios(id uuid,nombre text,ciudad text,localidad text,foto_url text,is_blocked boolean,bloqueado boolean,ban_until timestamptz);
      insert into public.usuarios(id,nombre,foto_url) values ('${owner}','Ana','${photo}');
      create view public.usuarios_publicos as select *, public.account_is_verified(id) as account_verified from public.usuarios;
      grant select on public.usuarios_publicos to anon,authenticated;`);
    const sql = await readFile(new URL('../supabase/migrations/2026-11-10-private-profile-photos.sql', import.meta.url), 'utf8');
    await db.exec(sql);
    await db.exec(sql);
    await db.exec('set role anon;');
    const read = async () => (await db.query('select nombre, foto_url from public.usuarios_publicos')).rows;
    assert.deepEqual(await read(), [{ nombre: 'Ana', foto_url: null }]);
    await assert.rejects(db.query('select foto_url from public.usuarios'), { code: '42501' });
    await db.exec(`set role authenticated; set request.jwt.claims = '{"sub":"${owner}","is_anonymous":true}';`);
    assert.deepEqual(await read(), [{ nombre: 'Ana', foto_url: null }]);
    await db.exec(`set request.jwt.claims = '{"sub":"${owner}","is_anonymous":false}';`);
    assert.deepEqual(await read(), [{ nombre: 'Ana', foto_url: photo }]);
  } finally { await db.close(); }
});

test('photo signer verifies the session and signs only profile files with a short lifetime', async t => {
  const env = { IMAGEKIT_URL_ENDPOINT: cdn, IMAGEKIT_PRIVATE_KEY: 'test-secret', SUPABASE_URL: 'https://test.supabase.co', SUPABASE_ANON_KEY: 'test-public' };
  for (const [key, value] of Object.entries(env)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
  const auth = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(String(url), 'https://test.supabase.co/auth/v1/user');
    const token = new Headers(options.headers).get('Authorization');
    if (token === 'Bearer bad') return Response.json({ message: 'Invalid token' }, { status: 401 });
    return Response.json({ id: owner, is_anonymous: token === 'Bearer guest' });
  });
  const call = async (authorization, source = photo) => {
    const res = { setHeader(key, value) { this[key] = value; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
    await handler({ method: 'POST', headers: { authorization }, body: { source } }, res);
    assert.equal(res['Cache-Control'], 'private, no-store');
    return res;
  };
  assert.equal((await call(undefined)).code, 401);
  for (const source of [photo.replace('/perfiles/', '/articulos/'), photo.replace('/example/', '/other/'), photo.replace('ik.imagekit.io', 'example.com'), `${cdn}/mibatute/perfiles/${owner}/nested/file.webp`]) {
    assert.equal((await call('Bearer valid', source)).code, 400);
  }
  assert.equal(auth.mock.callCount(), 0);
  assert.equal((await call('Bearer bad')).code, 401);
  assert.equal((await call('Bearer guest')).code, 401);
  const result = await call('Bearer valid', `${photo}?tr=n-unsafe`);
  assert.equal(result.code, 200);
  const signed = new URL(result.body.url);
  const path = `tr:w-200,q-auto:eco,f-auto/mibatute/perfiles/${owner}/foto.webp`;
  assert.equal(signed.pathname, `/example/${path}`);
  const expiry = Number(signed.searchParams.get('ik-t'));
  assert.ok(expiry - Date.now() / 1000 > 290 && expiry - Date.now() / 1000 <= 300);
  assert.equal(signed.searchParams.get('ik-s'), createHmac('sha1', env.IMAGEKIT_PRIVATE_KEY).update(`${path}${expiry}`).digest('hex'));
  assert.equal(signed.searchParams.has('tr'), false);
});
