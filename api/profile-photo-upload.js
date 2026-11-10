import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { imageUploadPolicy } from '../src/imagekit/uploadPolicy.js';
import { reserveImageUpload } from '../src/imagekit/uploadQuota.js';
import { createBudgetFetch } from '../server/requestBudget.js';

export default async function profilePhotoUpload(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  const send = (status, body) => res.status(status).json(body);
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(405, { error: 'Método no permitido.' });
  }
  const token = typeof req.headers.authorization === 'string' && req.headers.authorization.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) return send(401, { error: 'Inicia sesión para subir una foto.' });
  let policy;
  try { policy = imageUploadPolicy(req.body); } catch (error) { return send(400, { error: error.message }); }
  if (policy.scope !== 'perfiles') return send(400, { error: 'Destino de imagen no válido.' });

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const unavailable = () => send(503, { error: 'No se pudo autorizar la foto de perfil.' });
  if (!url || !anon || !key) return unavailable();
  const fetch = createBudgetFetch();
  const auth = { persistSession: false, autoRefreshToken: false };
  try {
    const client = createClient(url, anon, { global: { fetch, headers: { Authorization: `Bearer ${token}` } }, auth });
    const { data, error } = await client.auth.getUser(token);
    if (error || !data?.user?.id || data.user.is_anonymous) return send(401, { error: 'Inicia sesión para subir una foto.' });
    if (policy.ownerId !== data.user.id) return send(403, { error: 'Solo puedes subir tu propia foto.' });
    try { await reserveImageUpload(client, 'perfiles'); } catch (failure) {
      if (failure.retryAfter) res.setHeader('Retry-After', String(failure.retryAfter));
      return send(failure.status || 503, { error: failure.message });
    }
    const path = `${data.user.id}/${randomUUID()}.${policy.extension}`;
    const service = createClient(url, key, { global: { fetch }, auth });
    const grant = await service.storage.from('profile-photos').createSignedUploadUrl(path, { upsert: false });
    if (grant.error || !grant.data?.token) return unavailable();
    return send(200, { path, token: grant.data.token });
  } catch { return unavailable(); }
}
