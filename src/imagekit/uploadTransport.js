import { IMAGEKIT_UPLOAD_URL, imageUploadPolicy } from './uploadPolicy.js';

export async function uploadDirectImage({ file, folder, accessToken, fetchImpl = fetch }) {
  const metadata = { folder, fileSize: file.size, fileType: file.type };
  imageUploadPolicy(metadata);
  if (!accessToken) throw new Error('Debes iniciar sesión para subir imágenes.');
  const authResponse = await fetchImpl('/api/imagekit-auth', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(metadata),
  });
  const auth = await authResponse.json().catch(() => ({}));
  if (!authResponse.ok) throw new Error(auth.error || 'No se pudo autorizar la imagen.');
  if (auth.uploadParameters?.folder !== folder || typeof auth.token !== 'string' || !auth.token) {
    throw new Error('La autorización de imagen no es válida. Recarga la página.');
  }
  const form = new FormData();
  form.append('file', file);
  form.append('token', auth.token);
  for (const [name, value] of Object.entries(auth.uploadParameters)) form.append(name, value);
  const response = await fetchImpl(IMAGEKIT_UPLOAD_URL, { method: 'POST', body: form });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.error || 'No se pudo subir la imagen.');
  return { body, urlEndpoint: auth.urlEndpoint };
}
