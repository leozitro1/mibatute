import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { localApiPlugin } from '../scripts/local-api.mjs';
import { seedLocal } from '../scripts/seed-local.mjs';

function middleware() {
  let handle;
  localApiPlugin({}).configureServer({ middlewares: { use(fn) { handle = fn; } } });
  return handle;
}

async function request(url, method, body = '') {
  const req = Readable.from([body]);
  Object.assign(req, { url, method, headers: {} });
  let status, result;
  const res = { statusCode: 200, setHeader() {}, end(value) { status = this.statusCode; result = value; } };
  await middleware()(req, res, () => { result = 'next'; });
  return { status, result };
}

test('local Vercel adapter routes known endpoints and rejects invalid JSON', async () => {
  assert.equal((await request('/api/imagekit-delete', 'POST', '{')).status, 400);
  assert.equal((await request('/api/imagekit-delete', 'POST', 'x'.repeat(16385))).status, 413);
  assert.equal((await request('/api/imagekit-auth', 'POST')).status, 405);
  assert.equal((await request('/unknown', 'GET')).result, 'next');
});

test('local fixture loader refuses any cloud database before connecting', async () => {
  await assert.rejects(seedLocal({ API_URL: 'https://sgxzjggxlswvpedrosck.supabase.co' }), /solo pueden crearse/);
});
