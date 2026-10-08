// src/components/ManageArticleModal.jsx
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { X, Users } from 'lucide-react';
import ApplicantRow from './ApplicantRow.jsx';
import { isSaleApproved } from './articleState.js';
import { supabase } from "../supabase/supabaseClient";
import { transitionSale } from "../supabase/saleTransaction";

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

  let { error } = await supabase.from("articulos").update(payload).eq("id", articleId).select("id").single();

  if (error?.message && /Could not find the '(.+?)' column/i.test(error.message)) {
    const m = error.message.match(/Could not find the '(.+?)' column/i);
    const missing = m?.[1];

    if (missing && Object.prototype.hasOwnProperty.call(payload, missing)) {
      delete payload[missing];
      ({ error } = await supabase.from("articulos").update(payload).eq("id", articleId).select("id").single());
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
  const titleId = useId();
  const dialogRef = useRef(null);
  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isOpen]);
  const [postulados, setPostulados] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingWinner, setSavingWinner] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // ✅ DONACIÓN (ganador)
  const [winnerLoading, setWinnerLoading] = useState(false);
  const [winnerPublic, setWinnerPublic] = useState(null);

  // ✅ mantener winner local para que NO dependa de article actualizado
  const [winnerIdLocal, setWinnerIdLocal] = useState(null);
  const [winnerDisplayLocal, setWinnerDisplayLocal] = useState(null); // { nombre, foto_url }

  const articuloId = useMemo(() => {
    return article?.id || article?.articulo_id || article?.uuid || null;
  }, [article?.id, article?.articulo_id, article?.uuid]);

  const tipoNorm = normTipo(article?.mode || article?.tipo || article?.tipo_publicacion || "donacion");
  const estado = normEstado(article?.estado || article?.status || "");

  const isVenta = tipoNorm === "venta";
  const isReservado = estado === "reservado";
  const isEntregado = estado === "entregado";

  const buyerId = article?.buyer_id || article?.buyerId || null;

  const winnerIdFromArticle =
    article?.ganador_id || article?.winner_id || article?.winnerUid || article?.recipient_id || null;

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

      // 3) refrescar local: solo queda el ganador
      setPostulados((prev) =>
        (Array.isArray(prev) ? prev : []).filter((p) => String(p?.usuario_id) === String(ganadorId))
      );

      // 4) refrescar afuera
      if (typeof onCancelSaleSuccess === "function") {
        await onCancelSaleSuccess();
      }

      await onOpenChat?.({ article: { ...article, ganador_id: ganadorId, estado: "reservado", status: "reservado" }, buyerId: ganadorId });
    } catch (e) {
      console.error(e);
      alert("No se pudo seleccionar: " + (e?.message || "Error"));
      setWinnerIdLocal(null);
      setWinnerDisplayLocal(null);
    } finally {
      setSavingWinner(false);
    }
  };

  // ✅ Rechazar UNA solicitud (borra postulacion)
  const rechazarSolicitud = async (postulacionId) => {
    if (!postulacionId) return;
    const ok = confirm("¿Rechazar esta solicitud?");
    if (!ok) return;

    try {
      setSavingWinner(true);
      const { error } = await supabase.from("postulaciones").delete().eq("id", postulacionId);
      if (error) throw error;

      setPostulados((prev) =>
        (Array.isArray(prev) ? prev : []).filter((x) => String(x?.id) !== String(postulacionId))
      );
    } catch (e) {
      console.error(e);
      alert("No se pudo rechazar: " + (e?.message || "Error (RLS/policies)"));
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

      let deliveredArticle;
      if (isVenta) {
        ({ article: deliveredArticle } = await transitionSale(supabase, articuloId, "deliver"));
      } else {
        const { error: upErr } = await safeUpdateArticulos(articuloId, {
          estado: "entregado",
          status: "entregado",
          delivered_at: nowISO,
        });
        if (upErr) throw upErr;
      }

      alert("✅ Marcado como ENTREGADO. El chat queda disponible para ver historial (solo lectura).");

      if (typeof onCancelSaleSuccess === "function") {
        await onCancelSaleSuccess(deliveredArticle);
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
  // ✅ (permitido incluso si ENTREGADO para ver historial)
  // ===========================
  const handleOpenChatDonacion = () => {
    if (!winnerId) return alert("No hay ganador seleccionado.");

    if (typeof onOpenChat === "function") {
      onOpenChat({
        article: {
          ...article,
          ganador_id: winnerId,
          estado: isEntregado ? "entregado" : "reservado",
          status: isEntregado ? "entregado" : "reservado",
        },
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
      const { article: updatedArticle } = await transitionSale(supabase, articuloId, "cancel");

      alert("Venta cancelada. El artículo volvió a estar disponible ✅");

      if (typeof onCancelSaleSuccess === "function") {
        await onCancelSaleSuccess(updatedArticle);
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
        const updatedArticle = await onCancelSale(articuloId);
        if (typeof onCancelSaleSuccess === "function") await onCancelSaleSuccess(updatedArticle);
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
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        onKeyDown={e => {
          if (e.key === 'Escape' && !savingWinner) onClose?.();
          if (e.key !== 'Tab') return;
          const controls = [...e.currentTarget.querySelectorAll('button:not(:disabled), [href], input, [tabindex="0"]')];
          const first = controls[0];
          const last = controls.at(-1);
          if (e.shiftKey && (document.activeElement === first || document.activeElement === e.currentTarget)) { e.preventDefault(); last?.focus(); }
          else if (!e.shiftKey && (document.activeElement === last || document.activeElement === e.currentTarget)) { e.preventDefault(); first?.focus(); }
        }}
        className="flex max-h-[min(760px,calc(100dvh-32px))] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl outline-none">
        {/* HEADER */}
        <div className="shrink-0 p-4 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              {!isVenta ? (
                <p className="mb-3 text-xs font-semibold text-gray-500">
                  POSTULACIONES
                </p>
              ) : (
                <p className="mb-3 text-xs font-semibold text-gray-500">
                  GESTIÓN
                </p>
              )}

              <div className="flex items-center gap-4">
                <img
                  src={getThumb(article)}
                  onError={(e) => {
                    if (e.currentTarget.dataset.fallbackApplied) return;
                    e.currentTarget.dataset.fallbackApplied = "1";
                    e.currentTarget.src = FALLBACK_SVG;
                  }}
                  className="h-14 w-14 shrink-0 rounded-md border border-gray-100 object-cover"
                  alt={titulo}
                />

                <div className="min-w-0">
                  <h2 id={titleId} className="break-words text-lg font-bold leading-6 text-gray-900">{titulo}</h2>
                  <p className="mt-1 text-xs text-gray-500">
                    {isVenta ? 'Venta' : 'Donación'} · {estado}
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={savingWinner}
              aria-label={isVenta ? 'Cerrar gestión' : 'Cerrar postulaciones'}
              title="Cerrar"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-gray-500 transition hover:bg-gray-100 disabled:opacity-40"
            >
              <X size={20} />
            </button>
          </div>
          {!isVenta && !winnerId && <div className="mt-4 flex items-center gap-2 border-t border-gray-100 pt-3 text-sm font-medium text-gray-700" aria-live="polite"><Users size={16} className="text-gray-400" />{loading ? 'Cargando postulaciones...' : `${postulados.length} ${postulados.length === 1 ? 'postulación' : 'postulaciones'}`}<span className="ml-auto text-xs font-normal text-gray-400">Más recientes primero</span></div>}
        </div>

        <div className="border-t border-gray-200" />

        {/* BODY */}
        <div className={`min-h-0 overflow-y-auto overscroll-contain ${!isVenta && !winnerId ? '' : 'p-4 sm:p-6'}`} data-management-body>
          {isVenta ? (
            <div>
              {buyerId && (isReservado || isEntregado) && (
                <div className="mb-4 flex items-center gap-3 border-b border-gray-100 pb-4">
                  {article.buyer_public?.foto_url ? (
                    <img src={article.buyer_public.foto_url} alt="Foto del comprador" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 font-bold text-gray-600">
                      {(article.buyer_public?.nombre || "C").charAt(0)}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500">{isEntregado ? "Comprado por" : "Reservado por"}</p>
                    <p className="truncate text-sm font-bold text-gray-800">{article.buyer_public?.nombre || "Comprador"}</p>
                  </div>
                </div>
              )}
              {isEntregado ? (
                <div className="space-y-3">
                  <div className="border-l-2 border-gray-300 bg-gray-50 p-3">
                    <p className="text-sm font-semibold text-gray-800">Venta completada</p>
                    <p className="text-xs text-gray-600 mt-1">
                      Esta venta ya está cerrada. El chat debe abrir solo para ver historial (solo lectura).
                    </p>
                  </div>

                  <button
                    onClick={handleOpenChatVenta}
                    className="w-full rounded-md bg-forest-green py-2.5 text-sm font-semibold text-white"
                    type="button"
                  >
                    Abrir chat (ver historial)
                  </button>
                </div>
              ) : !isReservado ? (
                <div className="border-l-2 border-gray-200 bg-gray-50 p-3">
                  <p className="text-sm font-bold text-gray-700">Este artículo aún no está reservado.</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Cuando alguien lo reserve, aquí podrás abrir el chat, marcar entregado o cancelar la venta.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="border-l-2 border-forest-green bg-green-50 p-3">
                    <p className="text-sm font-semibold text-green-800">Reserva activa</p>
                    <p className="text-xs text-green-700 mt-1">
                      {article.transaction_chat?.status === "pending"
                        ? "Compra pendiente de aprobación. Al abrir el chat, autorizas la conversación con el comprador."
                        : "Ya hay una reserva. Puedes chatear, marcar como entregado o cancelar si no hubo acuerdo."}
                    </p>
                  </div>

                  <button
                    onClick={handleOpenChatVenta}
                    className="w-full rounded-md bg-forest-green py-2.5 text-sm font-semibold text-white"
                    type="button"
                  >
                    Abrir chat
                  </button>

                  <button
                    onClick={marcarEntregado}
                    disabled={savingWinner}
                    className="w-full rounded-md border border-gray-200 py-2.5 text-sm font-semibold text-gray-800 disabled:opacity-50"
                    type="button"
                  >
                    {savingWinner ? "Guardando..." : "Entregado (cerrar venta)"}
                  </button>

                  <button
                    onClick={handleCancelSale}
                    className="w-full rounded-md py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                    type="button"
                    disabled={savingWinner || isSaleApproved(article)}
                    title={isSaleApproved(article) ? "Venta aprobada: finalízala confirmando la entrega" : "Cancelar la solicitud de compra"}
                  >
                    Cancelar venta (volver a disponible)
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div>
              {errorMsg ? (
                <div className="bg-red-50 border border-red-100 text-red-700 text-xs font-bold p-3 rounded-2xl mb-4">
                  {errorMsg}
                </div>
              ) : null}

              {winnerId ? (
                <div>
                  <div className="bg-green-50 border border-green-100 rounded-2xl p-4">
                    <p className="text-sm font-black text-green-800 uppercase">
                      {isEntregado ? "Entregado ✅" : "Seleccionado ✅"}
                    </p>
                    <p className="text-xs text-green-700 mt-1">
                      {isEntregado
                        ? "Transacción cerrada. El chat debe abrir para ver historial (solo lectura)."
                        : "Este artículo quedó reservado para entrega. Los demás ya no deben verlo."}
                    </p>
                  </div>

                  <div className="p-4 bg-white rounded-3xl border border-gray-100">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-50 border border-gray-200 shrink-0 flex items-center justify-center">
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
                        <p className="text-sm font-black text-gray-900 truncate">{winnerLoading && !winnerVisible ? 'Cargando usuario...' : winnerNombre}</p>
                        <p className="text-[11px] font-bold text-gray-500">Ganador</p>
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
                      <button
                        onClick={handleOpenChatDonacion}
                        disabled={savingWinner}
                        className="w-full bg-forest-green text-white text-[11px] font-black py-3 rounded-2xl uppercase disabled:opacity-50"
                        type="button"
                        title={isEntregado ? "Ver historial (solo lectura)" : "Abrir chat con el ganador"}
                      >
                        {isEntregado ? "Abrir chat (ver historial)" : "Abrir chat con ganador"}
                      </button>

                      {isEntregado ? null : (
                        <button
                          onClick={marcarEntregado}
                          disabled={savingWinner}
                          className="w-full bg-gray-900 text-white text-[11px] font-black py-3 rounded-2xl uppercase disabled:opacity-50"
                          type="button"
                        >
                          {savingWinner ? "Guardando..." : "Entregado (cerrar)"}
                        </button>
                      )}

                      {isEntregado ? null : (
                        <button
                          onClick={cancelarEntrega}
                          disabled={savingWinner}
                          className="w-full bg-red-600 text-white text-[11px] font-black py-3 rounded-2xl uppercase disabled:opacity-50"
                          type="button"
                        >
                          {savingWinner ? "Cancelando..." : "Cancelar entrega (volver a disponible)"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {loading ? (
                    <p className="text-gray-400 text-center py-6 font-bold">Cargando postulaciones...</p>
                  ) : postulados.length === 0 ? (
                    <p className="text-gray-400 text-center py-6 font-bold">Nadie se ha postulado todavía...</p>
                  ) : (
                    <ul className="divide-y divide-gray-100" aria-label="Personas postuladas" aria-busy={savingWinner}>
                      {postulados.map((p) => {
                        return (
                          <ApplicantRow key={p.id} applicant={p} busy={savingWinner} onChoose={elegirGanador} onReject={rechazarSolicitud} />
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
