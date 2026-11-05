import test from 'node:test';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import assert from 'node:assert/strict';
import handler from '../api/imagekit-auth.js';

test('ImageKit V2 signs only bounded raster uploads in the verified user folder without cache or legacy fallback', async () => {
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
  let quota = { allowed: true };
  let quotaStatus = 200;
  let quotaCalls = 0;
  const userId = '00000000-0000-4000-8000-000000000001';
  const metadata = { folder: `/mibatute/articulos/${userId}`, fileSize: 1234, fileType: 'image/webp' };
  globalThis.fetch = async (url, request) => {
    calls++;
    if (String(url).includes('/rpc/reserve_image_upload')) {
      quotaCalls++;
      assert.equal(request.headers.get('Authorization'), 'Bearer valid-token');
      return Response.json(quota, { status: quotaStatus });
    }
    return valid ? Response.json({ id: userId }) : Response.json({ message: 'Invalid token' }, { status: 401 });
  };
  const run = async (authorization, body = metadata, method = 'POST') => {
    const headers = {};
    const res = { headers, setHeader(key, value) { headers[key] = value; }, end(value) { this.body = JSON.parse(value); } };
    await handler({ method, headers: { authorization }, body }, res);
    assert.equal(headers['Cache-Control'], 'no-store');
    return res;
  };
  try {
    for (const value of [undefined, '', 'Basic test-token', 'Bearer ', 'Bearer token extra', ['Bearer token']]) {
      assert.equal((await run(value)).statusCode, 401);
    }
    assert.equal(calls, 0, 'Malformed requests must not call Supabase');
    assert.equal((await run('Bearer valid-token', metadata, 'GET')).statusCode, 405);
    assert.equal(calls, 0, 'The legacy signer must remain disabled');
    for (const body of [
      { ...metadata, folder: `${metadata.folder}/../other` },
      { ...metadata, fileType: 'image/svg+xml' },
      { ...metadata, fileSize: 0 },
      { ...metadata, fileSize: 8 * 1024 * 1024 + 1 },
      { ...metadata, fileSize: '1234' },
    ]) assert.equal((await run('Bearer valid-token', body)).statusCode, 400);
    assert.equal(calls, 0, 'Invalid metadata must not reach Supabase');
    const denied = await run('Bearer invalid-token');
    assert.equal(denied.statusCode, 401);
    assert.equal(denied.body.token, undefined);
    valid = true;
    const accepted = await run('Bearer valid-token');
    assert.equal(accepted.statusCode, 200);
    assert.ok(accepted.body.token);
    assert.equal(accepted.body.privateKey, undefined);
    assert.equal(accepted.body.signature, undefined, 'Never return a V1 signature');
    const [encodedHeader, encodedPayload, signature] = accepted.body.token.split('.');
    const decode = value => JSON.parse(Buffer.from(value, 'base64url'));
    assert.deepEqual(decode(encodedHeader), { alg: 'HS256', typ: 'JWT', kid: 'test-public' });
    const payload = decode(encodedPayload);
    assert.equal(payload.exp - payload.iat, 300);
    const { iat, exp, ...parameters } = payload;
    assert.equal(Number.isInteger(iat) && exp > Date.now() / 1000, true);
    assert.deepEqual(parameters, accepted.body.uploadParameters);
    assert.equal(parameters.folder, metadata.folder);
    assert.match(parameters.fileName, /^[a-f0-9-]{36}\.webp$/);
    assert.equal(parameters.useUniqueFileName, 'true');
    assert.equal(parameters.overwriteFile, 'false');
    assert.equal(parameters.checks, '"file.mime" = "image/webp" AND "file.size" <= 8388608');
    const key = await webcrypto.subtle.importKey('raw', Buffer.from('test-private'), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const verify = encoded => webcrypto.subtle.verify('HMAC', key, Buffer.from(signature, 'base64url'), Buffer.from(`${encodedHeader}.${encoded}`));
    assert.equal(await verify(encodedPayload), true);
    for (const change of [{ folder: '/other' }, { checks: '' }, { overwriteFile: 'true' }, { exp: exp + 3600 }]) {
      const forged = Buffer.from(JSON.stringify({ ...payload, ...change })).toString('base64url');
      assert.equal(await verify(forged), false, 'Upload restrictions must be cryptographically bound');
    }
    const foreign = await run('Bearer valid-token', { ...metadata, folder: '/mibatute/articulos/00000000-0000-4000-8000-000000000002' });
    assert.equal(foreign.statusCode, 403);
    assert.equal(foreign.body.token, undefined);
    const profile = await run('Bearer valid-token', { ...metadata, folder: `/mibatute/perfiles/${userId}`, fileType: 'image/jpeg' });
    assert.equal(profile.body.uploadParameters.checks, '"file.mime" = "image/jpeg" AND "file.size" <= 3145728');
    assert.notEqual(profile.body.token, accepted.body.token);
    assert.equal(quotaCalls, 2, 'Only valid owned uploads reserve quota');
    for (const limit of ['burst', 'daily', 'profile']) {
      quota = { allowed: false, limit, retryAfter: 600, retryAt: new Date(Date.now() + 600000).toISOString() };
      const limited = await run('Bearer valid-token');
      assert.equal(limited.statusCode, 429);
      assert.equal(limited.headers['Retry-After'], '600');
      assert.equal(limited.body.retryAt, quota.retryAt);
      assert.equal(limited.body.code, 'IMAGE_UPLOAD_LIMIT');
      assert.match(limited.body.error, /hora de Colombia/);
      assert.equal(limited.body.token, undefined);
      assert.equal(limited.body.uploadParameters, undefined);
    }
    quotaStatus = 503;
    quota = { message: 'Unavailable', code: 'PGRST202' };
    assert.equal((await run('Bearer valid-token')).statusCode, 503);
    quotaStatus = 200;
    quota = {};
    assert.equal((await run('Bearer valid-token')).statusCode, 503, 'Unexpected RPC results never bypass quota');
  } finally {
    globalThis.fetch = original;
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});
