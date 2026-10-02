import { isSaleArticle } from '../supabase/articleContext.js';

export const ARTICLE_HISTORY_MS = 7 * 24 * 60 * 60 * 1000;

export function articleHistoryExpiresAt(article) {
  if (!['entregado', 'delivered'].includes(article?.estado || article?.status)) return null;
  const deliveredAt = Date.parse(article?.delivered_at || article?.updated_at || '');
  return Number.isFinite(deliveredAt) ? deliveredAt + ARTICLE_HISTORY_MS : null;
}

export function isSaleApproved(article) {
  return isSaleArticle(article) && !!(article?.transaction_chat?.approved_at || article?.transaction_chat?.status === 'open');
}

export function saleDeletionBlocked(article, now = Date.now()) {
  if (!isSaleArticle(article)) return false;
  const status = article?.estado || article?.status;
  if (['reservado', 'reserved'].includes(status) && article?.buyer_id) return true;
  if (['entregado', 'delivered'].includes(status)) {
    const expiresAt = articleHistoryExpiresAt(article);
    return expiresAt === null || now < expiresAt;
  }
  return false;
}

export function preferLatestArticle(first, second) {
  if (!first) return second;
  if (!second) return first;
  const firstTime = Date.parse(first.updated_at || first.created_at || "") || 0;
  const secondTime = Date.parse(second.updated_at || second.created_at || "") || 0;
  return firstTime > secondTime ? { ...second, ...first } : { ...first, ...second };
}
