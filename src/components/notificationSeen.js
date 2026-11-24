import { mergeNotificationHistory, notificationGroupKey, NOTIFICATION_STATE_LIMIT } from './notificationHistory.js';

export const NOTIFICATION_SEEN_LIMIT = 1000;
const PREFIX = 'mb_notification_seen_';
const validUid = uid => typeof uid === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(uid);
const validKey = key => typeof key === 'string' && key.length <= 240
  && /^(?:receipt\|(?:system|staff|support)\|)?[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(key);

function readSeen(storage, uid) {
  try {
    const raw = storage?.getItem(PREFIX + uid);
    if (typeof raw !== 'string' || raw.length > 524288) return new Map();
    const records = JSON.parse(raw);
    if (!Array.isArray(records) || records.length > NOTIFICATION_SEEN_LIMIT) return new Map();
    return new Map(records.filter(row => Array.isArray(row) && row.length === 2 && validKey(row[0])
      && Number.isSafeInteger(row[1]) && row[1] >= 0 && row[1] <= 253402300799999));
  } catch { return new Map(); }
}

function writeSeen(storage, uid, seen) {
  const records = [...seen].sort((a,b) => b[1] - a[1]).slice(0, NOTIFICATION_SEEN_LIMIT);
  try { storage?.setItem(PREFIX + uid, JSON.stringify(records)); } catch { /* Storage may be unavailable. */ }
}

// Keep only event identifiers and acknowledgement dates, independently of the ten visible rows.
// Bell acknowledgements never clear the server's pending-work counters.
export function rememberNotificationSeen(storage, uid, values) {
  const items = mergeNotificationHistory([], values, NOTIFICATION_STATE_LIMIT);
  if (!validUid(uid)) return items;
  const seen = readSeen(storage, uid);
  for (const item of items) {
    if (!item.read && !item.bellRead) continue;
    const key = notificationGroupKey(item), time = Date.parse(item.created_at);
    seen.set(key, Math.max(seen.get(key) ?? 0, time));
  }
  const restored = items.map(item => {
    const acknowledged = seen.get(notificationGroupKey(item));
    const immutableReceipt = item.type === 'system_notice' && item.receipt_id != null && item.receipt_kind !== 'support';
    return acknowledged != null && (immutableReceipt || Date.parse(item.created_at) <= acknowledged)
      ? { ...item, bellRead: true } : item;
  });
  writeSeen(storage, uid, seen);
  return restored;
}

export function forgetNotificationSeen(storage, uid, receiptId, kind = 'system') {
  if (!validUid(uid)) return;
  const seen = readSeen(storage, uid);
  seen.delete(notificationGroupKey({type: 'system_notice', receipt_id: receiptId, receipt_kind: kind}));
  writeSeen(storage, uid, seen);
}
