export const ATTENTION_SECTIONS = [
  { id: 'articles', label: 'Publicaciones por revisar' },
  { id: 'reports', label: 'Reportes sin resolver' },
  { id: 'privacy', label: 'Solicitudes de datos pendientes' },
  { id: 'inbox', label: 'Conversaciones sin leer' },
];
export function attentionCounts(value, allowedIds) {
  const allowed = new Set(allowedIds);
  const counts = Object.fromEntries(ATTENTION_SECTIONS.map(({ id }) => [id, allowed.has(id) && Number.isFinite(value?.[id]) ? Math.max(0, Math.trunc(value[id])) : 0]));
  counts.pending = ATTENTION_SECTIONS.reduce((sum, { id }) => sum + counts[id], 0);
  counts.team = allowed.has('team') && Number.isFinite(value?.team) ? Math.max(0, Math.trunc(value.team)) : 0;
  return counts;
}
export function attentionBadge(count) { return count > 99 ? '99+' : String(count); }
export function attentionRow(section, row) {
  return section === 'reports' ? ['open', 'reviewing'].includes(row.status)
    : section === 'articles' ? ['pending', 'en_revision', 'reviewing'].includes(row.review_status)
    : section === 'privacy' ? ['open', 'reviewing'].includes(row.status)
    : section === 'inbox' ? !!row.unread : false;
}
