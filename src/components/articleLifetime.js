export const PUBLICATION_DAYS = 60;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const PUBLICATION_LIFETIME_MS = PUBLICATION_DAYS * DAY_MS;

export function publicationExpiresAt(article) {
  const created = Date.parse(article?.created_at || '');
  return Number.isFinite(created) ? created + PUBLICATION_LIFETIME_MS : null;
}

export function publicationDaysRemaining(article, now = Date.now()) {
  const expires = publicationExpiresAt(article);
  return expires === null ? null : Math.max(0, Math.min(PUBLICATION_DAYS, Math.ceil((expires - now) / DAY_MS)));
}

export function isPublicationExpired(article, now = Date.now()) {
  const expires = publicationExpiresAt(article);
  return expires !== null && now >= expires;
}

export function isPublicationUnavailable(article, now = Date.now()) {
  const status = article?.estado || article?.status;
  return !['reservado', 'reserved', 'entregado', 'delivered'].includes(status)
    && isPublicationExpired(article, now);
}
