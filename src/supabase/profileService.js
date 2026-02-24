// src/supabase/profileService.js
import { supabase } from "./supabaseClient";

const BUCKET = "perfiles";

const sanitizeProfilePayload = (profile) => {
  const allowed = ["nombre", "movil", "ciudad", "localidad", "direccion", "foto_url"];
  const payload = {};
  for (const k of allowed) {
    const v = profile?.[k];
    if (v !== null && v !== undefined) payload[k] = v;
  }
  return payload;
};

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

async function getAuthMetaForUserId(userId) {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;

    const u = data?.user;
    if (!u?.id || String(u.id) !== String(userId)) return null;

    const m = u.user_metadata || {};
    return {
      nombre: m.nombre ?? m.full_name ?? m.name ?? m.display_name ?? "",
      movil: m.movil ?? m.phone ?? "",
      ciudad: m.ciudad ?? m.city ?? "",
      localidad: m.localidad ?? m.localidad_es ?? m.locality ?? m.location ?? "",
      direccion: m.direccion ?? m.address ?? "",
      foto_url: m.foto_url ?? m.avatar_url ?? m.photo_url ?? "",
    };
  } catch {
    return null;
  }
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
        // ✅ si DB no trae foto_url, intenta completar desde auth metadata
        if (!data.foto_url) {
          const meta = await getAuthMetaForUserId(userId);
          if (meta?.foto_url) data.foto_url = meta.foto_url;
        }
        return ok(data);
      }
    } catch (e) {
      console.log(`[getProfile] ${a.table}.${a.col} catch:`, e);
    }
  }

  const meta = await getAuthMetaForUserId(userId);

  const empty = {
    id: userId,
    nombre: meta?.nombre || "",
    movil: meta?.movil || "",
    ciudad: meta?.ciudad || "",
    localidad: meta?.localidad || "",
    direccion: meta?.direccion || "",
    foto_url: meta?.foto_url || "",
  };

  // intento crear fila (si RLS lo permite)
  try {
    const payload = sanitizeProfilePayload(empty);
    const { data: insData, error: insErr } = await supabase
      .from("usuarios")
      .insert([{ id: userId, ...payload }])
      .select(selectCols)
      .maybeSingle();

    if (!insErr && insData) return ok(insData);
    if (insErr) console.log("[getProfile] insert auto usuarios warn:", insErr);
  } catch (e) {
    console.log("[getProfile] insert auto usuarios catch:", e);
  }

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

    // ✅ 3) CLAVE: guardar también en auth metadata (fallback al re-login)
    try {
      await supabase.auth.updateUser({
        data: {
          nombre: payload.nombre ?? undefined,
          movil: payload.movil ?? undefined,
          ciudad: payload.ciudad ?? undefined,
          localidad: payload.localidad ?? undefined,
          direccion: payload.direccion ?? undefined,
          foto_url: payload.foto_url ?? undefined,
        },
      });
    } catch (e) {
      console.log("[updateProfile] auth.updateUser warn:", e?.message || e);
      // no rompemos el flujo: usuarios ya quedó guardado
    }

    const data = res?.data || null;
    return { success: true, data, foto_url: data?.foto_url || foto_url };
  } catch (e) {
    return fail(e?.message || "Error inesperado");
  }
};