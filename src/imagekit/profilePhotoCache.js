// Private signed URLs stay in memory, separated by client, account and session token.
export function createProfilePhotoResolver({ now = Date.now, ttl = 240_000, limit = 64 } = {}) {
  const clients = new WeakMap();
  return async (source, client, resolve) => {
    if (!source) return '';
    const { data } = await client.auth.getSession();
    const session = data?.session;
    if (!session?.access_token || !session.user?.id || session.user.is_anonymous) return '';
    const started = now();
    const expiresAt = Math.min(started + ttl, session.expires_at ? session.expires_at * 1000 : Infinity);
    if (expiresAt <= started) return '';
    let cache = clients.get(client);
    if (!cache) { cache = new Map(); clients.set(client, cache); }
    for (const [key, entry] of cache) if (entry.expiresAt <= started) cache.delete(key);
    const key = JSON.stringify([session.user.id, session.access_token, source]);
    const previous = cache.get(key);
    if (previous) return previous.promise;
    const entry = { expiresAt, promise: null };
    entry.promise = Promise.resolve().then(() => resolve(source, client, session.access_token)).then(url => {
      if (!url && cache.get(key) === entry) cache.delete(key);
      return url;
    }, error => {
      if (cache.get(key) === entry) cache.delete(key);
      throw error;
    });
    cache.set(key, entry);
    while (cache.size > limit) cache.delete(cache.keys().next().value);
    return entry.promise;
  };
}
