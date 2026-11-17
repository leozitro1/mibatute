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
