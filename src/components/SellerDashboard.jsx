// src/components/SellerDashboard.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase/supabaseClient";

export default function SellerDashboard({ myProducts }) {
  const [postulacionesByArticulo, setPostulacionesByArticulo] = useState({});
  const [loadingMap, setLoadingMap] = useState({}); // { [articuloId]: boolean }
  const [savingWinner, setSavingWinner] = useState(false);

  const articuloIds = useMemo(
    () => (Array.isArray(myProducts) ? myProducts.map((p) => p.id).filter(Boolean) : []),
    [myProducts]
  );

  // ✅ Cargar postulaciones por cada artículo del vendedor
  useEffect(() => {
    let alive = true;

    const fetchAll = async () => {
      if (!articuloIds.length) {
        setPostulacionesByArticulo({});
        return;
      }

      // marcamos loading por artículo
      const lm = {};
      articuloIds.forEach((id) => (lm[id] = true));
      setLoadingMap(lm);

      try {
        const { data, error } = await supabase
          .from("postulaciones")
          .select("id, justificacion, created_at, usuario_id, articulo_id, usuarios(nombre, foto_url)")
          .in("articulo_id", articuloIds)
          .order("created_at", { ascending: false });

        if (error) throw error;

        const grouped = {};
        (data || []).forEach((row) => {
          const aid = row.articulo_id;
          if (!grouped[aid]) grouped[aid] = [];
          grouped[aid].push(row);
        });

        if (!alive) return;
        setPostulacionesByArticulo(grouped);
      } catch (e) {
        console.error("Error cargando postulaciones:", e);
        if (!alive) return;
        setPostulacionesByArticulo({});
      } finally {
        if (!alive) return;
        const done = {};
        articuloIds.forEach((id) => (done[id] = false));
        setLoadingMap(done);
      }
    };

    fetchAll();

    return () => {
      alive = false;
    };
  }, [articuloIds]);

  // ✅ Elegir “ganador” (entregar) -> actualiza articulos
  const acceptWinner = async (articuloId, post) => {
    if (!articuloId || !post?.usuario_id) return;

    try {
      setSavingWinner(true);

      // Guardamos comprador/ganador en español + compat (si existe en tu tabla)
      // OJO: si NO tienes estas columnas, quítalas del update:
      // - comprador_id / buyer_id
      // - winnerUid / winner_id
      const payload = {
        estado: "reservado",
        status: "reservado", // compat mientras migras todo
        comprador_id: post.usuario_id, // ✅ tu propuesta (si ya creaste esa columna)
        // buyer_id: post.usuario_id,   // opcional si existe
      };

      const { error } = await supabase.from("articulos").update(payload).eq("id", articuloId);
      if (error) throw error;

      const nombre = post?.usuarios?.nombre || "la persona";
      alert(`¡Genial! Has elegido a ${nombre}. Ahora pueden chatear.`);

      // refresca visualmente el estado en UI (sin esperar el poll)
      // NOTA: como myProducts viene del padre, aquí solo refrescamos postulaciones.
      // El padre (UserProfile/App) hará el refresh por el polling o por load().
    } catch (error) {
      console.error("Error al aceptar:", error);
      alert("No se pudo reservar el artículo. Revisa la consola.");
    } finally {
      setSavingWinner(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-black text-gray-800 uppercase">Mis Artículos</h2>

      {(myProducts || []).map((product) => {
        const titulo = product?.titulo || product?.title || "Sin título";
        const estado = String(product?.estado || product?.status || "disponible").toLowerCase();
        const postulaciones = postulacionesByArticulo[product.id] || [];
        const isDisponible = estado === "disponible";

        return (
          <div
            key={product.id}
            className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100"
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg">{titulo}</h3>

              <span
                className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${
                  estado === "disponible"
                    ? "bg-green-100 text-green-600"
                    : "bg-orange-100 text-orange-600"
                }`}
              >
                {estado}
              </span>
            </div>

            {/* Lista de interesados */}
            <div className="space-y-3">
              <p className="text-xs font-black text-gray-400 uppercase">
                Solicitudes ({postulaciones.length})
              </p>

              {loadingMap[product.id] ? (
                <p className="text-gray-400 text-sm font-bold">Cargando postulaciones...</p>
              ) : postulaciones.length === 0 ? (
                <p className="text-gray-400 text-sm">Aún no hay postulaciones.</p>
              ) : (
                postulaciones.map((p) => {
                  const nombre = p?.usuarios?.nombre || "Usuario";
                  const msg = p?.justificacion || "";
                  return (
                    <div
                      key={p.id}
                      className="flex flex-col gap-2 p-4 bg-smoke-white rounded-2xl border border-gray-50"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-sm text-forest-green">{nombre}</span>

                        {isDisponible && (
                          <button
                            onClick={() => acceptWinner(product.id, p)}
                            disabled={savingWinner}
                            className="bg-forest-green text-white text-[10px] px-4 py-2 rounded-xl font-black uppercase hover:scale-105 transition disabled:opacity-50"
                            type="button"
                          >
                            {savingWinner ? "Procesando..." : "Entregar a él/ella"}
                          </button>
                        )}
                      </div>

                      {msg ? (
                        <p className="text-xs text-gray-600 italic">"{msg}"</p>
                      ) : (
                        <p className="text-xs text-gray-400 italic">Sin justificación.</p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
