// src/supabase/authService.js
import { supabase } from "./supabaseClient";

export const registerUser = async (email, password, extraData = {}) => {
  const cleanEmail = String(email || "").trim();
  const cleanPassword = String(password || "");

  const nombre = String(extraData?.nombre || "").trim();
  const movil = String(extraData?.movil || "").trim();

  // ✅ estandar: ciudad/localidad (ES)
  const ciudad = String(extraData?.ciudad || extraData?.city || "").trim();
  const localidad = String(extraData?.localidad || extraData?.location || "").trim();

  const { data, error: authError } = await supabase.auth.signUp({
    email: cleanEmail,
    password: cleanPassword,
    options: {
      // ✅ guardamos metadata consistente
      data: {
        nombre,
        movil,
        ciudad,
        localidad,
      },
    },
  });

  if (authError) return { success: false, error: authError.message };

  const user = data?.user;
  if (!user) {
    return {
      success: false,
      error:
        "El usuario se creó pero no se recibió user (revisa confirmación de email en Supabase).",
    };
  }

  // ✅ Inserta/actualiza en tabla usuarios
  // - Si por alguna razón el registro se corre dos veces, evita duplicados.
  // - Requiere constraint único en usuarios.id (normalmente es PK).
  const { error: dbError } = await supabase.from("usuarios").upsert(
    [
      {
        id: user.id,
        nombre,
        movil,
        ciudad,
        localidad,
      },
    ],
    { onConflict: "id" }
  );

  if (dbError) return { success: false, error: dbError.message };

  return { success: true, user };
};

export const loginUser = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(email || "").trim(),
    password: String(password || ""),
  });

  if (error) return { success: false, error: error.message };

  return { success: true, user: data.user, session: data.session };
};

export const getSession = async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error) return { success: false, error: error.message };
  return { success: true, session: data.session, user: data.session?.user ?? null };
};

export const logoutUser = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) return { success: false, error: error.message };
  return { success: true };
};
