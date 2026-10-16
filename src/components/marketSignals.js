// Components share the user's existing socket. This bus never opens a connection.
const listeners = new Set();
export function listenMarketSignals(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function dispatchMarketSignal(signal) {
  for (const listener of listeners) listener(signal);
}

export function createSignalDeduplicator(limit = 1000) {
  const seen = new Set();
  return signal => {
    if (!signal || typeof signal.key !== 'string' || signal.key.length > 300 || seen.has(signal.key)) return false;
    seen.add(signal.key);
    if (seen.size > limit) seen.delete(seen.values().next().value);
    return true;
  };
}

export function notificationCounts(items) {
  const byArticle = {};
  let chats = 0, profile = 0;
  for (const item of items) {
    if (item.read || !['chat', 'postulacion', 'venta'].includes(item.type)) continue;
    const count = item.unreadCount || 0;
    const field = item.type === 'chat' ? 'unreadChats' : item.type === 'postulacion' ? 'newSolicitudes' : 'pendingVentas';
    if (item.type === 'chat') chats += count;
    profile += count;
    if (!item.articulo_id) continue;
    const row = byArticle[item.articulo_id] ||= { unreadChats: 0, newSolicitudes: 0, pendingVentas: 0, total: 0 };
    row[field] += count;
    row.total += count;
  }
  return { chats, profile, byArticle };
}

// Repeated deliveries have already been discarded by the subscription. A live
// aggregate starts a fresh unread count after its previous contents were read.
export function noticeFromSignal(signal, previous, seenAt) {
  const item = signal.notice;
  if (!item || !['chat', 'postulacion'].includes(item.type)) return item;
  const read = Date.parse(seenAt || '') >= Date.parse(item.created_at);
  const count = read ? 0 : (previous?.read ? 0 : previous?.unreadCount || 0) + 1;
  return { ...item, created_at: previous && Date.parse(previous.created_at) > Date.parse(item.created_at)
    ? previous.created_at : item.created_at, read, unreadCount: count };
}

export function catalogTopic(city, category = 'Todo') {
  const hex = text => Array.from(new TextEncoder().encode(text), byte => byte.toString(16).padStart(2, '0')).join('');
  return `mb:catalog:${hex(city || 'Bogotá')}:${category === 'Todo' ? 'all' : hex(category.trim().toLowerCase())}`;
}

export function mergeChatMessages(previous, incoming, optimisticId) {
  const rows = new Map(previous.filter(row => row.id !== optimisticId).map(row => [String(row.id), row]));
  for (const row of incoming) {
    if (!row?.id) continue;
    rows.set(String(row.id), row);
  }
  return [...rows.values()].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)
    || String(a.id).localeCompare(String(b.id)));
}

// Used for initial load, fallback and reconnect: simultaneous callers share work.
export function singleFlight(task) {
  let pending;
  return (...args) => {
    if (!pending) pending = Promise.resolve().then(() => task(...args)).finally(() => { pending = null; });
    return pending;
  };
}

export function createReadCache({ ttl = 60_000, limit = 32, now = Date.now } = {}) {
  const entries = new Map();
  return {
    get(key, read) {
      const cached = entries.get(key);
      if (cached && (cached.pending || now() - cached.at < ttl)) return cached.promise;
      const entry = { pending: true, at: 0 };
      entry.promise = Promise.resolve().then(read).then(result => {
        if (result?.error) { if (entries.get(key) === entry) entries.delete(key); }
        else { entry.pending = false; entry.at = now(); }
        return result;
      }, error => { if (entries.get(key) === entry) entries.delete(key); throw error; });
      entries.set(key, entry);
      while (entries.size > limit) entries.delete(entries.keys().next().value);
      return entry.promise;
    },
    invalidate(key) { entries.delete(key); },
    clear() { entries.clear(); },
  };
}

export const CHAT_MESSAGE_FIELDS = 'id,chat_id,sender_id,body,message,content,text,mensaje,created_at';

export async function readChatMessages(client, chatId, after = null, onPage = () => {}) {
  const result = [];
  let cursor = after;
  do {
    let query = client.from('chat_messages').select(CHAT_MESSAGE_FIELDS).eq('chat_id', chatId);
    if (cursor) query = query.or(`created_at.gt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.gt.${cursor.id})`);
    const { data, error } = await query.order('created_at', { ascending: !!after })
      .order('id', { ascending: !!after }).limit(after ? 100 : 50);
    if (error) throw error;
    const rows = data || [];
    result.push(...rows);
    onPage(rows);
    if (!after || rows.length < 100) break;
    cursor = rows.at(-1);
  } while (cursor !== null);
  return result;
}
