import { ACTIVE_COLOMBIA_DATA } from './locations.js';

export function locationSnapshot(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.some(row =>
    typeof row.city !== 'string' || !row.city.trim() || !Array.isArray(row.localities) ||
    (row.active !== false && !row.localities.length) || row.localities.some(value => typeof value !== 'string' || !value.trim()) ||
    (row.all_localities !== undefined && (!Array.isArray(row.all_localities) || row.all_localities.some(value => typeof value !== 'string' || !value.trim()))))) {
    throw new Error('El catálogo de ubicaciones no es válido.');
  }
  const active = rows.filter(row => row.active !== false);
  if (!active.length) throw new Error('Debe quedar al menos una ciudad activa.');
  return { COLOMBIA_DATA: rows.map(row => row.all_localities ? { ...row, localities: row.all_localities } : row), ACTIVE_COLOMBIA_DATA: active,
    LOCATIONS: Object.fromEntries(active.map(row => [row.city, row.localities])) };
}

// Share and coalesce reads across the whole app. No polling or Realtime channel.
export function createLocationCatalog(client, now = Date.now) {
  let snapshot = locationSnapshot(ACTIVE_COLOMBIA_DATA), expires = 0, pending;
  const listeners = new Set();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    refresh(force = false) {
      if (pending) return force ? pending.catch(() => {}).then(() => this.refresh(true)) : pending;
      if (!force && now() < expires) return Promise.resolve(snapshot);
      pending = (async () => {
        try {
          const { data, error } = await client.rpc('market_location_catalog');
          if (error) throw error;
          snapshot = locationSnapshot(data);
          expires = now() + 5 * 60_000;
          listeners.forEach(listener => listener());
          return snapshot;
        } catch (error) {
          // Retain the last working catalog and avoid a retry storm on a network failure.
          expires = now() + 60_000;
          throw error;
        } finally { pending = undefined; }
      })();
      return pending;
    },
  };
}
