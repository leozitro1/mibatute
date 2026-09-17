// src/supabase/profileService.js
import { supabase } from "./supabaseClient";

const BUCKET = "perfiles";

// Limpia null/undefined y SOLO permite estas columnas
const sanitizeProfilePayload = (profile) => {
  const allowed = ["nombre", "movil", "ciudad", "localidad", "direccion", "foto_url"];
  const payload = {};
  for (const k of allowed) {
    const v = profile?.[k];
    if (v !== null && v !== undefined) payload[k] = v;
  }
  return payload;
};

// ✅ timeout helper para que NUNCA se quede colgado
function withTimeout(promise, ms = 12000, label = "timeout") {
  let t;
  const timeoutPromise = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(label)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(t));
}

// ✅ normaliza salida a tu forma { success, data, error }
function ok(data) {
  return { success: true, data };
}
function fail(error, data = null) {
  return { success: false, error, data };
}

// ✅ intenta leer perfil en varias tablas/columnas (por cambios de esquema)
async function tryFetchProfile(userId) {
  const attempts = [
    // tu caso actual
    { table: "usuarios", col: "id" },

    // variantes comunes
    { table: "usuarios", col: "user_id" },
    { table: "profiles", col: "id" },
    { table: "profiles", col: "user_id" },
    { table: "users", col: "id" },
    { table: "users", col: "user_id" },
  ];

  // columnas que queremos leer (si existen)
  const selectCols = "id,nombre,movil,ciudad,localidad,direccion,foto_url";

  for (const a of attempts) {
    try {
      const { data, error } = await supabase
        .from(a.table)
        .select(selectCols)
        .eq(a.col, userId)
        .maybeSingle(); // ✅ no explota si no hay fila

      if (error) {
        // si la tabla/columna no existe o no tienes permisos, seguimos probando
        // (esto te ayuda cuando cambiaste esquema y quedó algo viejo)
        // ojo: RLS normalmente devuelve error rápido; igual lo logueamos.
        console.log(`[getProfile] ${a.table}.${a.col} error:`, error);
        continue;
      }

      if (data) {
        return ok(data);
      }
    } catch (e) {
      console.log(`[getProfile] ${a.table}.${a.col} catch:`, e);
      continue;
    }
  }

  // Si no existe fila en ninguna tabla, devolvemos success:true con data "vacía"
  // (para que el perfil cargue igual y se pueda editar/crear)
  return ok({
    id: userId,
    nombre: "",
    movil: "",
    ciudad: "",
    localidad: "",
    direccion: "",
    foto_url: "",
  });
}

export const getProfile = async (userId) => {
  if (!userId) return fail("Falta userId", null);

  try {
    // ✅ corta cuelgues reales de red/fetch
    const res = await withTimeout(tryFetchProfile(userId), 12000, "getProfile-timeout");
    return res;
  } catch (e) {
    // ✅ acá cae cuando se cuelga la request o hay un freeze
    const msg = e?.message || "Error inesperado";
    return fail(msg, null);
  }
};

export const updateProfile = async (userId, profile, file = null) => {
  if (!userId) return { success: false, error: "Falta userId" };

  try {
    let foto_url = profile?.foto_url || "";

    // 1) Si viene archivo, súbelo a Storage (con upsert)
    if (file) {
      const ext = (file.name?.split(".").pop() || "jpg").toLowerCase();
      const safeExt = ext.replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${userId}/${userId}.${safeExt}`;

      const uploadPromise = supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || "image/jpeg",
        cacheControl: "3600",
        upsert: true, // ✅ reemplaza si existe
      });

      const { error: upErr } = await withTimeout(uploadPromise, 20000, "upload-timeout");
      if (upErr) return { success: false, error: upErr.message };

      // URL pública + bust de cache
      const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const baseUrl = publicData?.publicUrl || "";
      foto_url = baseUrl ? `${baseUrl}?v=${Date.now()}` : "";
    }

    // 2) Upsert en tabla usuarios (robusto: crea si no existe)
    const payload = sanitizeProfilePayload({ ...profile, foto_url });

    const upsertPromise = supabase
      .from("usuarios")
      .upsert([{ id: userId, ...payload }], { onConflict: "id" })
      .select("id,nombre,movil,ciudad,localidad,direccion,foto_url")
      .single();

    const { data, error } = await withTimeout(upsertPromise, 12000, "updateProfile-timeout");

    if (error) return { success: false, error: error.message };

    return { success: true, data, foto_url: data?.foto_url || foto_url };
  } catch (e) {
    return { success: false, error: e?.message || "Error inesperado" };
  }
};
