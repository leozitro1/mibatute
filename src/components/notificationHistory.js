import { CONVERSATION_NOTIFICATION_TYPES } from './activityNotifications.js';

export const NOTIFICATION_HISTORY_LIMIT = 10;

const STORAGE_PREFIX = 'mb_notification_history_';
const MAX_STORAGE_LENGTH = 65_536;
const MAX_TIMESTAMP = 253_402_300_799_999;
const RESERVED_IDS = new Set(['__proto__', 'prototype', 'constructor']);
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function validId(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0;
  return typeof value === 'string' && value.length <= 200
    && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value) && !RESERVED_IDS.has(value);
}

function timestamp(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 && value <= MAX_TIMESTAMP
      ? value : null;
  }
  if (typeof value !== 'string' || value.length > 40) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, zone] = match;
  const days = new Date(`${year}-${month}-01T00:00:00Z`);
  days.setUTCMonth(days.getUTCMonth() + 1);
  days.setUTCDate(0);
  if (+month < 1 || +month > 12 || +day < 1 || +day > days.getUTCDate()
    || +hour > 23 || +minute > 59 || +second > 59
    || (zone !== 'Z' && (+zone.slice(1, 3) > 23 || +zone.slice(4) > 59))) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && time >= 0 && time <= MAX_TIMESTAMP ? time : null;
}

function sanitize(value) {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return null;
    if (!hasOwn(value, 'id') || !validId(value.id)
      || !hasOwn(value, 'type') || typeof value.type !== 'string'
      || !/^[a-z][a-z0-9_-]{0,39}$/.test(value.type) || RESERVED_IDS.has(value.type)
      || !hasOwn(value, 'created_at')) return null;
    const time = timestamp(value.created_at);
    if (time === null) return null;
    const item = { id: value.id, type: value.type, created_at: new Date(time).toISOString() };
    for (const key of ['articulo_id', 'chat_id', 'buyer_id', 'receipt_id']) {
      if (!hasOwn(value, key)) continue;
      if (value[key] === null) item[key] = null;
      else if (validId(value[key])) item[key] = value[key];
      else return null;
    }
    for (const [key, limit] of [['title', 512], ['subtitle', 1_024], ['thumb', 2_048]]) {
      if (!hasOwn(value, key)) continue;
      if (typeof value[key] !== 'string' || value[key].length > limit) return null;
      item[key] = value[key];
    }
    if (hasOwn(value, 'read') && typeof value.read !== 'boolean') return null;
    if (hasOwn(value, 'unreadCount') && (!Number.isSafeInteger(value.unreadCount)
      || value.unreadCount < 0 || value.unreadCount > 1_000_000)) return null;
    item.read = hasOwn(value, 'read') && value.read === true;
    item.unreadCount = item.read ? 0 : (hasOwn(value, 'unreadCount') ? value.unreadCount : 1);
    return item;
  } catch {
    return null;
  }
}

function sorted(items) {
  return [...items].sort((a, b) => {
    const dateOrder = Date.parse(b.created_at) - Date.parse(a.created_at);
    const aId = String(a.id);
    const bId = String(b.id);
    return dateOrder || (aId < bId ? -1 : aId > bId ? 1 : 0);
  }).slice(0, NOTIFICATION_HISTORY_LIMIT);
}

export function mergeNotificationHistory(previous, incoming) {
  const groups = new Map();
  for (const source of [previous, incoming]) {
    if (!Array.isArray(source)) continue;
    for (const value of source) {
      const item = sanitize(value);
      if (!item) continue;
      const key = String(item.id);
      const existing = groups.get(key);
      if (existing && Date.parse(existing.created_at) > Date.parse(item.created_at)) continue;
      // A read acknowledgement belongs to this event, not to future events in the group.
      if (existing && existing.created_at === item.created_at && existing.read) {
        item.read = true;
        item.unreadCount = 0;
      }
      groups.set(key, item);
    }
  }
  return sorted(groups.values());
}

export function readNotificationHistory(storage, uid) {
  try {
    if (!validId(uid)) return [];
    const raw = storage?.getItem(`${STORAGE_PREFIX}${uid}`);
    if (typeof raw !== 'string' || raw.length > MAX_STORAGE_LENGTH) return [];
    return mergeNotificationHistory([], JSON.parse(raw));
  } catch {
    return [];
  }
}

export function writeNotificationHistory(storage, uid, items) {
  try {
    if (!validId(uid) || typeof storage?.setItem !== 'function') return false;
    storage.setItem(`${STORAGE_PREFIX}${uid}`, JSON.stringify(mergeNotificationHistory([], items)));
    return true;
  } catch {
    return false;
  }
}

export function markNotificationHistoryRead(items, { id, chatId, articleId, through = Date.now() } = {}) {
  const cutoff = timestamp(through);
  return mergeNotificationHistory([], items).map((item) => {
    const matches = (validId(id) && item.id === id)
      || (validId(chatId) && CONVERSATION_NOTIFICATION_TYPES.has(item.type) && item.chat_id != null
        && String(item.chat_id) === String(chatId))
      || (validId(articleId) && item.type === 'postulacion' && item.articulo_id != null
        && String(item.articulo_id) === String(articleId));
    return matches && cutoff !== null && Date.parse(item.created_at) <= cutoff
      ? { ...item, read: true, unreadCount: 0 } : item;
  });
}
