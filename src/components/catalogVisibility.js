export function isCatalogReservationHidden(article, now = Date.now()) {
  const deadline = Date.parse(article?.catalog_hide_at || '');
  return Number.isFinite(deadline) && now >= deadline;
}
