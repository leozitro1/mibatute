export function createListingCache({ ttl = 60_000, limit = 8, now = Date.now } = {}) {
  const entries = new Map();
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry || now() - entry.at >= ttl) {
        entries.delete(key);
        return null;
      }
      entries.delete(key);
      entries.set(key, entry);
      return entry.value;
    },
    set(key, value) {
      entries.delete(key);
      entries.set(key, { at: now(), value });
      while (entries.size > limit) entries.delete(entries.keys().next().value);
    },
    clear() { entries.clear(); },
  };
}
