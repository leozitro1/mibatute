// ✅ Detecta datos de contacto prohibidos en la descripción
const PALABRAS_CLAVE_CONTACTO = [
  // WhatsApp y variantes
  "whatsapp", "whats app", "wsp", "wasap", "whatsap", "wassap", "wasp",
  // Llamadas
  "llamame", "llamame", "llama al", "llamar al", "llame al", "comunicate",
  "comuniquese", "comunicarse", "contactame", "contactame", "contactarse",
  // Redes sociales
  "facebook", "instagram", "telegram", "tiktok", "twitter", "snapchat",
  "youtube", "linkedin", "discord", " fb ", "fb.", "fb:", "/fb", "@fb",
  // Email
  "correo", "email", "e-mail", "gmail", "hotmail", "yahoo", "outlook",
  "correo electronico", "mi correo", "mi email",
  // Celular / número
  "mi numero", "mi cel", "mi celular", "al cel", "al celular",
  "mi telefono", "al telefono", "numero de cel", "numero de telefono",
  "cel:", "tel:", "celular:", "telefono:", "contacto:",
  // Escribir / mensajear
  "escribeme", "escribe al", "manda mensaje", "mandame mensaje",
  "enviame mensaje", "mensaje al", "mensaje por",
  // URLs y links
  "http://", "https://", "www.", ".com", ".net", ".co/", "bit.ly",
  "tinyurl", "goo.gl", "t.me/", "wa.me/", "wa.link",
];

const NUMERO_PALABRAS = [
  "cero","uno","dos","tres","cuatro","cinco",
  "seis","siete","ocho","nueve","diez",
];

export function detectContactoProhibido(texto = "") {
  const t = (texto || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // 1) Email con @
  if (/@[a-z0-9]/i.test(t)) {
    return "No puedes incluir correos electrónicos en la descripción.";
  }

  // 2) Palabras clave de contacto
  for (const kw of PALABRAS_CLAVE_CONTACTO) {
    if (t.includes(kw)) {
      return `No puedes incluir formas de contacto externo (detectado: "${kw}"). Usa el chat de la plataforma.`;
    }
  }

  // 3) Número de teléfono: 7+ dígitos seguidos (con separadores opcionales)
  // Excluye años (4 dígitos solos) y precios cortos
  if (/(?<![\d])\d[\d\s.\-]{5,}\d(?![\d])/.test(t)) {
    return "No puedes incluir números de teléfono en la descripción.";
  }

  // 4) Número escrito en letras: 4+ palabras numéricas consecutivas
  const regexPalabrasNum = new RegExp(
    "(" + NUMERO_PALABRAS.join("|") + ")(\\s+(" + NUMERO_PALABRAS.join("|") + ")){3,}",
    "i"
  );
  if (regexPalabrasNum.test(t)) {
    return "No puedes escribir números de teléfono con letras en la descripción.";
  }

  return null;
}
