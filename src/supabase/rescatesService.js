// src/supabase/rescatesService.js
import { supabase } from "./supabaseClient";

export async function obtenerMisRescates(userId) {
  try {
    if (!userId) return { data: [], error: null };

    // 1️⃣ Regalos / Donaciones (postulaciones)
    const { data: postulaciones, error: errPost } = await supabase
      .from("postulaciones")
      .select(
        `
        id,
        articulo_id,
        created_at,
        justificacion,
        articulo:articulos (*)
      `
      )
      .eq("usuario_id", userId);

    if (errPost) console.error("postulaciones:", errPost);

    // 2️⃣ Ventas (chats del COMPRADOR)
    // ✅ SOLO comprador. Nada de owner_id aquí porque "Mis Rescates" es lo que yo compré/negocié como buyer.
    let ventas = [];
    let errChats = null;

    const tryChats = async (mode) => {
      // modo principal
      if (mode === "buyer_id") {
        return await supabase
          .from("chats")
          .select(
            `
            id,
            articulo_id,
            created_at,
            articulo:articulos (*)
          `
          )
          .eq("buyer_id", userId);
      }

      // fallback: algunos esquemas usan usuario_id para el comprador
      if (mode === "usuario_id") {
        return await supabase
          .from("chats")
          .select(
            `
            id,
            articulo_id,
            created_at,
            articulo:articulos (*)
          `
          )
          .eq("usuario_id", userId);
      }

      return { data: [], error: null };
    };

    // intento principal
    let resChats = await tryChats("buyer_id");

    // fallback si buyer_id no existe
    if (resChats?.error?.message && /Could not find the 'buyer_id' column/i.test(resChats.error.message)) {
      resChats = await tryChats("usuario_id");
    }

    ventas = Array.isArray(resChats?.data) ? resChats.data : [];
    errChats = resChats?.error || null;

    if (errChats) console.error("chats:", errChats);

    // 3️⃣ Normalizar formato único
    const normalizar = (r, source) => ({
      id: r?.id,
      articulo_id: r?.articulo_id,
      created_at: r?.created_at,
      justificacion: r?.justificacion || null,
      articulo: r?.articulo || null,
      _source: source, // debug opcional
    });

    const listaCruda = [
      ...(Array.isArray(postulaciones) ? postulaciones.map((r) => normalizar(r, "postulaciones")) : []),
      ...(Array.isArray(ventas) ? ventas.map((r) => normalizar(r, "chats")) : []),
    ].filter((x) => x?.articulo_id); // sin articulo_id no sirve para Mis Rescates

    // ✅ EXTRA anti-resurrección:
    // Si por cualquier motivo viene un chat sin articulo (join vacío), lo dejamos igual (tu UI ya hace merge),
    // pero si quieres ser más estricto, puedes filtrar aquí: .filter(x => x.articulo)
    // (lo dejo suave para no romper tu UI en casos de RLS)
    // const listaCruda2 = listaCruda.filter((x) => x?.articulo); // modo estricto

    // 4️⃣ Deduplicar por articulo_id (si aparece en chats y postulaciones, dejamos el más reciente)
    const map = new Map();
    for (const item of listaCruda) {
      const key = String(item.articulo_id);
      if (!map.has(key)) {
        map.set(key, item);
        continue;
      }

      const prev = map.get(key);
      const tPrev = prev?.created_at ? new Date(prev.created_at).getTime() : 0;
      const tNow = item?.created_at ? new Date(item.created_at).getTime() : 0;

      // ✅ si el actual es más reciente, reemplaza
      if (tNow >= tPrev) map.set(key, item);

      // ✅ si el previo no tenía articulo y este sí, reemplaza
      if (!prev?.articulo && item?.articulo) map.set(key, item);
    }

    const lista = Array.from(map.values());

    // 5️⃣ Ordenar por fecha (más reciente primero)
    lista.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return { data: lista, error: null };
  } catch (e) {
    console.error("obtenerMisRescates:", e);
    return { data: [], error: e };
  }
}
