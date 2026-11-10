import { supabase } from '../supabase/supabaseClient';
import { imageUploadPolicy } from './uploadPolicy.js';
import { reserveImageUpload } from './uploadQuota.js';

export const useLocalImages = import.meta.env.DEV && import.meta.env.VITE_LOCAL_SERVICES === 'true';

function requireLocalBackend() {
  const url = new URL(import.meta.env.VITE_SUPABASE_URL);
  if (!useLocalImages || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new Error('Las imagenes de prueba requieren Supabase local.');
  }
}

export async function uploadLocalImage({ file, folder, fileName }) {
  requireLocalBackend();
  const policy = imageUploadPolicy({ folder, fileSize: file.size, fileType: file.type });
  await reserveImageUpload(supabase, policy.scope);
  const path = `${folder.replace(/^\/+|\/+$/g, '')}/${crypto.randomUUID()}-${fileName}`;
  const isProfile = policy.scope === 'perfiles';
  const bucket = supabase.storage.from(isProfile ? 'local-profile-photos' : 'local-images');
  const { error } = await bucket.upload(path, file, { contentType: file.type });
  if (error) throw error;
  const url = isProfile ? `local-profile:${path}` : bucket.getPublicUrl(path).data.publicUrl;
  return {
    success: true,
    fileId: `local:${path}`,
    filePath: path,
    url,
    thumbnailUrl: url,
    detailUrl: url,
  };
}

export async function removeLocalImages(fileIds) {
  requireLocalBackend();
  if (fileIds.some(id => !id.startsWith('local:'))) {
    throw new Error('No se pueden borrar imagenes externas desde el entorno local.');
  }
  const { error } = await supabase.storage.from('local-images').remove(fileIds.map(id => id.slice(6)));
  if (error) throw error;
  return { success: true };
}
