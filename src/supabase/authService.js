// src/supabase/authService.js
import { supabase } from "./supabaseClient";

/**
 * ✅ Garantiza que exista fila en public.usuarios con id = auth.uid().
 * IMPORTANTE: Esto requiere sesión (auth.uid()) para pasar RLS.
 */
export const ensureUsuarioRow = async (user, extraData = {}) => {
  const uid = user?.id;
  if (!uid) return { success: false, error: "No hay user.id" };

  const nombre =
    String(extraData?.nombre || user?.user_metadata?.nombre || "").trim() || null;

  const movil =
    String(extraData?.movil || user?.user_metadata?.movil || "").trim() || null;

  const ciudad =
    String(
      extraData?.ciudad ||
        extraData?.city ||
        user?.user_metadata?.ciudad ||
        ""
    ).trim() || null;

  const localidad =
    String(
      extraData?.localidad ||
        extraData?.localidad_es ||
        extraData?.location ||
        user?.user_metadata?.localidad ||
        user?.user_metadata?.locality ||
        ""
    ).trim() || null;

  // ✅ CLAVE: usar "id" como PK (como ya lo haces en profileService.js)
  const row = {
    id: uid,
    nombre,
    movil,
    ciudad,
    localidad,
  };

  // limpia undefined
  for (const k of Object.keys(row)) {
    if (row[k] === undefined) delete row[k];
  }

  const { error } = await supabase
    .from("usuarios")
    .upsert([row], { onConflict: "id" }); // ✅ conflicto por id

  if (error) return { success: false, error: error.message };
  return { success: true };
};

export const registerUser = async (email, password, extraData = {}) => {
  const cleanEmail = String(email || "").trim();
  const cleanPassword = String(password || "");

  const nombre = String(extraData?.nombre || "").trim();
  const movil = String(extraData?.movil || "").trim();

  const ciudad = String(extraData?.ciudad || extraData?.city || "").trim();
  const localidad = String(extraData?.localidad || extraData?.location || "").trim();

  // ✅ Redirección del correo de confirmación a tu app
  const emailRedirectTo = `${window.location.origin}/auth/callback`;

  const { data, error: authError } = await supabase.auth.signUp({
    email: cleanEmail,
    password: cleanPassword,
    options: {
      emailRedirectTo,
      // ✅ guardamos en user_metadata (incluye compat con localidad_es)
      data: { nombre, movil, ciudad, localidad, localidad_es: localidad },
    },
  });

  if (authError) return { success: false, error: authError.message };

  const user = data?.user ?? null;
  const session = data?.session ?? null;

  if (!user) {
    return {
      success: false,
      error:
        "El usuario se creó pero no se recibió user (revisa configuración de Auth).",
    };
  }

  // ✅ Si NO hay sesión, significa que se requiere confirmación de email.
  // En ese caso NO podemos tocar tablas con RLS (no hay auth.uid()).
  if (!session) {
    return {
      success: true,
      user,
      needsEmailConfirmation: true,
    };
  }

  // ✅ Si sí hay sesión (caso raro cuando confirmaciones no aplican),
  // aseguramos fila en usuarios.
  const ensured = await ensureUsuarioRow(user, { nombre, movil, ciudad, localidad });
  if (!ensured.success) return ensured;

  return { success: true, user, session, needsEmailConfirmation: false };
};

export const loginUser = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(email || "").trim(),
    password: String(password || ""),
  });

  if (error) return { success: false, error: error.message };

  // ✅ Ya hay sesión, aquí sí se puede asegurar fila en usuarios
  const ensured = await ensureUsuarioRow(data.user, {});
  if (!ensured.success) {
    console.warn("ensureUsuarioRow login:", ensured.error);
  }

  return { success: true, user: data.user, session: data.session };
};

export const getSession = async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error) return { success: false, error: error.message };

  const user = data.session?.user ?? null;

  if (user) {
    const ensured = await ensureUsuarioRow(user, {});
    if (!ensured.success) console.warn("ensureUsuarioRow session:", ensured.error);
  }

  return { success: true, session: data.session, user };
};

export const logoutUser = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) return { success: false, error: error.message };
  return { success: true };
};