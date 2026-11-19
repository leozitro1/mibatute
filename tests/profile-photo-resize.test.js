import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareProfilePhoto, PROFILE_PHOTO_SIDE } from '../src/imagekit/prepareProfilePhoto.js';

function renderer(width, height, { encoders = ['image/webp'], fail = false } = {}) {
  const draws = [], encodings = [], image = {}, lifecycle = { released: false };
  const context = { fillRect() {}, drawImage(...args) { draws.push(args); } };
  const canvas = {
    width: 0, height: 0, getContext: () => context,
    toBlob(callback, type, quality) {
      encodings.push({ width: canvas.width, height: canvas.height, type, quality });
      callback(fail ? null : new Blob(['optimized'], { type: encoders.shift() }));
    },
  };
  return { image, canvas, draws, encodings, lifecycle,
    decode: async () => ({ image, width, height, release: () => { lifecycle.released = true; } }), createCanvas: () => canvas };
}

test('landscape, portrait, square and small sources become centered 500px squares without distortion', async () => {
  const source = new File(['original photo'], 'original.png', { type: 'image/png' });
  for (const [width, height, expected] of [
    [4000, 2000, [1000, 0, 2000, 2000]],
    [1200, 2400, [0, 600, 1200, 1200]],
    [1000, 1000, [0, 0, 1000, 1000]],
    [100, 200, [0, 50, 100, 100]],
  ]) {
    const r = renderer(width, height);
    const file = await prepareProfilePhoto(source, r);
    assert.deepEqual(r.draws, [[r.image, ...expected, 0, 0, 500, 500]]);
    assert.deepEqual(r.encodings, [{ width: PROFILE_PHOTO_SIDE, height: PROFILE_PHOTO_SIDE, type: 'image/webp', quality: 0.82 }]);
    assert.equal(file.type, 'image/webp'); assert.equal(file.name, 'perfil.webp');
    assert.equal(await file.text(), 'optimized'); assert.notEqual(file, source);
    assert.equal(r.lifecycle.released, true); assert.equal(r.canvas.width, 0); assert.equal(r.canvas.height, 0);
  }
});

test('unsupported formats, empty and oversized originals never reach the image decoder', async () => {
  const decode = () => { throw new Error('unexpected decoding'); };
  for (const file of [
    { type: 'image/svg+xml', size: 10 }, { type: 'image/heic', size: 10 },
    { type: 'image/jpeg', size: 0 }, { type: 'image/jpeg', size: 8 * 1024 * 1024 + 1 },
  ]) await assert.rejects(prepareProfilePhoto(file, { decode }), /Usa una foto|foto original/);
});

test('JPEG fallback still encodes the resized square and never returns the original', async () => {
  const r = renderer(3000, 2000, { encoders: ['image/png', 'image/jpeg'] });
  const file = await prepareProfilePhoto(new File(['source'], 'source.gif', { type: 'image/gif' }), r);
  assert.equal(file.name, 'perfil.jpg'); assert.equal(file.type, 'image/jpeg');
  assert.ok(r.encodings.every(item => item.width === 500 && item.height === 500));
  assert.equal(r.lifecycle.released, true);
});

test('failed encoding and invalid dimensions release image resources without uploading a source fallback', async () => {
  const source = new File(['source'], 'source.jpg', { type: 'image/jpeg' });
  const failed = renderer(1000, 1000, { fail: true });
  await assert.rejects(prepareProfilePhoto(source, failed), /No se pudo generar/);
  assert.equal(failed.lifecycle.released, true); assert.equal(failed.canvas.width, 0);
  const invalid = renderer(0, 300);
  await assert.rejects(prepareProfilePhoto(source, invalid), /tamaño/);
  assert.equal(invalid.lifecycle.released, true); assert.equal(invalid.draws.length, 0);
});
