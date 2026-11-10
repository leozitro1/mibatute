import { createClient } from '@supabase/supabase-js';
import process from 'node:process';
import { createBudgetFetch } from '../server/requestBudget.js';
import { signProfilePhoto } from '../server/profilePhotoUrl.js';

export default async function profilePhoto(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  const send = (status, body) => res.status(status).json(body);
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(405, { error: 'Método no permitido.' });
  }
  const token = typeof req.headers.authorization === 'string' && req.headers.authorization.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) return send(401, { error: 'Inicia sesión para ver la foto.' });
  const source = req.body?.source;
  if (typeof source !== 'string' || source.length > 1500) return send(400, { error: 'Foto no válida.' });
  const endpoint = process.env.IMAGEKIT_URL_ENDPOINT || process.env.VITE_IMAGEKIT_URL_ENDPOINT;
  const key = process.env.IMAGEKIT_PRIVATE_KEY;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!endpoint || !key || !url || !anon) return send(503, { error: 'No se pudo cargar la foto.' });
  try {
    const signed = signProfilePhoto(source, endpoint, key);
    if (!signed) return send(400, { error: 'Foto no válida.' });
    const client = createClient(url, anon, { global: { fetch: createBudgetFetch() }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.auth.getUser(token);
    if (error || !data?.user?.id || data.user.is_anonymous) return send(401, { error: 'Inicia sesión para ver la foto.' });
    return send(200, { url: signed });
  } catch { return send(503, { error: 'No se pudo cargar la foto.' }); }
}
