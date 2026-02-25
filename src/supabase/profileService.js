// src/supabase/profileService.js
import { supabase } from "./supabaseClient";

const BUCKET = "perfiles";

// Solo estas columnas se pueden escribir en DB
const sanitizeProfilePayload = (profile) => {
  const allowed = ["nombre", "movil", "ciudad", "localidad", "direccion", "foto_url"];
  const payload = {};
  for (const k of allowed) {
    const v = profile?.[k];
    if (v !== null && v !== undefined) payload[k] = v;
  }
  return payload;
};

// timeout helper
function withTimeout(promise, ms = 12000, label = "timeout") {
  let t;
  const timeoutPromise = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(label)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(t));
}

function ok(data) {
  return { success: true, data };
}
function fail(error, data = null, details = null) {
  return { success: false, error, data, details };
}

/**
 * ✅ IMPORTANTÍSIMO (para tu problema de anonimización):
 * - NO usamos auth.user_metadata para rellenar nombre/movil/ciudad/etc
 * - Si lo usas, "revive" datos reales aunque DB ya esté anonimizad@.
 * - Solo permitimos usar auth metadata como fallback de foto_url (opcional).
 */
async function getAuthPhotoForUserId(userId) {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;

    const u = data?.user;
    if (!u?.id || String(u.id) !== String(userId)) return null;

    const m = u.user_metadata || {};
    const foto_url = m.foto_url ?? m.avatar_url ?? m.photo_url ?? "";
    return { foto_url: String(foto_url || "").trim() };
  } catch {
    return null;
  }
}

/**
 * Detecta un perfil anonimizad@ según tu regla:
 * - nombre o movil en "0000" (puedes ajustar si tu RPC usa otro marcador)
 */
function isAnonymizedRow(row) {
  const nombre = String(row?.nombre ?? "").trim();
  const movil = String(row?.movil ?? "").trim();
  return nombre === "0000" || movil === "0000";
}

async function tryFetchProfile(userId) {
  const attempts = [
    { table: "usuarios", col: "id" },
    { table: "usuarios", col: "user_id" },
    { table: "profiles", col: "id" },
    { table: "profiles", col: "user_id" },
    { table: "users", col: "id" },
    { table: "users", col: "user_id" },
  ];

  // ✅ Importante: solo leemos lo que realmente usamos en UI
  const selectCols = "id,nombre,movil,ciudad,localidad,direccion,foto_url";

  for (const a of attempts) {
    try {
      const { data, error } = await supabase
        .from(a.table)
        .select(selectCols)
        .eq(a.col, userId)
        .maybeSingle();

      if (error) {
        console.log(`[getProfile] ${a.table}.${a.col} error:`, error);
        continue;
      }

      if (data) {
        // ✅ Si está anonimizad@, NO intentamos completar nada desde auth
        // (ni foto_url) para evitar re-hidratar info.
        if (!isAnonymizedRow(data)) {
          // ✅ Solo completamos foto_url si falta (y solo desde auth metadata)
          if (!data.foto_url) {
            const meta = await getAuthPhotoForUserId(userId);
            if (meta?.foto_url) data.foto_url = meta.foto_url;
          }
        }

        return ok(data);
      }
    } catch (e) {
      console.log(`[getProfile] ${a.table}.${a.col} catch:`, e);
    }
  }

  // ✅ Si no hay fila en DB:
  // - NO rellenamos desde auth metadata (evita “revivir” datos)
  // - devolvemos un perfil vacío
  const empty = {
    id: userId,
    nombre: "",
    movil: "",
    ciudad: "",
    localidad: "",
    direccion: "",
    foto_url: "",
  };

  // ⚠️ Antes intentabas auto-crear fila con datos desde auth metadata.
  // Eso también puede romper tu anonimización si la fila se borró o no existía.
  // Para tu caso, lo dejamos SIN auto insert por defecto.
  //
  // Si tú DE VERDAD necesitas auto-crear, dilo y lo reactivamos pero SIN metadata.

  return ok(empty);
}

export const getProfile = async (userId) => {
  if (!userId) return fail("Falta userId", null);

  try {
    return await withTimeout(tryFetchProfile(userId), 12000, "getProfile-timeout");
  } catch (e) {
    return fail(e?.message || "Error inesperado", null);
  }
};

async function updateThenInsertUsuarios(userId, payload) {
  const selectCols = "id,nombre,movil,ciudad,localidad,direccion,foto_url";

  const upd = await supabase
    .from("usuarios")
    .update(payload)
    .eq("id", userId)
    .select(selectCols)
    .maybeSingle();

  if (upd?.error) return { data: null, error: upd.error, stage: "update" };
  if (upd?.data) return { data: upd.data, error: null, stage: "update" };

  const ins = await supabase
    .from("usuarios")
    .insert([{ id: userId, ...payload }])
    .select(selectCols)
    .maybeSingle();

  if (ins?.error) return { data: null, error: ins.error, stage: "insert" };
  return { data: ins.data || null, error: null, stage: "insert" };
}

export const updateProfile = async (userId, profile, file = null) => {
  if (!userId) return fail("Falta userId");

  try {
    let foto_url = String(profile?.foto_url || "").trim();

    // 1) Upload si hay file
    if (file) {
      const ext = (file.name?.split(".").pop() || "jpg").toLowerCase();
      const safeExt = ext.replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${userId}/${userId}.${safeExt}`;

      const uploadPromise = supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || "image/jpeg",
        cacheControl: "0",
        upsert: true,
      });

      const { error: upErr } = await withTimeout(uploadPromise, 20000, "upload-timeout");
      if (upErr) return fail(upErr.message);

      const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const baseUrl = publicData?.publicUrl || "";
      foto_url = baseUrl ? `${baseUrl}?v=${Date.now()}` : "";
    }

    // 2) Guardar en usuarios
    const payload = sanitizeProfilePayload({ ...profile, foto_url });

    const res = await withTimeout(
      updateThenInsertUsuarios(userId, payload),
      12000,
      "updateProfile-timeout"
    );

    if (res?.error) {
      console.log("[updateProfile] usuarios error:", res.error, "stage:", res.stage);
      return fail(res.error.message || "Error guardando perfil", null, {
        stage: res.stage,
        code: res.error.code,
        details: res.error.details,
        hint: res.error.hint,
      });
    }

    /**
     * ✅ CAMBIO CLAVE:
     * Antes guardabas PII en auth.user_metadata (nombre/movil/ciudad/etc).
     * Eso es EXACTAMENTE lo que hace que, después de anonimizar en DB,
     * vuelvas a ver el nombre/teléfono reales al re-login.
     *
     * Para tu caso (privacidad/anonimización), NO sincronizamos PII a Auth.
     * Si quieres, luego podemos guardar SOLO foto_url (pero por ahora lo dejamos limpio).
     */

    const data = res?.data || null;
    return { success: true, data, foto_url: data?.foto_url || foto_url };
  } catch (e) {
    return fail(e?.message || "Error inesperado");
  }
};