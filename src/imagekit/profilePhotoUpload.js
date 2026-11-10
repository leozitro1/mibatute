import { supabase } from '../supabase/supabaseClient.js';
import { uploadLocalImage, useLocalImages } from './localImages.js';
import { imageUploadPolicy } from './uploadPolicy.js';

export async function uploadProfilePhoto(file, userId) {
  const folder = `/mibatute/perfiles/${userId}`;
  const metadata = { folder, fileSize: file.size, fileType: file.type };
  const { extension } = imageUploadPolicy(metadata);
  if (useLocalImages) return (await uploadLocalImage({ file, folder, fileName: `perfil.${extension}` })).url;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Inicia sesión para subir una foto.');
  const response = await fetch('/api/profile-photo-upload', { method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(metadata) });
  const { path, token, error } = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(error || 'No se pudo autorizar la foto.');
  if (typeof path !== 'string' || !path.startsWith(`${userId}/`) || typeof token !== 'string' || !token) throw new Error('No se pudo autorizar la foto.');
  const result = await supabase.storage.from('profile-photos').uploadToSignedUrl(path, token, file, { contentType: file.type, cacheControl: '300' });
  if (result.error) throw new Error('No se pudo subir la foto de perfil.');
  return `storage-profile:${path}`;
}
