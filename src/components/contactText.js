import { CONTACT_EMAIL } from '../config/availability.js';

// Legacy platform aliases are recognized without shipping old personal addresses as literals.
const legacy = new Set(['52b143c3', 'd258c215', '4f2d8258']);
function fingerprint(text) {
  let hash = 2166136261;
  for (const character of text.toLowerCase()) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16);
}
const marker = 'el canal de contacto de MiBatute';
export function contactTextParts(text) {
  return String(text || '').split(/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|el canal de contacto de MiBatute)/gi).filter(Boolean).map(value => ({
    text: value, contact: value.toLowerCase() === marker.toLowerCase() || value.toLowerCase() === CONTACT_EMAIL || legacy.has(fingerprint(value)),
  }));
}
export function publicContactText(text) {
  return contactTextParts(text).map(part => part.contact ? 'Contacto de MiBatute' : part.text).join('');
}
