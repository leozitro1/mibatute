import test from 'node:test';
import assert from 'node:assert/strict';
import { createProfilePhotoResolver } from '../src/imagekit/profilePhotoCache.js';

const session = (patch = {}) => ({ access_token: 'session-a', user: { id: 'user-a', is_anonymous: false }, ...patch });
const clientFor = read => ({ auth: { getSession: async () => ({ data: { session: read() } }) } });

test('avatars reuse one authorization for concurrent mounts and later mounts within four minutes', async () => {
  let clock = 0, calls = 0;
  const read = createProfilePhotoResolver({ now: () => clock });
  const client = clientFor(() => session());
  const sign = async () => { calls++; return `signed-${calls}`; };
  assert.deepEqual(await Promise.all([read('photo', client, sign), read('photo', client, sign)]), ['signed-1', 'signed-1']);
  clock = 239_999;
  assert.equal(await read('photo', client, sign), 'signed-1');
  assert.equal(calls, 1);
  clock = 240_000;
  assert.equal(await read('photo', client, sign), 'signed-2');
});

test('cache never serves a signed photo to a signed-out, anonymous, expired or different session/client', async () => {
  let current = session(), calls = 0, clock = 0;
  const read = createProfilePhotoResolver({ now: () => clock });
  const client = clientFor(() => current), otherClient = clientFor(() => current);
  const sign = async () => `signed-${++calls}`;
  assert.equal(await read('photo', client, sign), 'signed-1');
  current = null;
  assert.equal(await read('photo', client, sign), '');
  current = session({ user: { id: 'guest', is_anonymous: true } });
  assert.equal(await read('photo', client, sign), '');
  current = session({ access_token: 'session-b', user: { id: 'user-b' } });
  assert.equal(await read('photo', client, sign), 'signed-2');
  assert.equal(await read('photo', otherClient, sign), 'signed-3');
  current = session({ access_token: 'refreshed-token', user: { id: 'user-b' }, expires_at: 1 });
  assert.equal(await read('photo', client, sign), 'signed-4');
  clock = 1000;
  assert.equal(await read('photo', client, sign), '');
  assert.equal(calls, 4);
});

test('authorization errors and empty results are not retained, and the cache stays bounded', async () => {
  const read = createProfilePhotoResolver({ limit: 2 });
  const client = clientFor(() => session());
  let calls = 0;
  await assert.rejects(read('a', client, async () => { throw new Error('Temporary failure'); }), /Temporary/);
  assert.equal(await read('a', client, async () => ''), '');
  const sign = async () => `signed-${++calls}`;
  await read('a', client, sign);
  await read('b', client, sign);
  await read('c', client, sign);
  assert.equal(await read('b', client, sign), 'signed-2');
  assert.equal(await read('a', client, sign), 'signed-4');
});

test('a burst of 1000 logical avatar consumers shares one authorization without persistent storage', async () => {
  const read = createProfilePhotoResolver();
  const client = clientFor(() => session());
  let calls = 0;
  const sign = async () => { calls++; return 'one-signed-url'; };
  const values = await Promise.all(Array.from({ length: 1000 }, () => read('same-photo', client, sign)));
  assert.equal(calls, 1);
  assert.ok(values.every(value => value === 'one-signed-url'));
});
