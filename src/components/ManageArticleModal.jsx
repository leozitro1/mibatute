// src/components/ManageArticleModal.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase/supabaseClient";

const FALLBACK_SVG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
    <rect width="100%" height="100%" fill="#f3f4f6"/>
    <text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle"
      fill="#6b7280" font-family="Arial" font-size="14">
      Sin imagen
    </text>
  </svg>
`);

function getThumb(item) {
  if (typeof item?.imagen_url_principal === "string" && item.imagen_url_principal.trim()) {
    return item.imagen_url_principal.trim();
  }
  if (typeof item?.imagen_url === "string" && item.imagen_url.trim()) {
    return item.imagen_url.trim();
  }
  if (typeof item?.image_url === "string" && item.image_url.trim()) return item.image_url.trim();

  if (Array.isArray(item?.imagenes) && item.imagenes.length) {
    const first = item.imagenes[0];
    if (typeof first === "string" && first.trim()) return first.trim();
  }

  if (Array.isArray(item?.articulo_imagenes) && item.articulo_imagenes.length) {
    const first = item.articulo_imagenes[0];
    if (first?.url && String(first.url).trim()) return String(first.url).trim();
  }

  return FALLBACK_SVG;
}

function normEstado(v) {
  const s = String(v || "").toLowerCase().trim();
  if (s === "available") return "disponible";
  if (s === "reserved") return "reservado";
  if (s === "delivered") return "entregado";
  return s || "disponible";
}

// ✅ UNIFICACIÓN: regalo -> donacion
function normTipo(v) {
  const s = String(v || "").toLowerCase().trim();
  if (!s) return "donacion";
  if (s.includes("venta")) return "venta";
  if (s.includes("don")) return "donacion";
  if (s.includes("regal")) return "donacion";
  return s;
}

/**
 * ✅ Update "a prueba de columnas faltantes"
 * Si Supabase responde: Could not find the 'X' column...
 * quitamos X del payload y reintentamos 1 vez.
 */
async function safeUpdateArticulos(articleId, patch) {
  let payload = { ...(patch || {}) };

  let { error } = await supabase.from("articulos").update(payload).eq("id", articleId);

  if (error?.message && /Could not find the '(.+?)' column/i.test(error.message)) {
    const m = error.message.match(/Could not find the '(.+?)' column/i);
    const missing = m?.[1];

    if (missing && Object.prototype.hasOwnProperty.call(payload, missing)) {
      delete payload[missing];
      ({ error } = await supabase.from("articulos").update(payload).eq("id", articleId));
    }
  }

  return { error };
}

export default function ManageArticleModal({
  isOpen,
  onClose,
  article,
  onOpenChat, // opcional
  onCancelSale, // opcional (si App.jsx lo pasa)
  onCancelSaleSuccess, // opcional: para refrescar lista (ej: load())
}) {
  const [postulados, setPostulados] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingWinner, setSavingWinner] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // ✅ VENTA (comprador)
  const [buyerLoading, setBuyerLoading] = useState(false);
  const [buyerPublic, setBuyerPublic] = useState(null);

  // ✅ DONACIÓN (ganador)
  const [winnerLoading, setWinnerLoading] = useState(false);
  const [winnerPublic, setWinnerPublic] = useState(null);

  // ✅ mantener winner local para que NO dependa de article actualizado
  const [winnerIdLocal, setWinnerIdLocal] = useState(null);
  const [winnerDisplayLocal, setWinnerDisplayLocal] = useState(null); // { nombre, foto_url }

  const articuloId = useMemo(() => {
    return article?.id || article?.articulo_id || article?.uuid || null;
  }, [article?.id, article?.articulo_id, article?.uuid]);

  const tipoNorm = normTipo(article?.tipo ?? article?.mode ?? article?.tipo_publicacion ?? "donacion");
  const estado = normEstado(article?.estado ?? article?.status ?? "");

  const isVenta = tipoNorm === "venta";
  const isReservado = estado === "reservado";
  const isEntregado = estado === "entregado";

  const buyerId = article?.buyer_id || article?.buyerId || null;

  const winnerIdFromArticle =
    article?.ganador_id ||
    article?.winner_id ||
    article?.winnerUid ||
    article?.recipient_id ||
    null;

  // ✅ sync winner local cuando abre modal
  useEffect(() => {
    if (!isOpen) return;
    setWinnerIdLocal(winnerIdFromArticle || null);
    setWinnerPublic(null);
    setWinnerDisplayLocal(null);
  }, [isOpen, winnerIdFromArticle]);

  const winnerId = winnerIdLocal || winnerIdFromArticle || null;

  // ===========================
  // ✅ DONACIÓN: cargar postulaciones
  // ===========================
  useEffect(() => {
    if (!isOpen) return;
    if (!articuloId) return;
    if (isVenta) return;

    let alive = true;

    const fetchPostulados = async () => {
      setLoading(true);
      setErrorMsg("");

      const { data, error } = await supabase
        .from("postulaciones")
        .select("id, justificacion, usuario_id, created_at, usuarios(nombre, foto_url)")
        .eq("articulo_id", articuloId)
        .order("created_at", { ascending: false });

      if (!alive) return;

      if (error) {
        setErrorMsg(error.message || "No se pudieron cargar los postulados.");
        setPostulados([]);
      } else {
        setPostulados(Array.isArray(data) ? data : []);
      }

      setLoading(false);
    };

    fetchPostulados();

    return () => {
      alive = false;
    };
  }, [articuloId, isOpen, isVenta]);

  // ===========================
  // ✅ VENTA: cargar comprador (usuarios_publicos)
  // ===========================
  useEffect(() => {
    if (!isOpen) return;
    if (!isVenta) return;
    if (!buyerId) return;

    let alive = true;

    const fetchBuyer = async () => {
      setBuyerLoading(true);
      setBuyerPublic(null);

      const { data, error } = await supabase
        .from("usuarios_publicos")
        .select("id,nombre,foto_url")
        .eq("id", buyerId)
        .maybeSingle();

      if (!alive) return;

      if (!error && data) setBuyerPublic(data);
      setBuyerLoading(false);
    };

    fetchBuyer();

    return () => {
      alive = false;
    };
  }, [isOpen, isVenta, buyerId]);

  // ===========================
  // ✅ DONACIÓN: cargar ganador (usuarios_publicos) + fallback
  // ===========================
  useEffect(() => {
    if (!isOpen) return;
    if (isVenta) return;

    if (!winnerId) {
      setWinnerPublic(null);
      return;
    }

    let alive = true;

    const fetchWinner = async () => {
      setWinnerLoading(true);
      setWinnerPublic(null);

      // 1) usuarios_publicos
      const { data, error } = await supabase
        .from("usuarios_publicos")
        .select("id,nombre,foto_url")
        .eq("id", winnerId)
        .maybeSingle();

      if (!alive) return;

      if (!error && data) {
        setWinnerPublic(data);
        setWinnerLoading(false);
        return;
      }

      // 2) fallback usuarios
      try {
        const { data: data2, error: error2 } = await supabase
          .from("usuarios")
          .select("id,nombre,foto_url")
          .eq("id", winnerId)
          .maybeSingle();

        if (!alive) return;
        if (!error2 && data2) setWinnerPublic(data2);
      } catch {
        // ignore
      }

      setWinnerLoading(false);
    };

    fetchWinner();

    return () => {
      alive = false;
    };
  }, [isOpen, isVenta, winnerId]);

  if (!isOpen) return null;

  // ===========================
  // ✅ DONACIÓN: elegir ganador
  // ===========================
  const elegirGanador = async (postulado) => {
    if (!articuloId) return;

    const ganadorId = postulado?.usuario_id;
    if (!ganadorId) {
      alert("No se pudo identificar el usuario ganador.");
      return;
    }

    const ok = confirm("¿Elegir a este usuario? Se eliminarán las solicitudes de los demás.");
    if (!ok) return;

    try {
      setSavingWinner(true);

      // ✅ set inmediato en UI
      setWinnerIdLocal(ganadorId);

      const nombreLocal = postulado?.usuarios?.nombre || "Ganador";
      const fotoLocal = postulado?.usuarios?.foto_url || "";
      setWinnerDisplayLocal({ nombre: nombreLocal, foto_url: fotoLocal });

      // 1) Guardar ganador + pasar a reservado
      const { error: upErr } = await safeUpdateArticulos(articuloId, {
        ganador_id: ganadorId,
        estado: "reservado",
        status: "reservado",
      });

      if (upErr) throw upErr;

      // 2) Borrar postulaciones de los demás
      const { error: delErr } = await supabase
        .from("postulaciones")
        .delete()
        .eq("articulo_id", articuloId)
        .neq("usuario_id", ganadorId);

      if (delErr) {
        console.log("No se pudieron borrar postulaciones de otros (RLS?):", delErr);
      }

      // 3) refrescar local: solo queda el ganador
      setPostulados((prev) =>
        (Array.isArray(prev) ? prev : []).filter((p) => String(p?.usuario_id) === String(ganadorId))
      );

      // 4) refrescar afuera
      if (typeof onCancelSaleSuccess === "function") {
        await onCancelSaleSuccess();
      }

      alert("✅ Seleccionado. El artículo quedó reservado.");
      // ✅ NO cerramos el modal: ahora dejamos botón para abrir chat cuando quieras
    } catch (e) {
      console.error(e);
      alert("No se pudo seleccionar: " + (e?.message || "Error"));
      // si falló, revertimos winner local para no engañar la UI
      setWinnerIdLocal(null);
      setWinnerDisplayLocal(null);
    } finally {
      setSavingWinner(false);
    }
  };

  // ===========================
  // ✅ Marcar como ENTREGADO (VENTA o DONACIÓN)
  // ===========================
  const marcarEntregado = async () => {
    if (!articuloId) return;

    const ok = confirm("¿Marcar como ENTREGADO? Esto cerrará la transacción.");
    if (!ok) return;

    try {
      setSavingWinner(true);

      const nowISO = new Date().toISOString();

      const { error: upErr } = await safeUpdateArticulos(articuloId, {
        estado: "entregado",
        status: "entregado",
        delivered_at: nowISO, // si no existe, safeUpdate lo quita
      });

      if (upErr) throw upErr;

      // cerrar chats del artículo (si existen)
      try {
        await supabase.from("chats").update({ status: "closed" }).eq("articulo_id", articuloId);
      } catch (e) {
        console.log("Cerrar chats (opcional) no pudo ejecutarse:", e?.message || e);
      }

      alert("✅ Marcado como ENTREGADO. Transacción cerrada.");

      if (typeof onCancelSaleSuccess === "function") {
        await onCancelSaleSuccess();
      }

      onClose?.();
    } catch (e) {
      console.error(e);
      alert("No se pudo marcar como entregado: " + (e?.message || "Error"));
    } finally {
      setSavingWinner(false);
    }
  };

  // ===========================
  // ✅ DONACIÓN: cancelar entrega (volver a disponible)
  // ===========================
  const cancelarEntrega = async () => {
    if (!articuloId) return;

    const ok = confirm("¿Cancelar entrega? El artículo volverá a estar disponible.");
    if (!ok) return;

    try {
      setSavingWinner(true);

      const { error: upErr } = await safeUpdateArticulos(articuloId, {
        ganador_id: null,
        estado: "disponible",
        status: "disponible",
      });

      if (upErr) throw upErr;

      // limpiar local
      setWinnerIdLocal(null);
      setWinnerPublic(null);
      setWinnerDisplayLocal(null);

      alert("✅ Entrega cancelada. El artículo volvió a disponible.");

      if (typeof onCancelSaleSuccess === "function") {
        await onCancelSaleSuccess();
      }

      onClose?.();
    } catch (e) {
      console.error(e);
      alert("No se pudo cancelar la entrega: " + (e?.message || "Error"));
    } finally {
      setSavingWinner(false);
    }
  };

  // ===========================
  // ✅ VENTA: abrir chat
  // ===========================
  const handleOpenChatVenta = () => {
    if (typeof onOpenChat === "function") {
      onOpenChat({ article, buyerId });
      return;
    }
    alert("Aún no está conectada la vista de chat.");
  };

  // ===========================
  // ✅ DONACIÓN: abrir chat con ganador
  // - OJO: si está ENTREGADO, tu App.jsx bloquea el chat para donación entregada
  // ===========================
  const handleOpenChatDonacion = () => {
    if (!winnerId) return alert("No hay ganador seleccionado.");
    if (isEntregado) return alert("Esta publicación ya fue marcada como ENTREGADA. El chat está cerrado.");

    if (typeof onOpenChat === "function") {
      // ✅ App.jsx espera { article, buyerId }
      onOpenChat({
        article: { ...article, ganador_id: winnerId, estado: "reservado", status: "reservado" },
        buyerId: winnerId,
      });
      return;
    }

    alert("Aún no está conectada la vista de chat.");
  };

  // ===========================
  // ✅ VENTA: CANCELAR
  // ===========================
  const internalCancelSale = async () => {
    if (!articuloId) return;

    try {
      const { error: err1 } = await safeUpdateArticulos(articuloId, {
        estado: "disponible",
        status: "disponible",
        buyer_id: null,
        reserved_at: null,
      });

      if (err1) throw err1;

      try {
        await supabase.from("chats").update({ status: "closed" }).eq("articulo_id", articuloId);
      } catch (e) {
        console.log("Cerrar chats (opcional) no pudo ejecutarse:", e?.message || e);
      }

      alert("Venta cancelada. El artículo volvió a estar disponible ✅");

      if (typeof onCancelSaleSuccess === "function") {
        await onCancelSaleSuccess();
      }

      onClose?.();
    } catch (e) {
      console.error(e);
      alert("No se pudo cancelar la venta: " + (e?.message || "Error"));
    }
  };

  const handleCancelSale = async () => {
    if (typeof onCancelSale === "function") {
      try {
        await onCancelSale(articuloId);
        if (typeof onCancelSaleSuccess === "function") await onCancelSaleSuccess();
        onClose?.();
      } catch (e) {
        alert("No se pudo cancelar la venta: " + (e?.message || "Error"));
      }
      return;
    }
    await internalCancelSale();
  };

  const titulo = article?.titulo || article?.title || "Sin título";

  // ✅ ganador visible: prioridad winnerPublic, luego winnerDisplayLocal
  const winnerVisible = winnerPublic || winnerDisplayLocal || null;
  const winnerNombre = winnerVisible?.nombre || "Ganador";
  const winnerFoto = winnerVisible?.foto_url || "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl">
        <div className="flex items-center gap-4 mb-6">
          <img
            src={getThumb(article)}
            onError={(e) => {
              if (e.currentTarget.dataset.fallbackApplied) return;
              e.currentTarget.dataset.fallbackApplied = "1";
              e.currentTarget.src = FALLBACK_SVG;
            }}
            className="w-12 h-12 rounded-xl object-cover"
            alt="mini"
          />
          <div className="min-w-0">
            <h2 className="font-black uppercase text-sm truncate">{titulo}</h2>
            <p className="text-[10px] font-bold uppercase text-gray-400 mt-1">
              {tipoNorm || "tipo"} · {estado || "estado"}
            </p>
          </div>
        </div>

        {/* =========================
            ✅ CASO VENTA
           ========================= */}
        {isVenta ? (
          <div>
            {isEntregado ? (
              <div className="space-y-3">
                <div className="bg-gray-100 border border-gray-200 rounded-2xl p-4">
                  <p className="text-sm font-black text-gray-800 uppercase">Entregado ✅</p>
                  <p className="text-xs text-gray-600 mt-1">
                    Esta venta ya está cerrada. En la lista solo quedará disponible “Eliminar”.
                  </p>
                </div>

                {buyerId ? (
                  <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                    <p className="text-[10px] font-black uppercase text-gray-400 mb-2">Comprador</p>

                    {buyerLoading ? (
                      <p className="text-xs text-gray-400 font-bold">Cargando comprador...</p>
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full overflow-hidden bg-white border border-gray-200 shrink-0 flex items-center justify-center">
                          {buyerPublic?.foto_url ? (
                            <img
                              src={buyerPublic.foto_url}
                              alt={buyerPublic?.nombre || "Comprador"}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          ) : (
                            <span className="font-black text-gray-500">
                              {(buyerPublic?.nombre?.[0] || "C").toUpperCase()}
                            </span>
                          )}
                        </div>

                        <div className="min-w-0">
                          <p className="text-sm font-black text-gray-800 truncate">
                            {buyerPublic?.nombre || "Comprador"}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}

                <button
                  onClick={onClose}
                  className="mt-2 w-full text-gray-400 font-bold text-xs uppercase"
                  type="button"
                >
                  Cerrar
                </button>
              </div>
            ) : !isReservado ? (
              <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
                <p className="text-sm font-bold text-gray-700">Este artículo aún no está reservado.</p>
                <p className="text-xs text-gray-500 mt-1">
                  Cuando alguien lo reserve, aquí podrás abrir el chat, marcar entregado o cancelar la venta.
                </p>

                <button
                  onClick={onClose}
                  className="mt-6 w-full text-gray-400 font-bold text-xs uppercase"
                  type="button"
                >
                  Cerrar
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-green-50 border border-green-100 rounded-2xl p-4">
                  <p className="text-sm font-black text-green-800 uppercase">Reserva activa ✅</p>
                  <p className="text-xs text-green-700 mt-1">
                    Ya hay un comprador. Puedes chatear, marcar como entregado o cancelar si no hubo acuerdo.
                  </p>
                </div>

                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                  <p className="text-[10px] font-black uppercase text-gray-400 mb-2">Comprador</p>

                  {buyerLoading ? (
                    <p className="text-xs text-gray-400 font-bold">Cargando comprador...</p>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-white border border-gray-200 shrink-0 flex items-center justify-center">
                        {buyerPublic?.foto_url ? (
                          <img
                            src={buyerPublic.foto_url}
                            alt={buyerPublic?.nombre || "Comprador"}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        ) : (
                          <span className="font-black text-gray-500">
                            {(buyerPublic?.nombre?.[0] || "C").toUpperCase()}
                          </span>
                        )}
                      </div>

                      <div className="min-w-0">
                        <p className="text-sm font-black text-gray-800 truncate">
                          {buyerPublic?.nombre || "Comprador"}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={handleOpenChatVenta}
                  className="w-full bg-forest-green text-white text-[10px] font-black p-3 rounded-2xl uppercase"
                  type="button"
                >
                  Abrir chat con comprador
                </button>

                <button
                  onClick={marcarEntregado}
                  disabled={savingWinner}
                  className="w-full bg-gray-900 text-white text-[10px] font-black p-3 rounded-2xl uppercase disabled:opacity-50"
                  type="button"
                >
                  {savingWinner ? "Guardando..." : "Entregado (cerrar venta)"}
                </button>

                <button
                  onClick={handleCancelSale}
                  className="w-full bg-red-600 text-white text-[10px] font-black p-3 rounded-2xl uppercase"
                  type="button"
                  disabled={savingWinner}
                >
                  Cancelar venta (volver a disponible)
                </button>

                <button
                  onClick={onClose}
                  className="mt-2 w-full text-gray-400 font-bold text-xs uppercase"
                  type="button"
                >
                  Cerrar
                </button>
              </div>
            )}
          </div>
        ) : (
          /* =========================
             ✅ CASO DONACIÓN
             ========================= */
          <div>
            {errorMsg ? (
              <div className="bg-red-50 border border-red-100 text-red-700 text-xs font-bold p-3 rounded-2xl mb-4">
                {errorMsg}
              </div>
            ) : null}

            {winnerId ? (
              <div className="space-y-3">
                <div className="bg-green-50 border border-green-100 rounded-2xl p-4">
                  <p className="text-sm font-black text-green-800 uppercase">
                    {isEntregado ? "Entregado ✅" : "Seleccionado ✅"}
                  </p>
                  <p className="text-xs text-green-700 mt-1">
                    {isEntregado
                      ? "Transacción cerrada. En la lista quedará solo “Eliminar”."
                      : "Este artículo quedó reservado para entrega. Los demás ya no deben verlo."}
                  </p>
                </div>

                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                  <p className="text-[10px] font-black uppercase text-gray-400 mb-2">Ganador</p>

                  {winnerLoading && !winnerVisible ? (
                    <p className="text-xs text-gray-400 font-bold">Cargando ganador...</p>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-white border border-gray-200 shrink-0 flex items-center justify-center">
                        {winnerFoto ? (
                          <img
                            src={winnerFoto}
                            alt={winnerNombre}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        ) : (
                          <span className="font-black text-gray-500">
                            {String(winnerNombre || "G").charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>

                      <div className="min-w-0">
                        <p className="text-sm font-black text-gray-800 truncate">{winnerNombre}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* ✅ BOTÓN CHAT GANADOR */}
                <button
                  onClick={handleOpenChatDonacion}
                  disabled={savingWinner || isEntregado}
                  className={`w-full text-[10px] font-black p-3 rounded-2xl uppercase disabled:opacity-50 ${
                    isEntregado ? "bg-gray-200 text-gray-500" : "bg-forest-green text-white"
                  }`}
                  type="button"
                  title={isEntregado ? "Chat cerrado por entrega" : "Abrir chat con el ganador"}
                >
                  {isEntregado ? "Chat cerrado (entregado)" : "Abrir chat con ganador"}
                </button>

                {isEntregado ? null : (
                  <button
                    onClick={marcarEntregado}
                    disabled={savingWinner}
                    className="w-full bg-gray-900 text-white text-[10px] font-black p-3 rounded-2xl uppercase disabled:opacity-50"
                    type="button"
                  >
                    {savingWinner ? "Guardando..." : "Entregado (cerrar)"}
                  </button>
                )}

                {isEntregado ? null : (
                  <button
                    onClick={cancelarEntrega}
                    disabled={savingWinner}
                    className="w-full bg-red-600 text-white text-[10px] font-black p-3 rounded-2xl uppercase disabled:opacity-50"
                    type="button"
                  >
                    {savingWinner ? "Cancelando..." : "Cancelar entrega (volver a disponible)"}
                  </button>
                )}

                <button
                  onClick={onClose}
                  className="mt-2 w-full text-gray-400 font-bold text-xs uppercase"
                  type="button"
                >
                  Cerrar
                </button>
              </div>
            ) : (
              <div className="space-y-4 max-h-60 overflow-y-auto">
                {loading ? (
                  <p className="text-gray-400 text-center py-4 font-bold">Cargando postulaciones...</p>
                ) : postulados.length === 0 ? (
                  <p className="text-gray-400 text-center py-4">Nadie se ha postulado todavía...</p>
                ) : (
                  postulados.map((p) => {
                    const nombre = p?.usuarios?.nombre || "Usuario";
                    const foto = p?.usuarios?.foto_url || FALLBACK_SVG;

                    return (
                      <div key={p.id} className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                        <div className="flex items-center gap-3 mb-2">
                          <img
                            src={foto}
                            className="w-8 h-8 rounded-full object-cover"
                            alt="avatar"
                            onError={(e) => {
                              if (e.currentTarget.dataset.fallbackApplied) return;
                              e.currentTarget.dataset.fallbackApplied = "1";
                              e.currentTarget.src = FALLBACK_SVG;
                            }}
                          />
                          <span className="font-bold text-sm">{nombre}</span>
                        </div>

                        {p?.justificacion ? (
                          <p className="text-xs text-gray-600 italic">"{p.justificacion}"</p>
                        ) : (
                          <p className="text-xs text-gray-400 italic">Sin justificación.</p>
                        )}

                        <button
                          disabled={savingWinner}
                          onClick={() => elegirGanador(p)}
                          className="mt-3 w-full bg-forest-green text-white text-[10px] font-black p-2 rounded-xl uppercase disabled:opacity-50"
                          type="button"
                        >
                          {savingWinner ? "Seleccionando..." : "Elegir a este usuario"}
                        </button>
                      </div>
                    );
                  })
                )}

                <button
                  onClick={onClose}
                  disabled={savingWinner}
                  className="mt-2 w-full text-gray-400 font-bold text-xs uppercase disabled:opacity-50"
                  type="button"
                >
                  Cerrar
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
