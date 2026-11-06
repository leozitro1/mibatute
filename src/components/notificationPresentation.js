import { NOTIFICATION_STATE_LIMIT } from './notificationHistory.js';

// Bell acknowledgement is separate from reading the underlying conversation.
export const isBellUnread = item => !item.read && !item.bellRead && item.unreadCount > 0;
export const BELL_LIST_LIMIT = 30;

export function bellListItems(items, unreadOnly = false) {
  return (unreadOnly ? items.filter(isBellUnread) : items).slice(0, BELL_LIST_LIMIT);
}

export function sortBellNotifications(items) {
  return [...(Array.isArray(items) ? items : [])]
    .sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0)
      || String(a.id).localeCompare(String(b.id)))
    .slice(0, NOTIFICATION_STATE_LIMIT);
}

export function groupBellNotifications(items, now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const today = [], earlier = [];
  for (const item of items) {
    const time = Date.parse(item.created_at);
    (time >= start.getTime() ? today : earlier).push(item);
  }
  return [{ label: 'Hoy', items: today }, { label: 'Anteriores', items: earlier }]
    .filter(group => group.items.length);
}

export function bellNotificationCategory(item) {
  if (item.type === 'chat') return 'message';
  if (['postulacion', 'venta'].includes(item.type)) return 'request';
  if (['ganador', 'sale_approved', 'donation_accepted'].includes(item.type)) return 'accepted';
  if (item.type?.startsWith('pickup_') || item.type === 'delivery_completed') return 'delivery';
  if (item.type === 'system_notice') return 'system';
  return 'publication';
}
