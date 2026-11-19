import { encodeCanvasImage } from './canvasImage.js';
import { IMAGE_UPLOAD_TYPES } from './uploadPolicy.js';

export const PROFILE_PHOTO_SIDE = 500;
export const PROFILE_PHOTO_MAX_SOURCE_MB = 8;

async function decodeProfilePhoto(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { image: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch { /* Use the browser image decoder when bitmap decoding is unsupported. */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return { image, width: image.naturalWidth, height: image.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error('No se pudo leer la foto. Prueba con otra imagen JPG, PNG o WebP.');
  }
}

export async function prepareProfilePhoto(file, {
  decode = decodeProfilePhoto, createCanvas = () => document.createElement('canvas'),
} = {}) {
  if (!file || !Object.hasOwn(IMAGE_UPLOAD_TYPES, file.type)) throw new Error('Usa una foto JPG, PNG, WebP o GIF.');
  if (!file.size || file.size > PROFILE_PHOTO_MAX_SOURCE_MB * 1024 * 1024) {
    throw new Error(`La foto original debe pesar entre 1 byte y ${PROFILE_PHOTO_MAX_SOURCE_MB} MB.`);
  }
  const decoded = await decode(file);
  let canvas;
  try {
    const { image, width, height } = decoded;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
      throw new Error('No se pudo leer el tamaño de la foto.');
    }
    canvas = createCanvas();
    canvas.width = PROFILE_PHOTO_SIDE;
    canvas.height = PROFILE_PHOTO_SIDE;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No se pudo preparar la foto. Intenta de nuevo.');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    // A white background keeps transparent sources consistent in the JPEG fallback.
    context.fillStyle = '#fff';
    context.fillRect(0, 0, PROFILE_PHOTO_SIDE, PROFILE_PHOTO_SIDE);
    const side = Math.min(width, height);
    context.drawImage(image, (width - side) / 2, (height - side) / 2, side, side,
      0, 0, PROFILE_PHOTO_SIDE, PROFILE_PHOTO_SIDE);
    return await encodeCanvasImage(canvas, { name: 'perfil', type: 'image/webp', quality: 0.82 });
  } finally {
    decoded.release?.();
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}
