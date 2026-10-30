const TYPES = {chat:'message',postulacion:'request',venta:'request',ganador:'accepted',sale_approved:'accepted',donation_accepted:'accepted'};
export const LOCAL_NOTICE_TEXT = Object.freeze({message:'Tienes un mensaje nuevo.',request:'Recibiste una nueva solicitud.',accepted:'Aceptaron tu solicitud.'});

function previewText(value,limit) {
  if (typeof value !== 'string') return '';
  const text = value.replace(/\s+/g,' ').trim();
  return text.length > limit ? `${text.slice(0,limit-1)}…` : text;
}

export function localNoticeMetadata(item) {
  const kind = TYPES[item?.type];
  if (!kind || item.read || item.bellRead || !(item.unreadCount > 0)) return null;
  const time = Date.parse(item.created_at);
  if (!Number.isFinite(time) || typeof item.id !== 'string') return null;
  const target = kind === 'message' ? item.chat_id || item.articulo_id || item.id : item.articulo_id || item.id;
  return {kind,time,group:`${kind}:${target}`,chatId:item.chat_id || null};
}

// Count pending groups, not people or an exact count of unseen message bodies.
export function localNoticeCount(items) {
  return new Set((items || []).slice(0,300).flatMap(item => {
    const notice = localNoticeMetadata(item);
    return notice ? [notice.group] : [];
  })).size;
}

export function createForegroundNoticeGate(now = Date.now,owner = null) {
  const seen = new Set(), recent = new Map();
  return (item,{visible,activeChatId,uid,messagePreview} = {}) => {
    if (owner && uid !== owner) return null;
    const notice = localNoticeMetadata(item);
    if (!notice) return null;
    const key = `${notice.group}:${notice.time}`;
    if (seen.has(key)) return null;
    seen.add(key);
    if (seen.size > 300) seen.delete(seen.values().next().value);
    const time = now();
    if (!visible || notice.time < time-30000 || notice.time > time+5000 || (notice.chatId && notice.chatId === activeChatId)) return null;
    if (recent.has(notice.group) && time-recent.get(notice.group) < 8000) return null;
    recent.set(notice.group,time);
    if (recent.size > 100) recent.delete(recent.keys().next().value);
    const body = notice.kind === 'message' ? previewText(messagePreview,220) : '';
    const context = previewText(item.subtitle,100);
    return {kind:notice.kind,group:notice.group,chatId:notice.chatId,at:time,
      ...(body ? {body} : {}),...(context ? {context} : {})};
  };
}

export function iconBadgeSupport(browser = globalThis.window) {
  const nav = browser?.navigator;
  const supported = !!browser?.isSecureContext && typeof nav?.setAppBadge === 'function';
  const ios = /iPhone|iPad|iPod/i.test(nav?.userAgent || '') || (nav?.platform === 'MacIntel' && nav?.maxTouchPoints > 1);
  return {supported,needsPermission:ios};
}

export async function requestIconBadgePermission(browser = globalThis.window) {
  const support = iconBadgeSupport(browser);
  if (!support.supported) return false;
  if (!support.needsPermission) return true;
  if (!browser.Notification) return false;
  if (browser.Notification.permission === 'denied') return false;
  return browser.Notification.permission === 'granted' || await browser.Notification.requestPermission() === 'granted';
}

// Serialize native calls, coalesce updates and ensure sign-out clears last.
// No network, subscription, worker or repeating timer is involved.
export function createIconBadgeWriter(navigator) {
  let desired = 0, revision = 0, completed = 0, running = null;
  return count => {
    desired = Number.isSafeInteger(count) && count > 0 ? Math.min(count,300) : 0;
    revision++;
    if (!running) running = (async () => {
      while (completed < revision) {
        const next = revision, value = desired;
        try {
          if (value > 0) await navigator?.setAppBadge?.(value);
          else if (typeof navigator?.clearAppBadge === 'function') await navigator.clearAppBadge();
          else await navigator?.setAppBadge?.(0);
        } catch { /* Native availability must never block the inbox or sign-out. */ }
        completed = next;
      }
      running=null;
    })();
    return running;
  };
}
