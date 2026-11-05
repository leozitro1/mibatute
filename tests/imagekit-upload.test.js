import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadDirectImage } from '../src/imagekit/uploadTransport.js';

const folder = '/mibatute/articulos/00000000-0000-4000-8000-000000000001';
const file = new File(['image fixture'], 'original.webp', { type: 'image/webp' });
const uploadParameters = { folder, fileName: 'server.webp', useUniqueFileName: 'true', overwriteFile: 'false', checks: 'server checks' };

test('direct upload forwards exact server parameters to V2 and never forwards the user JWT to ImageKit', async () => {
  const calls = [];
  const result = await uploadDirectImage({ file, folder, accessToken: 'private-user-jwt', fetchImpl: async (url, request) => {
    calls.push(url);
    if (url === '/api/imagekit-auth') {
      assert.equal(request.method, 'POST');
      assert.equal(request.headers.Authorization, 'Bearer private-user-jwt');
      assert.deepEqual(JSON.parse(request.body), { folder, fileSize: file.size, fileType: file.type });
      return Response.json({ token: 'signed-upload-token', uploadParameters, urlEndpoint: 'https://ik.imagekit.io/test' });
    }
    assert.equal(url, 'https://upload.imagekit.io/api/v2/files/upload');
    assert.equal(request.headers, undefined);
    assert.equal(request.body.get('token'), 'signed-upload-token');
    assert.equal(await request.body.get('file').text(), await file.text());
    assert.deepEqual(Object.fromEntries([...request.body].filter(([name]) => !['file', 'token'].includes(name))), uploadParameters);
    return Response.json({ fileId: 'fixture', filePath: `${folder}/server.webp` });
  } });
  assert.equal(calls.length, 2, 'One authorization and one direct upload, as before');
  assert.equal(result.body.fileId, 'fixture');
});

test('invalid files, rejected authorizations and provider failures never trigger a legacy fallback or retries', async () => {
  let calls = 0;
  const unused = async () => { calls++; throw new Error('Unexpected network call'); };
  for (const badFile of [new File(['svg'], 'image.svg', { type: 'image/svg+xml' }), new File([], 'empty.webp', { type: 'image/webp' })]) {
    await assert.rejects(uploadDirectImage({ file: badFile, folder, accessToken: 'jwt', fetchImpl: unused }));
  }
  await assert.rejects(uploadDirectImage({ file, folder, accessToken: '', fetchImpl: unused }));
  assert.equal(calls, 0);
  await assert.rejects(uploadDirectImage({ file, folder, accessToken: 'jwt', fetchImpl: async () => {
    calls++;
    return Response.json({ error: 'Rate limited' }, { status: 429 });
  } }), /Rate limited/);
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(uploadDirectImage({ file, folder, accessToken: 'jwt', fetchImpl: async () => {
    calls++;
    if (calls === 1) return Response.json({ token: 'signed', uploadParameters });
    return Response.json({ message: 'File rejected by checks' }, { status: 400 });
  } }), /File rejected/);
  assert.equal(calls, 2);
});
