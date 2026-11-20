import { IMAGE_UPLOAD_TYPES } from './uploadPolicy.js';

const preparedImages = new WeakMap();
export function isPreparedCanvasImage(file, maxSide) {
  const dimensions = preparedImages.get(file);
  return !!dimensions && dimensions.width > 0 && dimensions.height > 0
    && dimensions.width <= maxSide && dimensions.height <= maxSide;
}

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

  const file = new File([blob], `${name}.${IMAGE_UPLOAD_TYPES[blob.type]}`, { type: blob.type });
  preparedImages.set(file, { width: canvas.width, height: canvas.height });
  return file;
}
