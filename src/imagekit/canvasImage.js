import { IMAGE_UPLOAD_TYPES } from './uploadPolicy.js';

function encode(canvas, type, quality) {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

export async function encodeCanvasImage(canvas, { name, type, quality }) {
  let blob = await encode(canvas, type, quality);

  // Canvas can return PNG when the requested encoder is unavailable.
  if (blob?.type === 'image/png' && type !== 'image/png') {
    const jpeg = await encode(canvas, 'image/jpeg', quality);
    if (jpeg?.type === 'image/jpeg') blob = jpeg;
  }

  if (!blob?.size || !Object.hasOwn(IMAGE_UPLOAD_TYPES, blob.type)) {
    throw new Error('No se pudo generar la foto. Intenta con otra imagen.');
  }

  return new File([blob], `${name}.${IMAGE_UPLOAD_TYPES[blob.type]}`, { type: blob.type });
}
