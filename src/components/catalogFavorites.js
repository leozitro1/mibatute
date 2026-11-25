import { isPublicationUnavailable } from './articleLifetime.js';

const finished = new Set(['vencido','expired','vendido','sold','entregado','delivered','finalizado','finalized','completed']);
const idOf = article => String(article?.id ?? article?.articulo_id ?? article?.uuid ?? article?.product_id ?? '');
const statusOf = article => String(article?.estado || article?.status || '').trim().toLowerCase();

export function favoriteLifecycle(article) {
  const lifecycle = {};
  const status = statusOf(article);
  if (status) lifecycle.status = status;
  for (const key of ['created_at','publication_expires_at','updated_at']) {
    if (article?.[key] === null) lifecycle[key] = null;
    else if (typeof article?.[key] === 'string' && Number.isFinite(Date.parse(article[key]))) lifecycle[key] = article[key];
  }
  return lifecycle;
}

export function isFavoriteFinished(article, now = Date.now()) {
  const status = statusOf(article);
  return finished.has(status) || isPublicationUnavailable({...article,estado:status,status},now);
}

// Missing rows are not proof of delivery/deletion: only use confirmed states and known deadlines.
export function cleanCatalogFavorites(favorites, articles, now = Date.now()) {
  const latest = new Map();
  for (const article of articles) {
    const id = idOf(article), previous = latest.get(id);
    if (id && (!previous || (Date.parse(article.updated_at || '') || 0) > (Date.parse(previous.updated_at || '') || 0))) latest.set(id,article);
  }
  let changed = false;
  const result = [];
  for (const favorite of favorites) {
    const known = favorite.lifecycle || {}, article = latest.get(String(favorite.id));
    const stale = article && Date.parse(article.updated_at || '') < Date.parse(known.updated_at || '');
    const lifecycle = article && !stale ? {...known,...favoriteLifecycle(article)} : known;
    if (isFavoriteFinished(lifecycle,now)) { changed = true; continue; }
    if (JSON.stringify(known) !== JSON.stringify(lifecycle)) {
      changed = true; result.push({...favorite,lifecycle});
    } else result.push(favorite);
  }
  return changed ? result : favorites;
}
