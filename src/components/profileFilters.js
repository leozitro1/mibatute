import { isSaleArticle } from '../supabase/articleContext.js';
import { preferLatestArticle } from './articleState.js';
import { isPublicationUnavailable } from './articleLifetime.js';
import { saleCancellation, donationRejection } from '../supabase/rescatesQuery.js';

export const DEFAULT_PROFILE_FILTERS = Object.freeze({
  search: '', status: 'todos', type: 'todos', activity: 'todos', featured: false, sort: 'priority',
});

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function statusOf(article) {
  const status = normalize(article.estado || article.status || 'disponible');
  return { available: 'disponible', reserved: 'reservado', delivered: 'entregado',
    'en revision': 'en_revision', revision: 'en_revision', review: 'en_revision' }[status] || status;
}

export function canRateProfileArticle(article, { rescates = false, userId } = {}) {
  if (statusOf(article) !== 'entregado') return false;
  const recipient = isSaleArticle(article)
    ? article.buyer_id || article.buyerId
    : article.ganador_id || article.winner_id || article.winnerUid || article.recipient_id;
  if (!recipient) return false;
  return !rescates || (!!article.owner_id && !!userId && String(recipient) === String(userId));
}

export function filterProfileItems(items, filters, {
  rescates = false, unread = new Map(), notifications = {}, chats = new Map(),
  posts = new Map(), overrides = new Map(), featured = {}, rated = new Set(), userId, now = Date.now(),
} = {}) {
  const term = normalize(filters.search);
  return items.map((row, index) => {
    const raw = rescates ? row.articulo || {} : row;
    const id = String(raw.id || raw.articulo_id || row.articulo_id || '');
    const article = preferLatestArticle(raw, overrides.get(id));
    const status = rescates && (saleCancellation(row) || donationRejection(row)) ? 'cancelado'
      : isPublicationUnavailable(article, now) ? 'vencido' : statusOf(article);
    const sale = isSaleArticle(article);
    const hasUnread = unread.get(id) === true || Number(notifications[id]?.unreadChats || 0) > 0;
    const hasChat = chats.get(id) === true || !!row._chatId || !!article.transaction_chat?.id;
    const winner = article.ganador_id || article.winner_id || article.recipient_id;
    const hasRequests = !sale && (rescates
      ? ['postulaciones', 'chats'].includes(row._source)
      : posts.get(id) === true || Number(notifications[id]?.newSolicitudes || 0) > 0);
    const pending = hasRequests && status === 'disponible' && !winner && row._chatStatus !== 'closed';
    const isFeatured = featured[id] ?? article.isFeatured ?? article.is_featured ?? false;
    const canRate = status !== 'cancelado' && canRateProfileArticle(article, { rescates, userId });
    const ratingOrder = canRate ? (rated.has(id) ? 2 : 0) : 1;
    return { row: rescates ? { ...row, articulo: article } : article, article, status, sale,
      hasUnread, hasChat, hasRequests, pending, isFeatured, ratingOrder, index };
  }).filter(item => {
    if (term && !normalize(item.article.title || item.article.titulo).includes(term)) return false;
    if (filters.status !== 'todos' && (filters.status === 'pendiente' ? !item.pending : item.status !== filters.status)) return false;
    if (filters.type !== 'todos' && item.sale !== (filters.type === 'venta')) return false;
    if (filters.featured && !item.isFeatured) return false;
    if (filters.activity === 'unread' && !item.hasUnread) return false;
    if (filters.activity === 'chat' && !item.hasChat) return false;
    if (filters.activity === 'requests' && !item.hasRequests) return false;
    if (filters.activity === 'pending' && !item.pending) return false;
    return true;
  }).sort((a, b) => {
    if (a.ratingOrder !== b.ratingOrder) return a.ratingOrder - b.ratingOrder;
    if (filters.sort === 'priority') {
      const priority = item => item.status === 'cancelado' ? 5 : item.hasUnread ? 0 : item.status === 'reservado' ? 1 : item.pending ? 2 : item.status === 'entregado' ? 4 : 3;
      const difference = priority(a) - priority(b);
      if (difference) return difference;
    }
    const date = item => Date.parse(item.article.created_at || item.row.created_at || '') || 0;
    const difference = date(a) - date(b);
    return (filters.sort === 'oldest' ? difference : -difference) || a.index - b.index;
  }).map(item => item.row);
}
