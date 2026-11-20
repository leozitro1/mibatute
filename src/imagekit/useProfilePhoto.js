import { useEffect, useState } from 'react';
import { supabase } from '../supabase/supabaseClient.js';
import { useLocalImages } from './localImages.js';
import { createProfilePhotoResolver } from './profilePhotoCache.js';

const resolvePhoto = createProfilePhotoResolver();

async function resolveProfilePhoto(source, client, accessToken) {
  if (source.startsWith('storage-profile:')) {
    const path = source.slice('storage-profile:'.length);
    if (!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.(?:jpg|png|webp|gif)$/i.test(path)) return '';
    const { data } = await client.storage.from('profile-photos').createSignedUrl(path, 300);
    return data?.signedUrl || '';
  }
  if (useLocalImages && source.startsWith('local-profile:')) {
    const { data } = await client.storage.from('local-profile-photos').createSignedUrl(source.slice(14), 300);
    return data?.signedUrl || '';
  }
  if (useLocalImages && source.startsWith(`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/local-images/mibatute/perfiles/`)) return source;
  const response = await fetch('/api/profile-photo', { method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ source }) });
  return response.ok ? (await response.json()).url || '' : '';
}

function requestProfilePhoto(source, client) {
  return resolvePhoto(source, client, resolveProfilePhoto);
}

export default function useProfilePhoto(source, client = supabase) {
  const [resolved, setResolved] = useState(null);
  const reference = typeof source === 'string' ? source.trim() : '';
  useEffect(() => {
    if (!reference) return;
    let active = true;
    requestProfilePhoto(reference, client).then(url => { if (active) setResolved({ reference, client, url }); }).catch(() => {});
    return () => { active = false; };
  }, [reference, client]);
  return reference && resolved?.reference === reference && resolved.client === client ? resolved.url : '';
}
