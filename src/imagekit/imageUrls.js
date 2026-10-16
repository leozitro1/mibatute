// Use the same CDN transformations as uploads. Never proxy images through Vercel
// or rewrite local, foreign, signed, or specially cropped URLs.
export function cardImageUrl(source, endpoint = import.meta.env?.VITE_IMAGEKIT_URL_ENDPOINT) {
  if (!source || !endpoint) return source;
  try {
    const url = new URL(source), base = new URL(endpoint);
    if (url.protocol !== 'https:' || url.origin !== base.origin || url.searchParams.has('ik-s')) return source;
    const prefix = base.pathname.replace(/\/+$/, '') + '/';
    if (!url.pathname.startsWith(prefix)) return source;
    let path = url.pathname.slice(prefix.length);
    if (path.startsWith('tr:')) {
      if (!/^tr:w-\d+,q-auto:eco,f-auto\//.test(path)) return source;
      path = path.slice(path.indexOf('/') + 1);
    }
    url.pathname = `${prefix}tr:w-500,q-auto:eco,f-auto/${path}`;
    return url.href;
  } catch { return source; }
}
