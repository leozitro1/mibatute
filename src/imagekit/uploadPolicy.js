export const IMAGEKIT_UPLOAD_URL = 'https://upload.imagekit.io/api/v2/files/upload';
export const IMAGE_UPLOAD_TYPES = Object.freeze({
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
});

export function imageUploadPolicy({ folder, fileSize, fileType } = {}) {
  const match = typeof folder === 'string' && folder.match(/^\/mibatute\/(articulos|perfiles)\/([a-f0-9-]{36})$/i);
  if (!match) throw new Error('Destino de imagen no válido.');
  if (!Object.hasOwn(IMAGE_UPLOAD_TYPES, fileType)) throw new Error('Usa una imagen JPG, PNG, WebP o GIF.');
  const maxBytes = (match[1] === 'perfiles' ? 3 : 8) * 1024 * 1024;
  if (!Number.isSafeInteger(fileSize) || fileSize < 1 || fileSize > maxBytes) {
    throw new Error(`La imagen debe pesar entre 1 byte y ${maxBytes / 1024 / 1024} MB.`);
  }
  return { ownerId: match[2], scope: match[1], extension: IMAGE_UPLOAD_TYPES[fileType], maxBytes };
}
