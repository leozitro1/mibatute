import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeCanvasImage } from '../src/imagekit/canvasImage.js';

const options = { name: 'foto', type: 'image/webp', quality: 0.82 };

test('canvas output keeps its actual MIME and matching extension', async () => {
  for (const [encoders, expectedType, expectedName] of [
    [['image/webp'], 'image/webp', 'foto.webp'],
    [['image/png', 'image/jpeg'], 'image/jpeg', 'foto.jpg'],
    [['image/png', 'image/png'], 'image/png', 'foto.png'],
  ]) {
    const outputs = [...encoders];
    const canvas = {
      toBlob(callback) {
        const type = outputs.shift();
        assert.ok(type);
        callback(new Blob([type], { type }));
      },
    };
    const file = await encodeCanvasImage(canvas, options);
    assert.equal(file.type, expectedType);
    assert.equal(file.name, expectedName);
    assert.equal(await file.text(), expectedType);
    assert.equal(outputs.length, 0);
  }
});

test('only files actually encoded by our canvas can skip a second lossy compression', async () => {
  const { isPreparedCanvasImage } = await import('../src/imagekit/canvasImage.js');
  const canvas = { width: 800, height: 800, toBlob: callback => callback(new Blob(['encoded'], { type: 'image/webp' })) };
  const file = await encodeCanvasImage(canvas, options);
  canvas.width = 0; canvas.height = 0;
  assert.equal(isPreparedCanvasImage(file, 1600), true, 'Dimensions survive canvas cleanup');
  assert.equal(isPreparedCanvasImage(file, 500), false);
  assert.equal(isPreparedCanvasImage(new File([file], file.name, { type: file.type }), 1600), false, 'Filename/type cannot spoof preparation');
  assert.equal(isPreparedCanvasImage(null, 1600), false);
});
