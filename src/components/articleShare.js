const ARTICLE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sharedArticleId(href) {
  const id = new URL(href).searchParams.get('articulo');
  return ARTICLE_ID.test(id || '') ? id : null;
}

export function articleShareUrl(id, href) {
  if (!ARTICLE_ID.test(String(id || ''))) return null;
  const url = new URL('/', new URL(href).origin);
  url.searchParams.set('articulo', id);
  return url.href;
}

export async function shareArticle({ id, title, href, navigator: browser }) {
  const url = articleShareUrl(id, href);
  if (!url) throw new Error('No se pudo crear el enlace.');
  if (typeof browser.share === 'function') {
    try {
      await browser.share({ title: `${title || 'Publicación'} · MiBatute`, url });
      return { status: 'shared', url };
    } catch (error) {
      if (error?.name === 'AbortError') return { status: 'cancelled', url };
    }
  }
  try {
    if (!browser.clipboard?.writeText) return { status: 'manual', url };
    await browser.clipboard.writeText(url);
    return { status: 'copied', url };
  } catch {
    return { status: 'manual', url };
  }
}
