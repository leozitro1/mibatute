// src/supabase/solicitudesService.js
import { supabase } from "./supabaseClient";

// ===================== Anti-spam / Anti-contacto (postulaciones + chat) =====================
// Nota: esto es una capa "cliente". Para blindarlo al 100%, lo ideal es mover la creación de
// postulaciones/mensajes a una Edge Function y aplicar el mismo filtro ahí.

function _norm(s = "") {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // quita tildes
}

// Teléfonos (flexible: +57, espacios, guiones, paréntesis)
const _PHONE_REGEX = /(\+?\d{1,3}[\s\-\.]?)?(\(?\d{2,3}\)?[\s\-\.]?)?\d{3}[\s\-\.]?\d{2}[\s\-\.]?\d{2,4}/g;

// Email
const _EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

// Links básicos
const _URL_REGEX = /\b(?:https?:\/\/|www\.)\S+/gi;

// Palabras típicas de “contacto externo”
const _CONTACT_WORDS = [
  "whatsapp",
  "wpp",
  "wa",
  "wasap",
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
  "@",
];

// Lista mínima (ajústala a tu gusto). Ideal: mover a tabla/config en BD.
const _BAD_WORDS = [
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
  "hijo de puta",
  "vaya coma",
  "hdputa",
  "pendejo",
  "sapo",
];

export function detectarContenidoNoPermitido(texto = "", opts = {}) {
  const raw = String(texto || "");
  const norm = _norm(raw);

  const phones = (raw.match(_PHONE_REGEX) || [])
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    // evita falsos positivos muy cortos
    .filter((m) => (m.replace(/\D/g, "").length >= 7));

  const emails = (raw.match(_EMAIL_REGEX) || []).map((x) => String(x || "").trim()).filter(Boolean);
  const urls = (raw.match(_URL_REGEX) || []).map((x) => String(x || "").trim()).filter(Boolean);

  const extraBadWords = Array.isArray(opts?.badWords) ? opts.badWords : [];
  const badWords = Array.from(new Set([..._BAD_WORDS, ...extraBadWords])).filter(Boolean);

  const contactHits = _CONTACT_WORDS.filter((w) => norm.includes(_norm(w)));
  const badHits = badWords.filter((w) => norm.includes(_norm(w)));

  const hasContact =
    phones.length > 0 || emails.length > 0 || urls.length > 0 || contactHits.length > 0;

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

  out = out.replace(_EMAIL_REGEX, (m) => {
    const parts = String(m || "").split("@");
    const u = parts[0] || "";
    const maskedU = u.length <= 1 ? "*" : u[0] + "***";
    return `${maskedU}@***.***`;
  });

  out = out.replace(_URL_REGEX, "***");

  out = out.replace(_PHONE_REGEX, (m) => {
    const digits = String(m || "").replace(/\D/g, "");
    if (digits.length < 7) return m;
    return String(m || "").replace(/\d/g, "*");
  });

  return out;
}

function _buildViolationMessage(v) {
  if (!v?.hasViolation) return null;

  if (v.hasContact) {
    return "🚫 Por seguridad, no permitimos compartir teléfonos, WhatsApp, correos ni links. Usa el chat de Mi Batute.";
  }
  if (v.hasAbuse) {
    return "🚫 Tu mensaje contiene lenguaje ofensivo. Por favor ajústalo para poder enviarlo.";
  }
  return "🚫 Tu mensaje contiene contenido no permitido.";
}

export const MAX_POSTULACIONES_POR_ARTICULO = 10;

export const obtenerPostulaciones = async (articuloId) => {
  try {
    if (!articuloId) {
      return { data: [], error: "articuloId es requerido" };
    }

    // 1) Traemos postulaciones (sin depender del embed)
    const { data: postulaciones, error: postError } = await supabase
      .from("postulaciones")
      .select(
        `
        id,
        justificacion,
        created_at,
        usuario_id
      `
      )
      .eq("articulo_id", articuloId)
      .order("created_at", { ascending: false });

    if (postError) {
      console.error("Error cargando postulaciones:", postError);
      return {
        data: [],
        error: postError.message || "No se pudieron cargar las postulaciones",
      };
    }

    const rows = Array.isArray(postulaciones) ? postulaciones : [];
    if (!rows.length) return { data: [], error: null };

    // 2) Tomamos los usuario_id únicos
    const ids = Array.from(new Set(rows.map((r) => r?.usuario_id).filter(Boolean)));

    if (!ids.length) {
      return {
        data: rows.map((r) => ({ ...r, usuarios: null })),
        error: null,
      };
    }

    // 3) Traemos usuarios por ids
    const { data: usuarios, error: userError } = await supabase
      .from("usuarios")
      .select("id, nombre, foto_url")
      .in("id", ids);

    if (userError) {
      console.warn("No se pudieron cargar usuarios (posible RLS o permisos):", userError);
      return {
        data: rows.map((r) => ({ ...r, usuarios: null })),
        error: null,
      };
    }

    const usersArr = Array.isArray(usuarios) ? usuarios : [];
    const userMap = new Map(usersArr.map((u) => [u.id, u]));

    // 4) Pegamos el objeto usuarios a cada postulación
    const merged = rows.map((r) => ({
      ...r,
      usuarios: userMap.get(r.usuario_id) || null,
    }));

    return { data: merged, error: null };
  } catch (e) {
    console.error("Error inesperado obteniendo postulaciones:", e);
    return { data: [], error: e?.message || "Error inesperado" };
  }
};

/**
 * ✅ contar postulaciones de un artículo
 */
export const contarPostulacionesArticulo = async (articuloId) => {
  try {
    const aid = String(articuloId || "").trim();
    if (!aid) return { count: 0, error: "articuloId es requerido" };

    const { count, error } = await supabase
      .from("postulaciones")
      .select("id", { count: "exact", head: true })
      .eq("articulo_id", aid);

    if (error) {
      console.log("Warn contarPostulacionesArticulo:", error);
      return { count: 0, error: error.message || "No se pudo contar" };
    }

    return { count: Number(count || 0), error: null };
  } catch (e) {
    console.log("Catch contarPostulacionesArticulo:", e);
    return { count: 0, error: e?.message || "Error inesperado" };
  }
};

/**
 * ✅ contar postulaciones de varios artículos
 * Devuelve Map { articuloId: count }
 *
 * Nota: este método trae las filas y agrupa en cliente.
 * Para pocos/miles de postulaciones va bien. Si crece demasiado,
 * lo ideal es un RPC en Supabase (SQL) que retorne grouped counts.
 */
export const contarPostulacionesPorArticulos = async (articuloIds = []) => {
  try {
    const ids = Array.from(new Set((articuloIds || []).map((x) => String(x || "").trim()).filter(Boolean)));
    if (!ids.length) return { map: new Map(), error: null };

    const { data, error } = await supabase.from("postulaciones").select("articulo_id").in("articulo_id", ids);

    if (error) {
      console.log("Warn contarPostulacionesPorArticulos:", error);
      return { map: new Map(), error: error.message || "No se pudo contar" };
    }

    const map = new Map();
    (data || []).forEach((r) => {
      const aid = String(r?.articulo_id || "").trim();
      if (!aid) return;
      map.set(aid, (map.get(aid) || 0) + 1);
    });

    // Asegura 0 para los que no aparezcan
    ids.forEach((aid) => {
      if (!map.has(aid)) map.set(aid, 0);
    });

    return { map, error: null };

    /**
     * Fallback (más caro): conteo exacto uno a uno (NO recomendado en producción)
     * const map = new Map();
     * for (const aid of ids) {
     *   const { count } = await supabase
     *     .from("postulaciones")
     *     .select("id", { count: "exact", head: true })
     *     .eq("articulo_id", aid);
     *   map.set(aid, Number(count || 0));
     * }
     * return { map, error: null };
     */
  } catch (e) {
    console.log("Catch contarPostulacionesPorArticulos:", e);
    return { map: new Map(), error: e?.message || "Error inesperado" };
  }
};

/**
 * ✅ crear postulación con límite máximo (10)
 * - Evita duplicado (si ya existe, no inserta)
 * - Si está lleno: error code MAX_POSTULACIONES_REACHED
 */
export const crearPostulacionConLimite = async ({ articuloId, usuarioId, justificacion = "", applyRateLimit = false }) => {
  try {
    const aid = String(articuloId || "").trim();
    const uid = String(usuarioId || "").trim();

    if (!aid || !uid) {
      return { success: false, error: "articuloId y usuarioId son requeridos" };
    }

    // ✅ filtro anti-contacto / malas palabras en la justificación
    const just = String(justificacion || "").trim();
    const v = detectarContenidoNoPermitido(just);
    if (v?.hasViolation) {
      return {
        success: false,
        error: _buildViolationMessage(v),
        code: v.hasContact ? "CONTACT_INFO_NOT_ALLOWED" : "ABUSIVE_CONTENT_NOT_ALLOWED",
        meta: {
          phones: v.phones,
          emails: v.emails,
          urls: v.urls,
          contactHits: v.contactHits,
          badHits: v.badHits,
          masked: enmascararContenido(just),
        },
      };
    }

    // ✅ Rate limit: máx 2 postulaciones a donaciones cada 6 horas
    if (applyRateLimit) {
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
      const { data: recientes, error: rateErr } = await supabase
        .from("postulacion_historial")
        .select("created_at")
        .eq("usuario_id", uid)
        .gte("created_at", sixHoursAgo)
        .order("created_at", { ascending: true });

      const { data: extras } = await supabase
        .from("cupos_extra_donacion")
        .select("created_at")
        .eq("usuario_id", uid)
        .gte("created_at", sixHoursAgo);
      const maxAllowed = 2 + (extras?.length || 0);

      if (!rateErr && recientes && recientes.length >= maxAllowed) {
        const masAntigua = new Date(recientes[0].created_at);
        const proxima = new Date(masAntigua.getTime() + 6 * 60 * 60 * 1000);
        const msRestantes = proxima - Date.now();
        const h = Math.floor(msRestantes / 3_600_000);
        const m = Math.floor((msRestantes % 3_600_000) / 60_000);
        const tiempoMsg = h > 0 ? `${h}h ${m}m` : `${m} minutos`;
        return {
          success: false,
          error: `⏳ Alcanzaste el límite de 2 postulaciones a donaciones cada 6 horas.\nPodrás postularte de nuevo en ${tiempoMsg}.`,
          code: "RATE_LIMIT_REACHED",
          meta: { proxima: proxima.toISOString(), h, m },
        };
      }
    }

    // 1) si ya existe postulación, no creamos otra
    const { data: existing, error: exErr } = await supabase
      .from("postulaciones")
      .select("id")
      .eq("articulo_id", aid)
      .eq("usuario_id", uid)
      .maybeSingle();

    if (exErr) {
      console.log("Warn validar duplicado postulacion:", exErr);
      // si RLS bloquea, el insert también fallará
    }

    if (existing?.id) {
      return {
        success: true,
        data: { id: existing.id, alreadyExists: true },
        error: null,
      };
    }

    // 2) contar cupos
    const { count, error: countErr } = await supabase
      .from("postulaciones")
      .select("id", { count: "exact", head: true })
      .eq("articulo_id", aid);

    if (countErr) {
      console.log("Warn count postulaciones:", countErr);
      return {
        success: false,
        error: countErr.message || "No se pudo validar el cupo de postulaciones",
      };
    }

    const current = Number(count || 0);
    if (current >= MAX_POSTULACIONES_POR_ARTICULO) {
      return {
        success: false,
        error: "Cupo lleno. Este artículo ya alcanzó el máximo de postulaciones.",
        code: "MAX_POSTULACIONES_REACHED",
        meta: { current, max: MAX_POSTULACIONES_POR_ARTICULO },
      };
    }

    // 3) insertar
    const { data: inserted, error: insErr } = await supabase
      .from("postulaciones")
      .insert({
        articulo_id: aid,
        usuario_id: uid,
        justificacion: String(justificacion || ""),
      })
      .select("id")
      .maybeSingle();

    if (insErr) {
      console.log("Error insert postulación:", insErr);
      return { success: false, error: insErr.message || "No se pudo crear la postulación" };
    }

    // ✅ Registrar en historial (persiste aunque se cancele la postulación)
    if (applyRateLimit) {
      await supabase
        .from("postulacion_historial")
        .insert({ usuario_id: uid, articulo_id: aid });
    }

    return {
      success: true,
      data: { id: inserted?.id || null, alreadyExists: false },
      error: null,
    };
  } catch (e) {
    console.error("crearPostulacionConLimite:", e);
    return { success: false, error: e?.message || "Error inesperado" };
  }
};

/**
 * ✅ cupos disponibles para un artículo
 */
export const obtenerCuposPostulaciones = async (articuloId) => {
  try {
    const { count, error } = await contarPostulacionesArticulo(articuloId);
    if (error)
      return {
        current: 0,
        max: MAX_POSTULACIONES_POR_ARTICULO,
        remaining: MAX_POSTULACIONES_POR_ARTICULO,
        error,
      };

    const current = Number(count || 0);
    const max = MAX_POSTULACIONES_POR_ARTICULO;
    const remaining = Math.max(0, max - current);

    return { current, max, remaining, error: null };
  } catch (e) {
    return {
      current: 0,
      max: MAX_POSTULACIONES_POR_ARTICULO,
      remaining: MAX_POSTULACIONES_POR_ARTICULO,
      error: e?.message || "Error inesperado",
    };
  }
};

/**
 * ✅ Cuando el comprador elimina su solicitud desde "Mis Rescates"
 * Borra:
 * - postulaciones (articulo_id + usuario_id)
 * - chats del artículo asociados a ese usuario (buyer)
 * - chat_messages de esos chats
 */
export const eliminarSolicitudCompradorYChat = async ({ articuloId, compradorId }) => {
  const aid = String(articuloId || "").trim();
  const uid = String(compradorId || "").trim();

  if (!aid || !uid) {
    return { success: false, error: "articuloId y compradorId son requeridos" };
  }

  let removedPostulaciones = 0;
  let removedChats = 0;
  let removedMensajes = 0;

  const deleteMessagesByChatIds = async (chatIds) => {
    if (!Array.isArray(chatIds) || !chatIds.length) return 0;
    try {
      const { data, error } = await supabase.from("chat_messages").delete().in("chat_id", chatIds).select("id");
      if (error) {
        console.log("Warn delete chat_messages:", error);
        return 0;
      }
      return Array.isArray(data) ? data.length : 0;
    } catch (e) {
      console.log("Catch delete chat_messages:", e);
      return 0;
    }
  };

  const fetchChatIdsForBuyer = async () => {
    // intento 1: buyer_id existe
    try {
      const { data, error } = await supabase.from("chats").select("id").eq("articulo_id", aid).eq("buyer_id", uid);

      if (!error) return (data || []).map((r) => r?.id).filter(Boolean);

      if (error?.message && /Could not find the 'buyer_id' column/i.test(error.message)) {
        // continue fallback
      } else {
        console.log("Warn fetch chats(buyer_id):", error);
        return [];
      }
    } catch {
      // continue
    }

    // intento 2: usuario_id (si tu tabla chats usa usuario_id)
    try {
      const { data, error } = await supabase.from("chats").select("id").eq("articulo_id", aid).eq("usuario_id", uid);

      if (!error) return (data || []).map((r) => r?.id).filter(Boolean);

      if (error) console.log("Warn fetch chats(usuario_id):", error);
    } catch (e) {
      console.log("Catch fetch chats(usuario_id):", e);
    }

    return [];
  };

  try {
    // 1) borrar postulación del comprador
    try {
      const { data, error } = await supabase
        .from("postulaciones")
        .delete()
        .eq("articulo_id", aid)
        .eq("usuario_id", uid)
        .select("id");

      if (error) {
        console.log("Warn delete postulacion comprador:", error);
      } else {
        removedPostulaciones += Array.isArray(data) ? data.length : 0;
      }
    } catch (e) {
      console.log("Catch delete postulacion comprador:", e);
    }

    // 2) buscar chats del comprador para ese artículo
    const chatIds = await fetchChatIdsForBuyer();

    // 3) borrar mensajes + chats
    if (chatIds.length) {
      removedMensajes += await deleteMessagesByChatIds(chatIds);

      try {
        const { data, error } = await supabase.from("chats").delete().in("id", chatIds).select("id");
        if (error) {
          console.log("Warn delete chats:", error);
        } else {
          removedChats += Array.isArray(data) ? data.length : 0;
        }
      } catch (e) {
        console.log("Catch delete chats:", e);
      }
    }

    return {
      success: true,
      data: { removedPostulaciones, removedChats, removedMensajes },
      error: null,
    };
  } catch (e) {
    console.error("eliminarSolicitudCompradorYChat:", e);
    return { success: false, error: e?.message || "Error inesperado" };
  }
};
