import { createHash, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export const sha256 = value => createHash('sha256').update(value).digest('hex');

export function wompiConfig(env = process.env) {
  const environment = env.WOMPI_ENVIRONMENT || 'test';
  const prefix = environment === 'prod' ? 'prod' : 'test';
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  const configured = env.WOMPI_ENABLED === 'true' && ['test','prod'].includes(environment) && !!url && !!anonKey
    && env.WOMPI_PUBLIC_KEY?.startsWith(`pub_${prefix}_`)
    && env.WOMPI_PRIVATE_KEY?.startsWith(`prv_${prefix}_`)
    && env.WOMPI_INTEGRITY_SECRET?.startsWith(`${prefix}_integrity_`)
    && env.WOMPI_EVENTS_SECRET?.startsWith(`${prefix}_events_`)
    && !!env.SUPABASE_SERVICE_ROLE_KEY;
  return { environment, configured: !!configured, url, anonKey,
    publicKey: env.WOMPI_PUBLIC_KEY, privateKey: env.WOMPI_PRIVATE_KEY,
    integritySecret: env.WOMPI_INTEGRITY_SECRET, eventsSecret: env.WOMPI_EVENTS_SECRET,
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
    apiUrl: environment === 'prod' ? 'https://production.wompi.co/v1' : 'https://sandbox.wompi.co/v1' };
}

export function checkoutUrl(order, config) {
  const url = new URL('https://checkout.wompi.co/p/');
  const signature = sha256(`${order.reference}${order.amount_in_cents}${order.currency}${order.expires_at}${config.integritySecret}`);
  for (const [key,value] of Object.entries({ 'public-key': config.publicKey, currency: order.currency,
    'amount-in-cents': order.amount_in_cents, reference: order.reference,
    'expiration-time': order.expires_at, 'signature:integrity': signature })) url.searchParams.set(key,String(value));
  return url.href;
}

export function verifyWompiEvent(event, secret) {
  try {
    const properties = event?.signature?.properties;
    const checksum = event?.signature?.checksum;
    if (!secret || !Array.isArray(properties) || properties.length < 1 || properties.length > 30
      || !Number.isSafeInteger(event.timestamp) || !/^[a-f0-9]{64}$/i.test(checksum || '')) return false;
    const values = properties.map(path => {
      if (typeof path !== 'string' || !/^[a-zA-Z0-9_.]+$/.test(path)) throw new Error('Invalid path');
      let value = event.data;
      for (const key of path.split('.')) {
        if (['__proto__','constructor','prototype'].includes(key) || !Object.hasOwn(value || {},key)) throw new Error('Missing value');
        value = value[key];
      }
      if (!['string','number','boolean'].includes(typeof value)) throw new Error('Invalid value');
      return String(value);
    });
    const expected = sha256(`${values.join('')}${event.timestamp}${secret}`);
    return timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(checksum,'hex'));
  } catch { return false; }
}

export function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type','application/json');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify(body));
}

export async function authenticatedClient(req, config) {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;
  const client = createClient(config.url,config.anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data,error } = await client.auth.getUser(token);
  return !error && data?.user?.id ? client : null;
}
