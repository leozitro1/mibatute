import test from 'node:test';
import process from 'node:process';
import assert from 'node:assert/strict';
import handler from '../api/imagekit-auth.js';

test('ImageKit signatures are never cached and require a verified bearer session', async () => {
  const names = ['IMAGEKIT_PRIVATE_KEY', 'IMAGEKIT_PUBLIC_KEY', 'IMAGEKIT_URL_ENDPOINT', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  Object.assign(process.env, {
    IMAGEKIT_PRIVATE_KEY: 'test-private', IMAGEKIT_PUBLIC_KEY: 'test-public',
    IMAGEKIT_URL_ENDPOINT: 'https://ik.imagekit.io/test',
    SUPABASE_URL: 'https://test.supabase.co', SUPABASE_ANON_KEY: 'test-anon',
  });
  const original = globalThis.fetch;
  let calls = 0;
  let valid = false;
  globalThis.fetch = async () => {
    calls++;
    return valid ? Response.json({ id: 'test-user' }) : Response.json({ message: 'Invalid token' }, { status: 401 });
  };
  const run = async authorization => {
    const headers = {};
    const res = { setHeader(key, value) { headers[key] = value; }, end(value) { this.body = JSON.parse(value); } };
    await handler({ method: 'GET', headers: { authorization } }, res);
    assert.equal(headers['Cache-Control'], 'no-store');
    return res;
  };
  try {
    for (const value of [undefined, '', 'Basic test-token', 'Bearer ', 'Bearer token extra', ['Bearer token']]) {
      assert.equal((await run(value)).statusCode, 401);
    }
    assert.equal(calls, 0, 'Malformed requests must not call Supabase');
    const denied = await run('Bearer invalid-token');
    assert.equal(denied.statusCode, 401);
    assert.equal(denied.body.signature, undefined);
    valid = true;
    const accepted = await run('Bearer valid-token');
    assert.equal(accepted.statusCode, 200);
    assert.ok(accepted.body.signature);
    assert.equal(accepted.body.privateKey, undefined);
  } finally {
    globalThis.fetch = original;
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});
