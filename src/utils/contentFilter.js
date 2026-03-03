// src/utils/contentFilter.js
// Filtro anti-contacto / anti-spam (teléfonos, WhatsApp, emails, links) + malas palabras.
// Úsalo en UI (para advertir) y en servicios/servidor (para hacer cumplir la regla).

function _norm(s = "") {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // quita tildes
}

// Teléfonos (flexible: +57, espacios, guiones, paréntesis)
const PHONE_REGEX = /(\+?\d{1,3}[\s\-\.]?)?(\(?\d{2,3}\)?[\s\-\.]?)?\d{3}[\s\-\.]?\d{2}[\s\-\.]?\d{2,4}/g;

// Email
const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

// Links básicos
const URL_REGEX = /\b(?:https?:\/\/|www\.)\S+/gi;

// Palabras típicas de “contacto externo”
const CONTACT_WORDS = [
  "whatsapp",
  "wpp",
  "wa",
  "wasap",
  "wasa",
  "whatssap",
  "llamame",
  "llámame",
  "escribeme",
  "escríbeme",
  "telegram",
  "t.me",
  "instagram",
  "ig",
  "facebook",
  "fb",
  "correo",
  "email",
  "gmail",
  "hotm",
  "outlook",
];

// Lista mínima (ajústala a tu gusto). Ideal: mover a tabla/config en BD.
const DEFAULT_BAD_WORDS = [
  "hp",
  "hpta",
  "hijueputa",
  "marica",
  "maricon",
  "maricón",
  "gonorrea",
  "pirobo",
  "perra",
  "puta",
  "mierda",
  "verga",
];

export function detectarContenidoNoPermitido(texto = "", opts = {}) {
  const raw = String(texto || "");
  const norm = _norm(raw);

  const phones = (raw.match(PHONE_REGEX) || [])
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    // evita falsos positivos muy cortos
    .filter((m) => (m.replace(/\D/g, "").length >= 7));

  const emails = (raw.match(EMAIL_REGEX) || []).map((x) => String(x || "").trim()).filter(Boolean);
  const urls = (raw.match(URL_REGEX) || []).map((x) => String(x || "").trim()).filter(Boolean);

  const extraBadWords = Array.isArray(opts?.badWords) ? opts.badWords : [];
  const badWords = Array.from(new Set([...(opts?.useDefaultBadWords === false ? [] : DEFAULT_BAD_WORDS), ...extraBadWords])).filter(Boolean);

  const contactHits = CONTACT_WORDS.filter((w) => norm.includes(_norm(w)));
  const badHits = badWords.filter((w) => norm.includes(_norm(w)));

  const hasContact = phones.length > 0 || emails.length > 0 || urls.length > 0 || contactHits.length > 0;
  const hasAbuse = badHits.length > 0;

  return {
    hasViolation: hasContact || hasAbuse,
    hasContact,
    hasAbuse,
    phones,
    emails,
    urls,
    contactHits,
    badHits,
  };
}

export function enmascararContenido(texto = "") {
  let out = String(texto || "");

  out = out.replace(EMAIL_REGEX, (m) => {
    const parts = String(m || "").split("@");
    const u = parts[0] || "";
    const maskedU = u.length <= 1 ? "*" : u[0] + "***";
    return `${maskedU}@***.***`;
  });

  out = out.replace(URL_REGEX, "***");

  out = out.replace(PHONE_REGEX, (m) => {
    const digits = String(m || "").replace(/\D/g, "");
    if (digits.length < 7) return m;
    return String(m || "").replace(/\d/g, "*");
  });

  return out;
}

export function buildViolationMessage(v) {
  if (!v?.hasViolation) return null;

  if (v.hasContact) {
    return "🚫 Por seguridad, no se permite compartir teléfonos, WhatsApp, correos o links. Usa el chat dentro de Mi Batute.";
  }

  if (v.hasAbuse) {
    return "🚫 Tu mensaje contiene lenguaje ofensivo. Por favor respeta a los demás usuarios.";
  }

  return "🚫 Contenido no permitido.";
}
