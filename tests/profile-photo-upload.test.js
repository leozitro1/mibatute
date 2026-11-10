import assert from 'node:assert/strict';
import process from 'node:process';
import test from 'node:test';
import handler from '../api/profile-photo-upload.js';

test('avatar upload authorizes one owned private path only after checking the account quota', async t => {
  const id = '00000000-0000-4000-8000-000000000001';
  const vars = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_ANON_KEY: 'test-public', SUPABASE_SERVICE_ROLE_KEY: 'test-server' };
  for (const [key, value] of Object.entries(vars)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
  let available = false, signatures = 0;
  const network = t.mock.method(globalThis, 'fetch', async (url, options) => {
    const path = new URL(url).pathname;
    const headers = new Headers(options.headers);
    if (path === '/auth/v1/user') return Response.json({ id, is_anonymous: headers.get('Authorization') === 'Bearer guest' });
    if (path.endsWith('/reserve_image_upload')) {
      assert.equal(headers.get('Authorization'), 'Bearer viewer');
      assert.deepEqual(JSON.parse(options.body), { p_scope: 'perfiles' });
      return Response.json(available ? { allowed: true } : { allowed: false, limit: 'profile', retryAt: new Date().toISOString(), retryAfter: 60 });
    }
    assert.match(path, new RegExp(`^/storage/v1/object/upload/sign/profile-photos/${id}/[a-f0-9-]{36}\\.png$`));
    assert.equal(headers.get('apikey'), vars.SUPABASE_SERVICE_ROLE_KEY);
    assert.notEqual(headers.get('x-upsert'), 'true');
    signatures++;
    return Response.json({ url: `${path.replace('/storage/v1', '')}?token=one-path-token` });
  });
  const call = async (token, folder = `/mibatute/perfiles/${id}`) => {
    const res = { setHeader(key, value) { this[key] = value; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
    await handler({ method: 'POST', headers: { authorization: token && `Bearer ${token}` }, body: { folder, fileType: 'image/png', fileSize: 70 } }, res);
    assert.equal(res['Cache-Control'], 'private, no-store');
    return res;
  };
  assert.equal((await call()).code, 401);
  assert.equal(network.mock.callCount(), 0);
  assert.equal((await call('guest')).code, 401);
  assert.equal((await call('viewer', '/mibatute/perfiles/00000000-0000-4000-8000-000000000002')).code, 403);
  assert.equal((await call('viewer', `/mibatute/articulos/${id}`)).code, 400);
  assert.equal((await call('viewer')).code, 429);
  assert.equal(signatures, 0);
  available = true;
  const result = await call('viewer');
  assert.equal(result.code, 200);
  assert.equal(result.body.token, 'one-path-token');
  assert.match(result.body.path, new RegExp(`^${id}/[a-f0-9-]{36}\\.png$`));
  assert.equal(signatures, 1);
});
