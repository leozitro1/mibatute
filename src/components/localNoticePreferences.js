const PREFIX = 'mb_local_notices_';
const EVENT = 'mb:local-notice-preferences';
const memory = new Map();

export function noticePreferenceKey(uid) {
  return typeof uid === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(uid) ? PREFIX+uid : null;
}

export function readNoticePreferences(storage,uid) {
  const key = noticePreferenceKey(uid);
  if (!key) return {badge:false,banners:true};
  if (memory.has(key)) return memory.get(key);
  try {
    const raw = storage?.getItem(key);
    if (raw && raw.length <= 256) {
      const value = JSON.parse(raw);
      return {badge:value?.badge === true,banners:value?.banners !== false};
    }
  } catch { /* Keep local controls usable when storage is unavailable. */ }
  return memory.get(key) || {badge:false,banners:true};
}

export function writeNoticePreferences(storage,uid,value,browser = globalThis.window) {
  const key = noticePreferenceKey(uid);
  if (!key) return;
  const next = {badge:value.badge === true,banners:value.banners !== false};
  memory.set(key,next);
  if (memory.size > 32) memory.delete(memory.keys().next().value);
  try {storage?.setItem(key,JSON.stringify(next));} catch { /* Retain the preference for this session. */ }
  browser?.dispatchEvent(new Event(EVENT));
}

export function subscribeNoticePreferences(listener) {
  const storage = event => {
    if (!event.key) {memory.clear();listener();}
    else if (event.key.startsWith(PREFIX)) {memory.delete(event.key);listener();}
  };
  window.addEventListener(EVENT,listener);window.addEventListener('storage',storage);
  return () => {window.removeEventListener(EVENT,listener);window.removeEventListener('storage',storage);};
}
