function rank(id, seed) {
  let hash = (2166136261 ^ seed) >>> 0;
  for (const char of String(id)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return (hash ^ (hash >>> 16)) >>> 0;
}

// Rank by identity so refreshed data and normal-list sorting cannot reorder cards.
export function orderFeaturedItems(items, seed) {
  return (Array.isArray(items) ? items : []).filter(Boolean).slice().sort((a, b) =>
    rank(a.id, seed) - rank(b.id, seed) || String(a.id).localeCompare(String(b.id)));
}
