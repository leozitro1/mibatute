const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const keywords = normalize('Taller Vuelta restauracion reparacion muebles madera silla sillas mesa mesas hogar Bogota');

export function localSponsoredPreviewMatches({ enabled = false, search = '', category = 'Todo', city = 'Bogotá' } = {}) {
  if (!enabled || normalize(city) !== 'bogota') return false;
  if (!['todo', 'hogar & muebles'].includes(normalize(category))) return false;
  return normalize(search).split(/\s+/).filter(Boolean).every(word => keywords.includes(word));
}

export function showLocalSponsoredPreview({ count = 0, ...filters } = {}) {
  return count >= 4 && localSponsoredPreviewMatches(filters);
}

// Return the article index after which the ad is inserted, stable for this page.
export function localSponsoredInsertionIndex({ count, layout = 'desktop', seed = '' }) {
  if (count < 4) return null;
  const lastPosition = layout === 'desktop' ? Math.min(10, count) : count;
  let hash = 2166136261;
  for (const char of String(seed)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return 1 + ((hash >>> 0) % (lastPosition - 2));
}
