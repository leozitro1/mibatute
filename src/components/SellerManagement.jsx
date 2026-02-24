// src/components/SellerManagement.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase/supabaseClient";

export default function SellerManagement({ item, onSelectWinner, onMarkDelivered }) {
  const articuloId = item?.id || null;

  const titulo = item?.titulo || item?.title || "Sin título";
  const estado = String(item?.estado || item?.status || "disponible").toLowerCase();

  const [postulaciones, setPostulaciones] = useState([]);
  const [loadingPost, setLoadingPost] = useState(false);
  const [errorPost, setErrorPost] = useState("");

  // Para mostrar el “ganador/comprador” si está reservado
  const compradorId =
    item?.comprador_id ||
    item?.buyer_id ||
    item?.winner_id ||
    item?.winnerUid ||
    null;

  const [compradorNombre, setCompradorNombre] = useState("");

  // ✅ Cargar postulaciones del artículo (si está disponible)
  useEffect(() => {
    let alive = true;

    const fetchPostulaciones = async () => {
      if (!articuloId) return;

      // solo tiene sentido cargar lista si aún está disponible
      if (estado !== "disponible") {
        setPostulaciones([]);
        setErrorPost("");
        return;
      }

      setLoadingPost(true);
      setErrorPost("");

      try {
        const { data, error } = await supabase
          .from("postulaciones")
          .select("id, justificacion, created_at, usuario_id, usuarios(nombre, foto_url)")
          .eq("articulo_id", articuloId)
          .order("created_at", { ascending: false });

        if (error) throw error;

        if (!alive) return;
        setPostulaciones(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error("Error cargando postulaciones:", e);
        if (!alive) return;
        setErrorPost(e?.message || "No se pudieron cargar las postulaciones.");
        setPostulaciones([]);
      } finally {
        if (!alive) return;
        setLoadingPost(false);
      }
    };

    fetchPostulaciones();

    return () => {
      alive = false;
    };
  }, [articuloId, estado]);

  // ✅ Si está reservado, traemos el nombre del comprador/ganador
  useEffect(() => {
    let alive = true;

    const fetchComprador = async () => {
      setCompradorNombre("");
      if (!compradorId) return;
      if (estado !== "reservado") return;

      try {
        const { data, error } = await supabase
          .from("usuarios")
          .select("nombre")
          .eq("id", compradorId)
          .maybeSingle();

        if (error) throw error;
        if (!alive) return;
        setCompradorNombre(data?.nombre || "");
      } catch (e) {
        console.error("Error cargando comprador:", e);
        // silencioso (no bloquea UI)
      }
    };

    fetchComprador();

    return () => {
      alive = false;
    };
  }, [compradorId, estado]);

  const total = useMemo(() => postulaciones.length, [postulaciones.length]);

  return (
    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
      <h3 className="font-black text-gray-800 mb-4 uppercase text-xs tracking-widest">
        Gestionar: {titulo}
      </h3>

      {/* ✅ DISPONIBLE */}
      {estado === "disponible" && (
        <div className="space-y-4">
          <p className="text-xs text-gray-500 italic">Interesados ({total}/10):</p>

          {errorPost ? (
            <p className="text-sm text-red-600 font-bold text-center py-4">{errorPost}</p>
          ) : loadingPost ? (
            <p className="text-sm text-gray-400 font-bold text-center py-6">Cargando postulaciones...</p>
          ) : total === 0 ? (
            <p className="text-sm text-gray-400 font-bold text-center py-6">
              Aún no hay solicitudes para este artículo.
            </p>
          ) : (
            postulaciones.map((p) => {
              const nombre = p?.usuarios?.nombre || "Usuario";
              const mensaje = p?.justificacion || "";
              return (
                <div key={p.id} className="bg-smoke-white p-4 rounded-2xl border border-gray-100">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-bold text-sm">{nombre}</span>

                    <button
                      onClick={() => onSelectWinner?.(item.id, p)}
                      className="bg-forest-green text-white text-[10px] px-3 py-1 rounded-full font-black uppercase"
                      type="button"
                    >
                      Elegir
                    </button>
                  </div>

                  {mensaje ? (
                    <p className="text-xs text-gray-600">"{mensaje}"</p>
                  ) : (
                    <p className="text-xs text-gray-400 italic">Sin justificación.</p>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ✅ RESERVADO */}
      {estado === "reservado" && (
        <div className="text-center py-4">
          <p className="text-sm font-bold text-orange-600 mb-2">Artículo en proceso de entrega</p>

          {compradorId ? (
            <p className="text-xs text-gray-500 mb-4">
              Comprador/Ganador:{" "}
              <span className="font-bold">{compradorNombre || compradorId.slice(0, 8) + "…"}</span>
            </p>
          ) : (
            <p className="text-xs text-gray-400 mb-4">Aún no se ha asignado comprador/ganador.</p>
          )}

          <button
            onClick={() => onMarkDelivered?.(item.id)}
            className="w-full bg-gray-800 text-white py-3 rounded-xl font-black text-xs uppercase"
            type="button"
          >
            Confirmar Entrega Final
          </button>
        </div>
      )}

      {/* ✅ ENTREGADO */}
      {estado === "entregado" && (
        <div className="text-center py-4">
          <p className="text-sm font-bold text-gray-700">✅ Artículo entregado</p>
          {compradorId ? (
            <p className="text-xs text-gray-500 mt-2">
              Entregado a: <span className="font-bold">{compradorNombre || compradorId.slice(0, 8) + "…"}</span>
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
