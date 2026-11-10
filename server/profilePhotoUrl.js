import { createHmac } from 'node:crypto';

export function signProfilePhoto(source, endpoint, key, now = Date.now()) {
  try {
    const base = new URL(endpoint), image = new URL(source);
    if (base.protocol !== 'https:' || base.origin !== image.origin || image.username || image.password) return '';
    const prefix = `${base.pathname.replace(/\/+$/, '')}/`;
    if (!image.pathname.startsWith(prefix)) return '';
    const path = image.pathname.slice(prefix.length).replace(/^tr:w-\d+,q-auto:eco,f-auto\//, '');
    if (!/^mibatute\/perfiles\/[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}\/[\w.-]+\.(?:jpg|jpeg|png|webp|gif)$/i.test(path)) return '';
    const transformed = `tr:w-200,q-auto:eco,f-auto/${path}`;
    const expires = Math.floor(now / 1000) + 300;
    const signature = createHmac('sha1', key).update(`${transformed}${expires}`).digest('hex');
    return `${base.origin}${prefix}${transformed}?ik-t=${expires}&ik-s=${signature}`;
  } catch { return ''; }
}
