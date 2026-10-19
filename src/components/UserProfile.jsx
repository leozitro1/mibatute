// src/components/UserProfile.jsx
import { createReadCache, listenMarketSignals } from "./marketSignals.js";
import { useEffect, useId, useMemo, useRef, useState, useCallback } from "react";
import { getProfile, updateProfile } from "../supabase/profileService";
import { notifyCreditBalance } from './creditBalance.js';
import { accountCreditStatus } from '../supabase/donationApplications.js';
import './UserProfile.css';
import './TransactionActions.css';
import WompiTopupDialog from './WompiTopupDialog.jsx';
import SupportInbox from './SupportInbox.jsx';
import {LEGAL_OPERATOR} from '../legal/config.js';
import {
  Camera,
  ArrowLeft,
  Package,
  ChevronDown,
  CircleDollarSign,
  LockKeyhole,
  Loader2,
  Pencil,
  Trash2, Pause, Play,
  MessageCircle,
  MessageSquare,
  CheckCircle2,
  Clock,
  BadgeCheck,
  Gift,
  ShoppingBag,
  Repeat2,
  RefreshCw,
  Bell,
  AlertTriangle,
  Eye,
  X,
  XCircle,
  Inbox,
  Star,
  Users,
} from "lucide-react";
import { LOCATIONS } from "../data/locations";
import ManageArticleModal from "./ManageArticleModal";
import ApplicantRow from './ApplicantRow.jsx';
import ProfileListFilters from "./ProfileListFilters";
import RescueLimits from './RescueLimits.jsx';
import ProfileRatingAction from './ProfileRatingAction.jsx';
import PublicationCountdown from './PublicationCountdown.jsx';
import usePublicationClock from './usePublicationClock.js';
import { isPublicationUnavailable } from './articleLifetime.js';
import ProfilePagination from "./ProfilePagination";
import { paginateProfileItems } from "./profilePageData";
import { DEFAULT_PROFILE_FILTERS, filterProfileItems, canRateProfileArticle } from "./profileFilters";

// ✅ IMPORT CORRECTO
import {
  obtenerPostulaciones,
  eliminarSolicitudCompradorYChat,
} from "../supabase/solicitudesService";

// ✅ servicio para Mis Rescates
import { obtenerMisRescates } from "../supabase/rescatesService";
import { canOpenRescateChat, isRescateVisible, saleCancellation, isRescateSaleLocked, donationRejection } from "../supabase/rescatesQuery";
import { transitionSale } from "../supabase/saleTransaction";
import { isSaleArticle } from "../supabase/articleContext";
import { preferLatestArticle, articleHistoryExpiresAt } from "./articleState";

// ✅ para cancelar postulación directamente + actualizar entrega
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

function formatMoney(value) {
  try {
    const n = Number(value);
    if (!isFinite(n)) return String(value ?? "");
    return n.toLocaleString("es-CO", { style: "currency", currency: "COP" });
  } catch {
    return String(value ?? "");
  }
}

function getThumb(item) {
  if (
    typeof item?.imagen_url_principal === "string" &&
    item.imagen_url_principal.trim()
  )
    return item.imagen_url_principal;

  if (typeof item?.image_url === "string" && item.image_url.trim())
    return item.image_url;
  if (typeof item?.imagen_url === "string" && item.imagen_url.trim())
    return item.imagen_url;

  if (Array.isArray(item?.imagenes) && item.imagenes.length) {
    const first = item.imagenes[0];
    if (typeof first === "string" && first.trim()) return first;
  }

  if (Array.isArray(item?.articulo_imagenes) && item.articulo_imagenes.length) {
    const first = item.articulo_imagenes[0];
    if (first?.url && String(first.url).trim()) return String(first.url).trim();
  }

  return FALLBACK_SVG;
}

function getArticuloId(art) {
  return art?.id || art?.articulo_id || art?.uuid || art?.product_id || null;
}

function normEstado(v) {
  const s = String(v || "").toLowerCase().trim();

  if (s === "available") return "disponible";
  if (s === "reserved") return "reservado";
  if (s === "delivered") return "entregado";

  if (s === "reviewing") return "en_revision";
  if (s === "en_revision") return "en_revision";
  if (s === "en revisión") return "en_revision";
  if (s === "en revision") return "en_revision";

  return s || "disponible";
}

function isArticuloEnRevision(art) {
  const estado = normEstado(art?.estado || art?.status || "");
  return estado === "en_revision";
}

function revisionBlockMsg(titulo = "este artículo") {
  return (
    `⛔ "${titulo}" está EN REVISIÓN por moderación.\n\n` +
    `Mientras esté en revisión:\n` +
    `- No puedes abrir solicitudes\n` +
    `- No puedes abrir chat\n` +
    `- No puedes editar\n\n` +
    `Cuando el admin descarte o resuelva, se desbloquea.`
  );
}

function blockedUserMsg() {
  return (
    "⛔ Tu cuenta está BLOQUEADA.\n\n" +
    "No puedes abrir chats, postularte, editar ni gestionar publicaciones.\n" +
    "Si crees que es un error, contacta al administrador."
  );
}

function isVentaArticulo(art) {
  return isSaleArticle(art);
}

/**
 * ✅ update a prueba de columnas faltantes
 * ✅ intenta owner_id y si no existe, cae a usuario_id
 */
async function safeUpdateArticulos(articleId, patch, ownerId) {
  let payload = { ...(patch || {}) };

  const runUpdate = async (ownerColumn) => {
    let q = supabase.from("articulos").update(payload).eq("id", articleId);
    if (ownerId && ownerColumn) q = q.eq(ownerColumn, ownerId);
    return await q.select("*").single();
  };

  let { data, error } = await runUpdate("owner_id");

  if (error?.message && /Could not find the 'owner_id' column/i.test(error.message)) {
    ({ data, error } = await runUpdate("usuario_id"));
  }

  if (error?.message && /Could not find the '(.+?)' column/i.test(error.message)) {
    const m = error.message.match(/Could not find the '(.+?)' column/i);
    const missing = m?.[1];
    if (missing && Object.prototype.hasOwnProperty.call(payload, missing)) {
      delete payload[missing];

      ({ data, error } = await runUpdate("owner_id"));

      if (
        error?.message &&
        /Could not find the 'owner_id' column/i.test(error.message)
      ) {
        ({ data, error } = await runUpdate("usuario_id"));
      }
    }
  }

  return { data, error };
}

function getTipoPublicacion(art) {
  const raw =
    art?.mode ||
    art?.tipo_publicacion ||
    art?.tipo ||
    art?.tipo_articulo ||
    art?.tipo_publicación ||
    art?.publication_type ||
    art?.type ||
    art?.modo ||
    art?.modalidad ||
    "";

  const t = String(raw || "").trim();
  return t || "Sin tipo";
}

function badgeUIByStatus(value = "") {
  const s = normEstado(value);

  if (s === "en_revision") {
    return {
      Icon: AlertTriangle,
      label: "En revisión",
      cls: "bg-yellow-100 text-yellow-900 ring-1 ring-yellow-200",
    };
  }

  if (s === "disponible") {
    return {
      Icon: CheckCircle2,
      label: "Disponible",
      cls: "bg-forest-green/15 text-forest-green ring-1 ring-forest-green/20",
    };
  }
  if (s === "reservado") {
    return {
      Icon: Clock,
      label: "Reservado",
      cls: "bg-orange-100 text-orange-700 ring-1 ring-orange-200",
    };
  }
  if (s === "entregado") {
    return {
      Icon: BadgeCheck,
      label: "Entregado",
      cls: "bg-gray-200 text-gray-700 ring-1 ring-gray-300",
    };
  }

  return {
    Icon: CheckCircle2,
    label: String(s || "Disponible"),
    cls: "bg-gray-100 text-gray-600 ring-1 ring-gray-200",
  };
}

function badgeUIByTipo(value = "") {
  const s = String(value || "").toLowerCase();

  if (s.includes("don") || s.includes("regal")) {
    return {
      Icon: Gift,
      label: "Donación",
      cls: "bg-forest-green/15 text-forest-green ring-1 ring-forest-green/20",
    };
  }
  if (s.includes("venta")) {
    return {
      Icon: ShoppingBag,
      label: "Venta",
      cls: "bg-forest-green/15 text-forest-green ring-1 ring-forest-green/20",
    };
  }
  if (s.includes("inter")) {
    return {
      Icon: Repeat2,
      label: "Intercambio",
      cls: "bg-forest-green/10 text-forest-green ring-1 ring-forest-green/15",
    };
  }

  return {
    Icon: Repeat2,
    label: String(value || "Sin tipo"),
    cls: "bg-gray-100 text-gray-600 ring-1 ring-gray-200",
  };
}

function getUserFromSolicitud(s) {
  const u =
    s?.usuarios ||
    s?.usuario ||
    s?.perfil ||
    s?.profiles ||
    s?.profile ||
    s?.users ||
    s?.user ||
    null;

  const nombre =
    u?.nombre ??
    u?.full_name ??
    u?.name ??
    u?.display_name ??
    u?.username ??
    s?.nombre ??
    s?.full_name ??
    s?.name ??
    "";

  const foto =
    u?.foto_url ??
    u?.avatar_url ??
    u?.photo_url ??
    u?.picture ??
    s?.foto_url ??
    s?.avatar_url ??
    "";

  const userId = u?.id ?? s?.usuario_id ?? s?.user_id ?? s?.uid ?? "";

  const nombreFinal =
    String(nombre || "").trim() ||
    (userId ? `Usuario ${String(userId).slice(0, 6)}` : "Usuario");

  return {
    nombre: nombreFinal,
    foto: String(foto || "").trim(),
    userId: String(userId || "").trim(),
  };
}

function formatDateTime(value) {
  try {
    const d = value ? new Date(value) : null;
    if (!d || isNaN(d.getTime())) return "";
    return d.toLocaleString("es-CO", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "";
  }
}

/**
 * ✅ Robust helpers para chats: seller_id / owner_id / usuario_id
 */
async function selectChatsForArticuloIds(articuloIds = []) {
  const ids = (Array.isArray(articuloIds) ? articuloIds : [])
    .map(String)
    .filter(Boolean);
  if (!ids.length) return { data: [], error: null, sellerCol: null };

  let res = await supabase
    .from("chats")
    .select("id, articulo_id, buyer_id, seller_id, last_message_at")
    .in("articulo_id", ids);

  if (
    res?.error?.message &&
    /Could not find the 'seller_id' column/i.test(res.error.message)
  ) {
    res = await supabase
      .from("chats")
      .select("id, articulo_id, buyer_id, owner_id, last_message_at")
      .in("articulo_id", ids);

    if (
      res?.error?.message &&
      /Could not find the 'owner_id' column/i.test(res.error.message)
    ) {
      res = await supabase
        .from("chats")
        .select("id, articulo_id, buyer_id, usuario_id, last_message_at")
        .in("articulo_id", ids);

      return {
        data: Array.isArray(res?.data) ? res.data : [],
        error: res?.error || null,
        sellerCol: "usuario_id",
      };
    }

    return {
      data: Array.isArray(res?.data) ? res.data : [],
      error: res?.error || null,
      sellerCol: "owner_id",
    };
  }

  return {
    data: Array.isArray(res?.data) ? res.data : [],
    error: res?.error || null,
    sellerCol: "seller_id",
  };
}

function getSellerIdFromChatRow(row) {
  return row?.seller_id ?? row?.owner_id ?? row?.usuario_id ?? null;
}

function ModalSolicitudes({
  isOpen,
  onClose,
  articulo,
  solicitudes = [],
  loading = false,
  userIdOwner,
  onArticuloUpdated,
  onAfterDecision,
  onOpenChat,
  yaCalifique = new Set(),
  onAbrirCalificar,
}) {
  const [updatingKey, setUpdatingKey] = useState(null);
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

  useEffect(() => {
    setUpdatingKey(null);
  }, [isOpen, articulo?.id]);

  const titulo =
    articulo?.titulo || articulo?.title || getArticuloId(articulo) || "Artículo";
  const articuloId = getArticuloId(articulo);

  const tipoRaw = articulo?.tipo ?? articulo?.mode ?? articulo?.tipo_publicacion ?? "";
  const tipoLower = String(tipoRaw || "").toLowerCase().trim();
  const isVenta = tipoLower === "venta" || tipoLower.includes("venta");

  const ganadorId =
    articulo?.ganador_id ||
    articulo?.winner_id ||
    articulo?.winnerUid ||
    articulo?.recipient_id ||
    null;

  const hasWinner = !!ganadorId;

  const estadoArticulo = normEstado(articulo?.estado || articulo?.status || "disponible");
  const isEntregado = estadoArticulo === "entregado";

  const solicitudesVisibles = useMemo(() => {
    if (!Array.isArray(solicitudes)) return [];
    if (!hasWinner) return solicitudes;

    return solicitudes.filter((s) => {
      const { userId } = getUserFromSolicitud(s);
      return userId && String(userId) === String(ganadorId);
    });
  }, [solicitudes, hasWinner, ganadorId]);

  if (!isOpen) return null;


  const cleanupAllChatsForArticle = async () => {
    if (!articuloId) return;

    try {
      const { data: chats, error: chErr } = await supabase
        .from("chats")
        .select("id")
        .eq("articulo_id", articuloId);

      if (chErr) {
        console.log("Warn list chats(cancel):", chErr);
        return;
      }

      const ids = (chats || []).map((c) => c?.id).filter(Boolean);
      if (!ids.length) return;

      const { error: delMsgErr } = await supabase
        .from("chat_messages")
        .delete()
        .in("chat_id", ids);
      if (delMsgErr) console.log("Warn delete msgs(cancel):", delMsgErr);

      const { error: delChatErr } = await supabase
        .from("chats")
        .delete()
        .in("id", ids);
      if (delChatErr) console.log("Warn delete chats(cancel):", delChatErr);
    } catch (e) {
      console.log("Cleanup cancel catch:", e);
    }
  };

  const entregarAUsuario = async (targetUserId) => {
    if (!articuloId || !targetUserId) return;
    if (!userIdOwner) return;

    const ok = confirm("¿Elegir a este usuario? Se eliminarán las solicitudes de los demás.");
    if (!ok) return;

    const key = `${articuloId}:${targetUserId}`;

    try {
      setUpdatingKey(key);

      const { data, error } = await safeUpdateArticulos(
        articuloId,
        { ganador_id: targetUserId, estado: "reservado", status: "reservado" },
        userIdOwner
      );

      if (error) {
        console.log("Error eligiendo ganador:", error);
        alert("No se pudo seleccionar. Revisa la consola.");
        return;
      }

      onArticuloUpdated?.(data || { ...articulo, ganador_id: targetUserId, estado: "reservado", status: "reservado" });
      onAfterDecision?.();

      onClose?.();
      await onOpenChat?.({ article: data || { ...articulo, ganador_id: targetUserId, estado: "reservado", status: "reservado" }, buyerId: targetUserId });
    } catch (e) {
      console.error(e);
      alert("No se pudo seleccionar. Revisa la consola.");
    } finally {
      setUpdatingKey(null);
    }
  };

  const marcarComoEntregado = async () => {
    if (!articuloId) return;
    if (!userIdOwner) return;

    const ok = confirm(
      "¿Marcar como ENTREGADO?\n\nEl chat seguirá abriendo para ver el historial, pero quedará en solo lectura."
    );
    if (!ok) return;

    try {
      setUpdatingKey(`${articuloId}:deliver`);

      const nowISO = new Date().toISOString();

      const { data, error } = await safeUpdateArticulos(
        articuloId,
        {
          estado: "entregado",
          status: "entregado",
          delivered_at: nowISO,
        },
        userIdOwner
      );

      if (error) {
        console.log("Error marcando como entregado:", error);
        alert("No se pudo marcar como entregado. Revisa la consola.");
        return;
      }

      onArticuloUpdated?.(data || { ...articulo, estado: "entregado", status: "entregado" });
      onAfterDecision?.();

      // Abrir modal de calificación (donación→ganador, venta→comprador)
      const buyerIdLocal = articulo?.buyer_id || articulo?.buyerId || null;
      const reviewTarget = ganadorId || buyerIdLocal;
      if (reviewTarget && !yaCalifique.has(String(articuloId))) {
        setTimeout(() => onAbrirCalificar?.({ reviewedId: reviewTarget, articuloId, rol: "vendedor" }), 400);
      } else {
        alert("✅ Entrega marcada. El chat queda visible (solo lectura).");
      }
      onClose?.();
    } catch (e) {
      console.error(e);
      alert("No se pudo marcar como entregado.");
    } finally {
      setUpdatingKey(null);
    }
  };

  const cancelarEntrega = async () => {
    if (!articuloId) return;
    if (!userIdOwner) return;

    const ok = confirm("¿Cancelar selección/entrega? El artículo volverá a estar disponible.");
    if (!ok) return;

    try {
      setUpdatingKey(`${articuloId}:cancel`);

      const { data, error } = await safeUpdateArticulos(
        articuloId,
        { ganador_id: null, estado: "disponible", status: "disponible" },
        userIdOwner
      );

      if (error) {
        console.log("Error cancelando entrega:", error);
        alert("No se pudo cancelar. Revisa la consola.");
        return;
      }

      await cleanupAllChatsForArticle();

      try {
        const { error: delPostsErr } = await supabase
          .from("postulaciones")
          .delete()
          .eq("articulo_id", articuloId);
        if (delPostsErr) console.log("Warn delete postulaciones(cancel):", delPostsErr);
      } catch (e) {
        console.log("Delete postulaciones(cancel) catch:", e);
      }

      onArticuloUpdated?.(data || { ...articulo, ganador_id: null, estado: "disponible", status: "disponible" });
      onAfterDecision?.();

      alert("✅ Cancelado. El artículo volvió a estar disponible.");
    } catch (e) {
      console.error(e);
      alert("No se pudo cancelar. Revisa la consola.");
    } finally {
      setUpdatingKey(null);
      onClose?.();
    }
  };

  const rechazarSolicitud = async (targetUserId, displayName = "este usuario") => {
    if (!articuloId || !targetUserId) return;
    if (!userIdOwner) return;
    if (hasWinner) return;

    const ok = confirm(
      `¿Rechazar la solicitud de ${displayName}?\n\nSe eliminará su postulación y el chat asociado.`
    );
    if (!ok) return;

    const key = `${articuloId}:${targetUserId}:reject`;

    try {
      setUpdatingKey(key);

      // Borrar postulacion (el owner tiene permiso DELETE)
      const { error: delErr } = await supabase
        .from("postulaciones")
        .delete()
        .eq("articulo_id", articuloId)
        .eq("usuario_id", targetUserId);

      if (delErr) {
        console.log("Error rechazando postulación:", delErr);
        alert("No se pudo rechazar. Revisa la consola (RLS?).");
        return;
      }

      onAfterDecision?.();
    } catch (e) {
      console.error(e);
      alert("No se pudo rechazar. Revisa la consola.");
    } finally {
      setUpdatingKey(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={() => { if (!updatingKey) onClose?.(); }} aria-hidden="true" />

      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        onKeyDown={e => {
          if (e.key === 'Escape' && !updatingKey) onClose?.();
          if (e.key !== 'Tab') return;
          const controls = [...e.currentTarget.querySelectorAll('button:not(:disabled), [href], input, [tabindex="0"]')];
          const first = controls[0];
          const last = controls.at(-1);
          if (e.shiftKey && (document.activeElement === first || document.activeElement === e.currentTarget)) { e.preventDefault(); last?.focus(); }
          else if (!e.shiftKey && (document.activeElement === last || document.activeElement === e.currentTarget)) { e.preventDefault(); first?.focus(); }
        }}
        className="marketplace-surface marketplace-modal relative flex max-h-[min(760px,calc(100dvh-32px))] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-gray-100 bg-white shadow-xl outline-none">
        <div className="shrink-0 border-b border-gray-200 p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="mb-3 text-xs font-semibold text-gray-500">
              Postulaciones
            </p>
            <div className="flex items-center gap-3">
              <img src={getThumb(articulo)} alt={titulo} className="h-14 w-14 shrink-0 rounded-md border border-gray-100 object-cover" onError={e => { if (!e.currentTarget.dataset.fallbackApplied) { e.currentTarget.dataset.fallbackApplied = '1'; e.currentTarget.src = FALLBACK_SVG; } }} />
              <div className="min-w-0"><h3 id={titleId} className="break-words text-lg font-bold leading-6 text-gray-900">{titulo}</h3><p className="mt-1 text-xs text-gray-500">Donación · {estadoArticulo}</p></div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={!!updatingKey}
            aria-label="Cerrar postulaciones"
            title="Cerrar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-40"
          >
            <X size={20} />
          </button>
          </div>
          {!hasWinner && <div className="mt-4 flex items-center gap-2 border-t border-gray-100 pt-3 text-sm font-medium text-gray-700" aria-live="polite"><Users size={16} className="text-gray-400" />{loading ? 'Cargando...' : `${solicitudesVisibles.length} ${solicitudesVisibles.length === 1 ? 'postulación' : 'postulaciones'}`}<span className="ml-auto text-xs font-normal text-gray-400">Más recientes primero</span></div>}
        </div>

        <div className={`min-h-0 overflow-y-auto overscroll-contain ${hasWinner ? 'p-4 sm:p-6' : ''}`} data-management-body>
          {loading ? (
            <div className="py-10 text-center text-gray-500 font-bold">Cargando...</div>
          ) : isVenta ? (
            <div className="py-10 text-center text-gray-500 font-bold">
              Este modal es para regalo/donación.
            </div>
          ) : hasWinner ? (
            <div className="space-y-3">
              <div className="profile-selection-status" role="status">
                <CheckCircle2 size={18} aria-hidden="true" />
                <div><strong>{isEntregado?'Entrega completada':'Persona seleccionada'}</strong>
                  {!isEntregado&&<span>Pendiente de entrega</span>}
                </div>
              </div>

              {solicitudesVisibles.length ? (
                solicitudesVisibles.map((s) => {
                  const { nombre, foto } = getUserFromSolicitud(s);
                  const mensaje =
                    s?.justificacion || s?.mensaje || s?.message || "(Sin justificación)";
                  const fecha = formatDateTime(s?.created_at);

                  return (
                    <div
                      key={s?.id || `${nombre}-${fecha}`}
                      className="profile-selected-applicant"
                      data-selected-applicant
                    >
                        <div className="shrink-0">
                          {foto ? (
                            <img
                              src={foto}
                              alt={nombre}
                              className="w-10 h-10 rounded-full object-cover border border-gray-200"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center font-semibold text-gray-600">
                              {String(nombre).charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="profile-selected-identity">
                            <p className="profile-selected-name">{nombre}</p>
                            {fecha ? (
                              <span className="profile-selected-date">
                                {fecha}
                              </span>
                            ) : null}
                          </div>

                          <p className="profile-selected-message">
                            {mensaje}
                          </p>
                        </div>

                          {isEntregado ? null : (
                            <div className="profile-delivery-actions" aria-label="Acciones de entrega">
                              <button
                                type="button"
                                onClick={marcarComoEntregado}
                                disabled={!!updatingKey}
                                aria-label="Marcar como entregado"
                                title="Marcar como entregado"
                                className="profile-delivery-button profile-delivery-confirm"
                              >
                                {updatingKey === `${articuloId}:deliver`?<Loader2 size={16} className="animate-spin" aria-hidden="true" />:<CheckCircle2 size={16} aria-hidden="true" />}
                                <span>{updatingKey === `${articuloId}:deliver` ? "Marcando..." : "Marcar entregado"}</span>
                              </button>

                              <button
                                type="button"
                                onClick={cancelarEntrega}
                                disabled={!!updatingKey}
                                title="Cancelar entrega"
                                className="profile-delivery-button profile-delivery-cancel"
                              >
                                {updatingKey === `${articuloId}:cancel`?<Loader2 size={16} className="animate-spin" aria-hidden="true" />:<XCircle size={16} aria-hidden="true" />}
                                <span>{updatingKey === `${articuloId}:cancel` ? "Cancelando..." : "Cancelar entrega"}</span>
                              </button>
                            </div>
                          )}
                    </div>
                  );
                })
              ) : (
                <div className="py-10 text-center text-gray-500 font-bold">
                  Ya hay un ganador asignado.
                </div>
              )}
            </div>
          ) : solicitudesVisibles?.length ? (
            <ul className="divide-y divide-gray-100" aria-label="Personas postuladas" aria-busy={!!updatingKey}>
              {solicitudesVisibles.map((s) => {
                const { nombre, foto, userId } = getUserFromSolicitud(s);
                const mensaje = s?.justificacion || s?.mensaje || s?.message || "";

                return (
                  <ApplicantRow key={s.id || userId} applicant={{ ...s, justificacion: mensaje, usuarios: { nombre, foto_url: foto } }} busy={!!updatingKey || !userId} onChoose={() => entregarAUsuario(userId)} onReject={() => rechazarSolicitud(userId, nombre)} />
                );
              })}
            </ul>
          ) : (
            <div className="py-10 text-center text-gray-400 text-sm font-bold">
              Nadie se ha postulado aún.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ✅ helper: timeout
function withTimeout(promise, ms = 12000, label = "timeout") {
  let t;
  const timeoutPromise = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(label)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(t));
}

// ✅ fallback directo
async function fetchProfileFallback(userId) {
  const attempts = [
    { table: "profiles", col: "id" },
    { table: "profiles", col: "user_id" },
    { table: "usuarios", col: "id" },
    { table: "usuarios", col: "user_id" },
    { table: "users", col: "id" },
    { table: "users", col: "user_id" },
  ];

  for (const a of attempts) {
    try {
      const { data, error } = await supabase
        .from(a.table)
        .select("id,nombre,movil,ciudad,localidad,direccion,foto_url,is_blocked,bloqueado,blocked,estado,status,rol,role")
        .eq(a.col, userId)
        .maybeSingle();
      if (error) {
        console.log(`[fallback profile] ${a.table}.${a.col} error:`, error);
        continue;
      }
      if (data) {
        console.log(`[fallback profile] OK usando ${a.table}.${a.col}`);
        return { success: true, data };
      }
    } catch (e) {
      console.log(`[fallback profile] ${a.table}.${a.col} catch:`, e);
    }
  }

  return {
    success: false,
    error: "No se pudo leer perfil por fallback (tabla/columna/RLS).",
  };
}

export default function UserProfile({
  notificationTarget,
  user,
  myProducts = [],
  notifByArticulo = {},
  notificationBadges = {},
  supportUnreadCount = 0,
  onInboxNotifications,
  onInboxReceiptChange,
  inboxRevision=0,
  onArticuloSeen,
  onBack,
  onOpenEdit,
  onOpenGestion,
  onOpenChat,
  onDelete,
  onArticuloReservado,
  onArticuloDestacado,
}) {
  const publicationNow = usePublicationClock();
  const [activeTab, setActiveTab] = useState("publicaciones"); // ✅ ahora inicia en Buzón
  const [inboxTab,setInboxTab]=useState('system');
  const inboxTabId=useId();
  const changeInboxTab=tab=>{setInboxTab(tab);setSysMsgModal(null);};
  const inboxTabKey=event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();
    const next=event.key==='Home'?'system':event.key==='End'?'conversations':inboxTab==='conversations'?'system':'conversations';
    changeInboxTab(next);event.currentTarget.parentElement.querySelector(`[data-inbox-tab="${next}"]`)?.focus();
  };
  const [personalDetailsOpen, setPersonalDetailsOpen] = useState(false);
  useEffect(() => {
    if (!notificationTarget) return;
    if (['publicaciones', 'rescates', 'buzon'].includes(notificationTarget.tab)) setActiveTab(notificationTarget.tab);
    if(notificationTarget.tab==='buzon'){setInboxTab(notificationTarget.receiptKind==='support'?'conversations':'system');setSysMsgModal(null);}
    setPublicationFilters({ ...DEFAULT_PROFILE_FILTERS });
    setRescateFilters({ ...DEFAULT_PROFILE_FILTERS });
  }, [notificationTarget]);
  const [publicationFilters, setPublicationFilters] = useState({ ...DEFAULT_PROFILE_FILTERS });
  const [rescateFilters, setRescateFilters] = useState({ ...DEFAULT_PROFILE_FILTERS });
  const [publicationPage, setPublicationPage] = useState({ key: '', page: 1 });
  const [rescatePage, setRescatePage] = useState({ key: '', page: 1 });
  const [authEmail, setAuthEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ✅ eliminar cuenta (modal)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteEmailInput, setDeleteEmailInput] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const deletionRequestRef=useRef(null);

  const [isEditing, setIsEditing] = useState(false);
  const originalProfileRef = useRef(null);
  const loadUnreadRef = useRef(null);

  const [managingProduct, setManagingProduct] = useState(null);

  const [modalSolicitudesAbierto, setModalSolicitudesAbierto] = useState(false);
  const [solicitudesDelArticulo, setSolicitudesDelArticulo] = useState([]);
  const [articuloSeleccionado, setArticuloSeleccionado] = useState(null);
  const [cargandoSolicitudes, setCargandoSolicitudes] = useState(false);
  const [cargandoChatRescate, setCargandoChatRescate] = useState(null); // articuloId del rescate abriendo

  const [rescates, setRescates] = useState([]);
  const [rescatesError, setRescatesError] = useState("");
  const [rescatesReload, setRescatesReload] = useState(0);
  const [rescateExpiryClock, setRescateExpiryClock] = useState(() => Date.now());
  const [publicationExpiryClock, setPublicationExpiryClock] = useState(() => Date.now());
  const [cargandoRescates, setCargandoRescates] = useState(false);
  const [donacionLimit, setDonacionLimit] = useState(null); // { used, remaining, proximaEn }
  const [purchaseLimit, setPurchaseLimit] = useState(null);
  const [cuposSaldo, setCuposSaldo] = useState(null); // saldo de créditos
  const [recargaOpen, setRecargaOpen] = useState(false);
  const [destacandoId, setDestacandoId] = useState(null);
  const [featuredOverrides, setFeaturedOverrides] = useState({});
  const [profileProducts, setProfileProducts] = useState([]);
  const [profileProductsLoading, setProfileProductsLoading] = useState(false);
  const readCacheRef = useRef(null);
  if (!readCacheRef.current) readCacheRef.current = createReadCache();
  const liveArticlesRef = useRef(new Map());
  const [signalRevision, setSignalRevision] = useState(0);

  // \u2b50 Reputación
  const [miReputacion, setMiReputacion] = useState(null); // { promedio, total }
  const [calificarModal, setCalificarModal] = useState(null); // { reviewedId, articuloId, rol: "vendedor"|"ganador" }
  const [calificarEstrellas, setCalificarEstrellas] = useState(0);
  const [calificarHover, setCalificarHover] = useState(0);
  const [calificarLoading, setCalificarLoading] = useState(false);
  const [yaCalifique, setYaCalifique] = useState(new Set()); // articuloIds ya calificados

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewArt, setPreviewArt] = useState(null);

  const [cancelandoId, setCancelandoId] = useState(null);

  const [eliminandoArticuloId, setEliminandoArticuloId] = useState(null);
  const [deletedIds, setDeletedIds] = useState(() => new Set());

  const [hasPostulacionesByArticulo, setHasPostulacionesByArticulo] = useState(() => new Map());
  const [hasChatOwnerByArticulo, setHasChatOwnerByArticulo] = useState(() => new Map());
  const [hasChatBuyerByArticulo, setHasChatBuyerByArticulo] = useState(() => new Map());

  const [unreadByArticulo, setUnreadByArticulo] = useState(() => new Map());

  // ── Mensajes del sistema (admin → buzón) ─────────────────────────────────
  const [sysMsgs, setSysMsgs] = useState([]);
  const [sysMsgsLoading, setSysMsgsLoading] = useState(false);
  const [sysMsgModal, setSysMsgModal] = useState(null); // mensaje abierto en modal

  const [articuloOverridesById, setArticuloOverridesById] = useState(() => new Map());
  const getArtEffective = (art) => {
    const id = getArticuloId(art);
    if (!id) return art;
    return preferLatestArticle(art, articuloOverridesById.get(String(id)));
  };

  const [profile, setProfile] = useState({
    nombre: "",
    movil: "",
    ciudad: "",
    localidad: "",
    direccion: "",
    foto_url: "",
  });

  // Evita "parpadeo" del avatar por errores de carga o re-renders
  const [avatarBroken, setAvatarBroken] = useState(false);

  useEffect(() => {
    // Si cambia la URL (p. ej. subiste nueva foto), reintenta cargarla
    setAvatarBroken(false);
  }, [profile?.foto_url]);

  const emailReadonly = String(authEmail || user?.email || "").trim();

  const SAFE_LOCATIONS = useMemo(() => {
    return LOCATIONS && typeof LOCATIONS === "object" ? LOCATIONS : {};
  }, []);

  // Cargar reputación propia
  useEffect(() => {
    if (!user?.id) return;
    supabase.from("reputacion_promedio").select("promedio,total").eq("usuario_id", user.id).maybeSingle()
      .then(({ data }) => setMiReputacion(data ? { promedio: parseFloat(data.promedio), total: parseInt(data.total) } : { promedio: 0, total: 0 }));
    // Cargar articulos ya calificados por este usuario
    supabase.from("reputacion").select("articulo_id").eq("reviewer_id", user.id)
      .then(({ data }) => setYaCalifique(new Set((data || []).map(r => String(r.articulo_id)))));
  }, [user?.id]);

  // ✅ OPT: is_blocked ya viene en el objeto user desde App.jsx (hydrateUser lo merge desde DB).
  // Solo hacemos la query extra si por alguna razón no está disponible en el prop.
  const [isUserBlocked, setIsUserBlocked] = useState(
    !!(user?.is_blocked || user?.bloqueado || false)
  );
  useEffect(()=>{if(isUserBlocked)setRecargaOpen(false);},[isUserBlocked]);

  useEffect(() => {
    // Si ya tenemos el dato en el prop user, no hacemos query
    if (typeof user?.is_blocked !== "undefined" || typeof user?.bloqueado !== "undefined") {
      setIsUserBlocked(!!(user?.is_blocked || user?.bloqueado));
      return;
    }
    if (!user?.id) return;
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from("usuarios")
        .select("is_blocked")
        .eq("id", user.id)
        .maybeSingle();
      if (!alive) return;
      if (!error && data) setIsUserBlocked(!!data.is_blocked);
    })();
    return () => { alive = false; };
  }, [user?.id, user?.is_blocked, user?.bloqueado]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!alive) return;

        if (error) {
          console.log("auth.getUser error:", error);
          return;
        }

        const email = String(data?.user?.email || "").trim();
        setAuthEmail(email);
      } catch (e) {
        console.log("auth.getUser catch:", e);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const loadUnreadForArticuloIds = useCallback(
    async (articuloIds = [], knownChats = null) => {
      if (!user?.id) return;

      const ids = (Array.isArray(articuloIds) ? articuloIds : [])
        .map(String)
        .filter(Boolean);
      if (!ids.length) {
        setUnreadByArticulo(new Map());
        return;
      }

      const { data: chats, error: chatErr } = knownChats
        ? { data: knownChats } : await readCacheRef.current.get(`chats:${user.id}:${[...ids].sort().join(",")}`, () => selectChatsForArticuloIds(ids));

      if (chatErr) {
        console.log("Warn loadUnread chats:", chatErr);
        return;
      }

      const myChats = (chats || []).filter((c) => {
        const isBuyer = String(c?.buyer_id || "") === String(user.id);
        const sellerId = getSellerIdFromChatRow(c);
        const isSeller = String(sellerId || "") === String(user.id);
        return isBuyer || isSeller;
      });

      const chatIds = myChats.map((c) => c.id).filter(Boolean);
      if (!chatIds.length) {
        setUnreadByArticulo((prev) => {
          const next = new Map(prev);
          ids.forEach((aid) => next.set(String(aid), false));
          return next;
        });
        return;
      }

      const { data: reads, error: readErr } = await readCacheRef.current.get(`reads:${user.id}:${[...chatIds].sort().join(",")}`, () => supabase
        .from("chat_reads")
        .select("chat_id,last_read_at")
        .eq("user_id", user.id)
        .in("chat_id", chatIds));

      if (readErr) {
        console.log("Warn loadUnread chat_reads:", readErr);
      }

      const readMap = new Map((reads || []).map((r) => [String(r.chat_id), r?.last_read_at || null]));

      const perArticulo = new Map();
      myChats.forEach((c) => {
        const articuloId = String(c?.articulo_id || "");
        const lastMsgAt = c?.last_message_at ? new Date(c.last_message_at).getTime() : 0;

        const lastReadRaw = readMap.get(String(c.id)) || null;
        const lastReadAt = lastReadRaw ? new Date(lastReadRaw).getTime() : 0;

        const isUnread = lastMsgAt > 0 && lastMsgAt > lastReadAt;
        const prev = perArticulo.get(articuloId) === true;

        if (isUnread || prev) perArticulo.set(articuloId, true);
        else if (!perArticulo.has(articuloId)) perArticulo.set(articuloId, false);
      });

      setUnreadByArticulo((prev) => {
        const next = new Map(prev);
        ids.forEach((aid) => {
          next.set(String(aid), perArticulo.get(String(aid)) === true);
        });
        return next;
      });
    },
    [user?.id]
  );
  loadUnreadRef.current = loadUnreadForArticuloIds;

  const markChatAsRead = useCallback(
    async ({ articuloId, buyerId, knownChat }) => {
      if (!user?.id || !articuloId) return;

      let q = supabase.from("chats").select("id,articulo_id,buyer_id,seller_id").eq("articulo_id", articuloId);
      if (buyerId) q = q.eq("buyer_id", buyerId);

      let res = knownChat?.id && String(knownChat.articulo_id) === String(articuloId)
        && (!buyerId || String(knownChat.buyer_id) === String(buyerId))
        ? { data: knownChat } : await q.maybeSingle();

      if (res?.error?.message && /Could not find the 'seller_id' column/i.test(res.error.message)) {
        let q2 = supabase.from("chats").select("id,articulo_id,buyer_id,owner_id").eq("articulo_id", articuloId);
        if (buyerId) q2 = q2.eq("buyer_id", buyerId);
        res = await q2.maybeSingle();

        if (res?.error?.message && /Could not find the 'owner_id' column/i.test(res.error.message)) {
          let q3 = supabase.from("chats").select("id,articulo_id,buyer_id,usuario_id").eq("articulo_id", articuloId);
          if (buyerId) q3 = q3.eq("buyer_id", buyerId);
          res = await q3.maybeSingle();
        }
      }

      if (res?.error) {
        console.log("Warn markChatAsRead find chat:", res.error);
        return;
      }

      const chat = res?.data;
      if (!chat?.id) return;

      const isBuyer = String(chat?.buyer_id || "") === String(user.id);
      const sellerId = getSellerIdFromChatRow(chat);
      const isSeller = String(sellerId || "") === String(user.id);
      if (!isBuyer && !isSeller) return;

      const nowIso = new Date().toISOString();

      const { error: upErr } = await supabase
        .from("chat_reads")
        .upsert(
          { chat_id: chat.id, user_id: user.id, last_read_at: nowIso },
          { onConflict: "chat_id,user_id" }
        );

      if (upErr) {
        console.log("Warn markChatAsRead upsert:", upErr);
        return;
      }

      readCacheRef.current.clear();
      setUnreadByArticulo((prev) => {
        const next = new Map(prev);
        next.set(String(articuloId), false);
        return next;
      });
    },
    [user?.id]
  );

  // ✅ Carga perfil con fallback y timeout
  useEffect(() => {
    if (!user?.id) return;

    let alive = true;

    (async () => {
      if (!alive) return;
      setLoading(true);

      try {
        const res = await withTimeout(getProfile(user.id), 12000, "getProfile-timeout");
        if (!alive) return;

        if (res?.success && res.data) {
          const d = res.data;
          const next = {
            nombre: d.nombre ?? "",
            movil: d.movil ?? "",
            ciudad: d.ciudad ?? "",
            localidad: d.localidad ?? "",
            direccion: d.direccion ?? "",
            foto_url: d.foto_url ?? "",
            bloqueado: d.bloqueado,
            blocked: d.blocked,
            is_blocked: d.is_blocked,
            estado: d.estado ?? d.status,
            rol: d.rol ?? d.role,
          };
          setProfile(next);
          originalProfileRef.current = next;
        } else {
          console.log("getProfile respondió pero sin data:", res);
        }
      } catch (err) {
        console.error("Error cargando perfil:", err);

        const fb = await withTimeout(fetchProfileFallback(user.id), 8000, "fallback-timeout");
        if (!alive) return;

        if (fb?.success && fb.data) {
          const d = fb.data;
          const next = {
            nombre: d.nombre ?? d.full_name ?? d.name ?? "",
            movil: d.movil ?? d.phone ?? "",
            ciudad: d.ciudad ?? d.city ?? "",
            localidad: d.localidad ?? d.locality ?? "",
            direccion: d.direccion ?? d.address ?? "",
            foto_url: d.foto_url ?? d.avatar_url ?? d.photo_url ?? "",
            bloqueado: d.bloqueado,
            blocked: d.blocked,
            is_blocked: d.is_blocked,
            estado: d.estado ?? d.status,
            rol: d.rol ?? d.role,
          };
          setProfile(next);
          originalProfileRef.current = next;
        } else {
          console.log("Fallback no pudo leer perfil:", fb);
        }
      } finally {
        if (!alive) return;
        setIsEditing(false);
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [user?.id]);

  // Reload on each visit so new applications and purchases are included.
  useEffect(() => {
    if (!user?.id || !["rescates", "buzon"].includes(activeTab)) return;
    let alive = true;

    (async () => {
      setCargandoRescates(true);
      setRescatesError("");
      try {
        const { data, error } = await readCacheRef.current.get(`rescates:${user.id}:${rescatesReload}`, () => obtenerMisRescates(user.id));
        if (error) throw error;
        if (!alive) return;
        const visible = (data || []).map(row => ({ ...row, articulo: preferLatestArticle(row.articulo, liveArticlesRef.current.get(String(row.articulo_id))) }));
        setRescates(visible);
      } catch (error) {
        console.error("Error cargando rescates:", error);
        if (alive) setRescatesError("No se pudieron cargar tus postulaciones y compras. Intenta de nuevo.");
      } finally {
        if (alive) setCargandoRescates(false);
      }
    })();

    return () => { alive = false; };
  }, [user?.id, activeTab, rescatesReload, signalRevision]);

  // ✅ Carga saldo de créditos del usuario
  useEffect(() => {
    if (!user?.id) return;
    const cargarSaldo = async () => {
      try {
        const data = await accountCreditStatus(supabase);
        setCuposSaldo(data.balance);
        setDonacionLimit(data.donations);
        setPurchaseLimit(data.purchases);
        notifyCreditBalance(user.id, data.balance);
      } catch {}
    };
    cargarSaldo();
  }, [user?.id, rescatesReload]);


  // Destacar publicación — cuesta 1 crédito
  const toggleDestacado = async (art) => {
    const artId = getArticuloId(art);
    if (!artId || !user?.id || destacandoId) return;
    const isFeaturedNow = featuredOverrides[artId] ?? art?.is_featured ?? false;
    if (isFeaturedNow) return;
    if ((cuposSaldo ?? 0) < 1) {
      alert("No tienes créditos suficientes.\n\nRecarga desde el panel de créditos arriba.");
      return;
    }
    if (!window.confirm("¿Destacar esta publicación? Se descontará 1 crédito.")) return;
    setDestacandoId(artId);
    try {
      const { data, error } = await supabase.rpc("feature_article", { p_articulo_id: artId });
      if (error) {
        if (error.code === "PGRST202" || error.code === "42883") {
          throw new Error("Falta habilitar los destacados en Supabase. Aplica la migracion de destacados.");
        }
        throw new Error(error.message);
      }
      if (String(data?.article?.id) !== String(artId) || !data?.article?.is_featured || !Number.isInteger(data?.balance)) {
        throw new Error("No se pudo confirmar el destacado. Recarga la pagina.");
      }
      setCuposSaldo(data.balance);
      notifyCreditBalance(user.id, data.balance);
      setFeaturedOverrides(p => ({ ...p, [artId]: true }));
      onArticuloDestacado?.(data.article);
    } catch (error) { alert(error.message || "Error al destacar la publicación."); }
    finally { setDestacandoId(null); }
  };



  const handleToggleEdit = () => {
    if (saving) return;
    if (isUserBlocked) return alert(blockedUserMsg());
    originalProfileRef.current = { ...profile };
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    if (saving) return;
    const snap = originalProfileRef.current;
    if (snap) setProfile({ ...snap });
    setIsEditing(false);
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!user?.id) return;
    if (!isEditing) return;
    if (isUserBlocked) return alert(blockedUserMsg());
    if (!/^[0-9]{10}$/.test(String(profile.movil ?? ''))) {
      alert('El teléfono debe tener exactamente 10 dígitos.');
      return;
    }

    setSaving(true);

    const payload = {
      ...profile,
      nombre: profile.nombre,
    };

    const result = await updateProfile(user.id, payload);

    if (result?.success) {
      alert("Perfil actualizado");
      if (result.data) {
        const d = result.data;
        const next = {
          nombre: d.nombre ?? profile.nombre ?? "",
          movil: d.movil ?? "",
          ciudad: d.ciudad ?? "",
          localidad: d.localidad ?? "",
          direccion: d.direccion ?? "",
          foto_url: d.foto_url ?? "",
          bloqueado: d.bloqueado,
          blocked: d.blocked,
          is_blocked: d.is_blocked,
          estado: d.estado ?? d.status,
          rol: d.rol ?? d.role,
        };
        setProfile(next);
        originalProfileRef.current = next;
      } else {
        originalProfileRef.current = { ...profile };
      }
      setIsEditing(false);
    } else {
      alert("No se pudo actualizar: " + (result?.error || "Error"));
    }

    setSaving(false);
  };

  const handlePhotoChange = async (file) => {
    if (!file || !user?.id) return;
    if (isUserBlocked) return alert(blockedUserMsg());

    // ✅ valida formato (evita HEIC/HEIF)
    const type = String(file.type || "").toLowerCase();
    const name = String(file.name || "").toLowerCase();
    const isHeic =
      type.includes("heic") ||
      type.includes("heif") ||
      name.endsWith(".heic") ||
      name.endsWith(".heif");

    if (isHeic) {
      alert("Esa foto está en formato HEIC (iPhone) y no se mostrará. Por favor envíala como JPG/PNG.");
      return;
    }

    // ✅ valida tamaño
    const maxMb = 8;
    const sizeMb = file.size / (1024 * 1024);
    if (sizeMb > maxMb) {
      alert(`La imagen pesa ${sizeMb.toFixed(1)}MB. Máximo permitido: ${maxMb}MB.`);
      return;
    }

    setSaving(true);

    const res = await updateProfile(user.id, profile, file);
    console.log("updateProfile(photo) =>", res);

    if (res?.success) {
      const newUrl = res?.foto_url || res?.data?.foto_url || "";
      if (newUrl) {
        setProfile((p) => {
          const next = { ...p, foto_url: newUrl };
          originalProfileRef.current = { ...(originalProfileRef.current || next), foto_url: newUrl };
          return next;
        });
      }
      alert("Foto actualizada");
    } else {
      alert("No se pudo actualizar foto: " + (res?.error || "Error"));
    }

    setSaving(false);
  };

  const safeMyProducts = useMemo(() => {
    const propProducts = Array.isArray(myProducts)
      ? myProducts
      : Array.isArray(myProducts?.data)
      ? myProducts.data
      : Array.isArray(myProducts?.items)
      ? myProducts.items
      : [];

    const byId = new Map();
    // Prefer the fresh grouped read on equal timestamps, including participant metadata.
    [...propProducts, ...profileProducts].forEach((item) => {
      const id = getArticuloId(item);
      if (id) byId.set(String(id), preferLatestArticle(byId.get(String(id)), item));
    });
    return [...byId.values()];
  }, [myProducts, profileProducts]);

  useEffect(() => {
    if (!user?.id) {
      setProfileProducts([]);
      return;
    }
    if (!["publicaciones", "buzon"].includes(activeTab)) return;

    let alive = true;

    (async () => {
      setProfileProductsLoading(true);
      try {
        const { data, error } = await readCacheRef.current.get(`publications:${user.id}`, () => supabase.rpc("article_context", { p_article_id: null }));

        if (!alive) return;

        if (error) {
          console.log("Warn cargando publicaciones perfil:", error);
          setProfileProducts([]);
          return;
        }

        setProfileProducts(Array.isArray(data) ? data.map(article => preferLatestArticle(article, liveArticlesRef.current.get(String(article.id)))) : []);
      } catch (e) {
        if (!alive) return;
        console.log("Warn cargando publicaciones perfil:", e);
        setProfileProducts([]);
      } finally {
        if (alive) setProfileProductsLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [user?.id, activeTab, signalRevision]);

  useEffect(() => {
    const now = Date.now();
    const expirations = (safeMyProducts || []).map(articleHistoryExpiresAt).filter(time => time !== null && time > now);
    if (!expirations.length) return;
    const timeout = setTimeout(() => setPublicationExpiryClock(Date.now()), Math.min(...expirations) - now + 50);
    return () => clearTimeout(timeout);
  }, [safeMyProducts, publicationExpiryClock]);

  const publications = useMemo(() => {
    const ahora = Date.now();
    const base = [...(safeMyProducts || [])]
      .filter((a) => {
        const id = getArticuloId(a);
        if (id && deletedIds.has(String(id))) return false;
        // Ocultar entregados con más de 7 días
        const expiresAt = articleHistoryExpiresAt(a);
        if (expiresAt !== null && ahora >= expiresAt) return false;
        return true;
      })
      .sort((a, b) => {
        const estadoA = normEstado(a?.estado || a?.status || "disponible");
        const estadoB = normEstado(b?.estado || b?.status || "disponible");
        // Entregados siempre al final
        if (estadoA === "entregado" && estadoB !== "entregado") return 1;
        if (estadoB === "entregado" && estadoA !== "entregado") return -1;
        const ta = a?.created_at
          ? new Date(a.created_at).getTime()
          : a?.createdAt?.seconds
          ? a.createdAt.seconds * 1000
          : a?.createdAt
          ? new Date(a.createdAt).getTime()
          : 0;
        const tb = b?.created_at
          ? new Date(b.created_at).getTime()
          : b?.createdAt?.seconds
          ? b.createdAt.seconds * 1000
          : b?.createdAt
          ? new Date(b.createdAt).getTime()
          : 0;
        return tb - ta;
      });

    return base;
  }, [safeMyProducts, deletedIds, publicationExpiryClock]);

  // Rescates ordenados: entregados al fondo, ocultar si >7 días
  useEffect(() => {
    const now = Date.now();
    const expirations = (rescates || []).flatMap(row => [saleCancellation(row)?.expiresAt, donationRejection(row)?.expiresAt, articleHistoryExpiresAt(row.articulo)])
      .filter(time => Number.isFinite(time) && time > now);
    if (!expirations.length) return;
    const timeout = setTimeout(() => setRescateExpiryClock(Date.now()), Math.min(...expirations) - now + 50);
    return () => clearTimeout(timeout);
  }, [rescates, rescateExpiryClock]);

  const rescatesSorted = useMemo(() => {
    const ahora = Date.now();
    return [...(rescates || [])]
      .filter((r) => {
        if (!isRescateVisible(r, user?.id, ahora)) return false;
        const expiresAt = articleHistoryExpiresAt(r?.articulo);
        if (expiresAt !== null && ahora >= expiresAt) return false;
        return true;
      })
      .sort((a, b) => {
        const estadoA = normEstado(a?.articulo?.estado || a?.articulo?.status || "disponible");
        const estadoB = normEstado(b?.articulo?.estado || b?.articulo?.status || "disponible");
        if (estadoA === "entregado" && estadoB !== "entregado") return 1;
        if (estadoB === "entregado" && estadoA !== "entregado") return -1;
        const ta = a?.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b?.created_at ? new Date(b.created_at).getTime() : 0;
        return tb - ta;
      });
  }, [rescates, user?.id, rescateExpiryClock]);

  const filteredPublications = useMemo(() => filterProfileItems(publications, publicationFilters, {
    unread: unreadByArticulo, notifications: notifByArticulo, chats: hasChatOwnerByArticulo,
    posts: hasPostulacionesByArticulo, overrides: articuloOverridesById, featured: featuredOverrides,
    rated: yaCalifique, userId: user?.id, now: publicationNow,
  }), [publications, publicationFilters, unreadByArticulo, notifByArticulo, hasChatOwnerByArticulo,
    hasPostulacionesByArticulo, articuloOverridesById, featuredOverrides, yaCalifique, user?.id, publicationNow]);

  const filteredRescates = useMemo(() => filterProfileItems(rescatesSorted, rescateFilters, {
    rescates: true, unread: unreadByArticulo, chats: hasChatBuyerByArticulo,
    rated: yaCalifique, userId: user?.id, now: publicationNow,
  }), [rescatesSorted, rescateFilters, unreadByArticulo, hasChatBuyerByArticulo, yaCalifique, user?.id, publicationNow]);

  const publicationPageKey = JSON.stringify([user?.id, publicationFilters, [...yaCalifique]]);
  const rescatePageKey = JSON.stringify([user?.id, rescateFilters, [...yaCalifique]]);
  const publicationListing = paginateProfileItems(filteredPublications,
    publicationPage.key === publicationPageKey ? publicationPage.page : 1);
  const rescateListing = paginateProfileItems(filteredRescates,
    rescatePage.key === rescatePageKey ? rescatePage.page : 1);

  const focusedNotificationRef = useRef(null);
  useEffect(() => {
    if (!notificationTarget?.articleId || focusedNotificationRef.current === notificationTarget
      || loading || (activeTab === 'publicaciones' && profileProductsLoading)
      || activeTab !== notificationTarget.tab || !['publicaciones', 'rescates'].includes(activeTab)) return;
    const items = activeTab === 'rescates' ? filteredRescates : filteredPublications;
    const index = items.findIndex(item => String(item.articulo_id || getArticuloId(item)) === String(notificationTarget.articleId));
    if (index < 0) return;
    const page = paginateProfileItems(items.slice(0, index + 1), Number.MAX_SAFE_INTEGER).page;
    const currentPage = activeTab === 'rescates' ? rescateListing.page : publicationListing.page;
    if (currentPage !== page) {
      if (activeTab === 'rescates') setRescatePage({ key: rescatePageKey, page });
      else setPublicationPage({ key: publicationPageKey, page });
      return;
    }
    const frame = requestAnimationFrame(() => {
      const row = document.querySelector(`[data-profile-article-id="${CSS.escape(String(notificationTarget.articleId))}"]`);
      if (!row) return;
      row.scrollIntoView({ block: 'center' });
      row.focus({ preventScroll: true });
      focusedNotificationRef.current = notificationTarget;
    });
    return () => cancelAnimationFrame(frame);
  }, [notificationTarget, activeTab, loading, profileProductsLoading, filteredRescates, filteredPublications, rescateListing.page,
    publicationListing.page, rescatePageKey, publicationPageKey]);

  // ✅ maps publicaciones + unread — solo en pestaña publicaciones
  useEffect(() => {
    if (!user?.id) return;
    if (activeTab !== "publicaciones") return;

    const ids = (publicationsRef.current || []).map(getArticuloId).filter(Boolean);
    if (!ids.length) {
      setHasPostulacionesByArticulo(new Map());
      setHasChatOwnerByArticulo(new Map());
      setUnreadByArticulo(new Map());
      return;
    }

    let alive = true;

    (async () => {
      try {
        const countersAvailable = publications.every(article => Number.isInteger(article.interested_count));
        const { data: postRows, error: postErr } = countersAvailable
          ? { data: publications.filter(article => article.interested_count > 0).map(article => ({ articulo_id: article.id })) }
          : await readCacheRef.current.get(`posts:${user.id}:${[...ids].sort().join(",")}`, () => supabase
            .from("postulaciones").select("articulo_id").in("articulo_id", ids));
        if (postErr) console.log("Warn postulaciones map:", postErr);

        const contextAvailable = publications.every(article => Object.hasOwn(article, "transaction_chat"));
        const knownChats = contextAvailable ? publications.map(article => article.transaction_chat).filter(Boolean) : null;
        const { data: chats, error: chatErr } = knownChats
          ? { data: knownChats } : await readCacheRef.current.get(`chats:${user.id}:${[...ids].sort().join(",")}`, () => selectChatsForArticuloIds(ids));
        if (chatErr) console.log("Warn chats(owner) map:", chatErr);

        if (!alive) return;

        const postMap = new Map();
        (postRows || []).forEach((r) => {
          if (r?.articulo_id) postMap.set(String(r.articulo_id), true);
        });

        const chatMap = new Map();
        (chats || []).forEach((r) => {
          if (r?.articulo_id) chatMap.set(String(r.articulo_id), true);
        });

        setHasPostulacionesByArticulo(postMap);
        setHasChatOwnerByArticulo(chatMap);

        await loadUnreadForArticuloIds(ids, knownChats);
      } catch (e) {
        console.log("Warn maps publicaciones:", e);
        if (!alive) return;
        setHasPostulacionesByArticulo(new Map());
        setHasChatOwnerByArticulo(new Map());
      }
    })();

    return () => {
      alive = false;
    };
  // IDs determine this read; live state and counters arrive through the shared user topic.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, user?.id, loadUnreadForArticuloIds, publications.map(getArticuloId).join("|")]);

  // ✅ OPT: maps rescates + unread (buyer) — solo corre en pestaña rescates o buzon
  useEffect(() => {
    if (!user?.id) return;
    if (activeTab !== "rescates" && activeTab !== "buzon") return;

    const ids = (rescates || [])
      .map((r) => r?.articulo_id || r?.articuloId || getArticuloId(r?.articulo))
      .filter(Boolean);

    if (!ids.length) {
      setHasChatBuyerByArticulo(new Map());
      return;
    }

    let alive = true;

    (async () => {
      try {
        const { data: chatRows, error: chatErr } = await readCacheRef.current.get(`buyer-chats:${user.id}:${[...ids].sort().join(",")}`, () => supabase
          .from("chats").select("articulo_id").in("articulo_id", ids).eq("buyer_id", user.id));

        if (chatErr) console.log("Warn chats(buyer) map:", chatErr);

        if (!alive) return;

        const chatMap = new Map();
        (chatRows || []).forEach((r) => {
          if (r?.articulo_id) chatMap.set(String(r.articulo_id), true);
        });

        setHasChatBuyerByArticulo(chatMap);

        await loadUnreadForArticuloIds(ids);
      } catch (e) {
        console.log("Warn maps rescates:", e);
        if (!alive) return;
        setHasChatBuyerByArticulo(new Map());
      }
    })();

    return () => {
      alive = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, user?.id, loadUnreadForArticuloIds, rescates.map(row => row.articulo_id).join("|")]);

  // The parent owns the connection; profile panels consume the same events.
  // Live article patches do not trigger reads of applicants, chat history or bodies.
  useEffect(() => listenMarketSignals(signal => {
    if (signal.uid !== user?.id) return;
    if (signal.kind === 'balance') setCuposSaldo(Number(signal.saldo));
    if (['message', 'application'].includes(signal.kind)) readCacheRef.current.clear();
    if (signal.kind === 'article' && signal.article?.id) {
      const article = signal.article;
      liveArticlesRef.current.set(String(article.id), article);
      readCacheRef.current.clear();
      if (signal.action === 'DELETE') {
        setDeletedIds(previous => new Set([...previous, String(article.id)]));
        setRescates(previous => previous.filter(row => String(row.articulo_id) !== String(article.id)));
      } else {
        setProfileProducts(previous => previous.some(row => row.id === article.id)
          ? previous.map(row => row.id === article.id ? { ...row, ...article } : row)
          : article.owner_id === user.id ? [...previous, article] : previous);
        setArticuloOverridesById(previous => new Map(previous).set(String(article.id), article));
        setRescates(previous => previous.map(row => row.articulo_id === article.id ? { ...row, articulo: { ...row.articulo, ...article } } : row));
      }
    }
    if (signal.kind === 'application') {
      setHasPostulacionesByArticulo(previous => new Map(previous).set(String(signal.articulo_id), signal.interested_count > 0));
    }
    if (signal.kind === 'chat' && signal.chat?.id) {
      const chat = signal.chat;
      const update = article => article.id === chat.articulo_id ? { ...article, transaction_chat: signal.action === 'DELETE' ? null : chat } : article;
      setProfileProducts(previous => previous.map(update));
      setRescates(previous => previous.map(row => row.articulo_id === chat.articulo_id ? { ...row,
        _chatStatus: signal.action === 'DELETE' ? 'closed' : chat.status, _chatApprovedAt: chat.approved_at,
        _canceledAt: chat.canceled_at, _canceledBy: chat.canceled_by, articulo: update(row.articulo) } : row));
      setHasChatOwnerByArticulo(previous => new Map(previous).set(String(chat.articulo_id), signal.action !== 'DELETE'));
      setHasChatBuyerByArticulo(previous => new Map(previous).set(String(chat.articulo_id), signal.action !== 'DELETE'));
      readCacheRef.current.clear();
    }
    if (signal.kind === 'activity' && signal.notice?.type === 'donation_rejected') {
      setRescates(previous => previous.map(row => row.articulo_id === signal.notice.articulo_id
        ? { ...row, _source: 'rechazadas', _rejectedAt: signal.notice.created_at } : row));
      readCacheRef.current.clear();
    }
    if (signal.kind === 'reconnect') { readCacheRef.current.clear(); setSignalRevision(value => value + 1); }
  }), [user?.id]);

  useEffect(() => {
    setUnreadByArticulo(previous => {
      const next = new Map(previous);
      for (const id of next.keys()) next.set(id, (notifByArticulo[id]?.unreadChats || 0) > 0);
      for (const [id, value] of Object.entries(notifByArticulo)) next.set(id, (value.unreadChats || 0) > 0);
      return next;
    });
  }, [notifByArticulo]);

  // ── Cargar mensajes del sistema ──────────────────────────────────────────
  const sysMsgsPendingRef = useRef(false);
  const sysMsgsCargadosRef = useRef(false);
  const receiptRevisionRef = useRef(0);
  const inboxRevisionRef=useRef(inboxRevision);inboxRevisionRef.current=inboxRevision;
  const loadedInboxRevisionRef=useRef(-1);
  const loadSysMsgs = useCallback(async () => {
    if (!user?.id || sysMsgsPendingRef.current) return;
    sysMsgsPendingRef.current = true;
    const revision = receiptRevisionRef.current;
    const signalRevision=inboxRevisionRef.current;
    setSysMsgsLoading(true);
    try {
      let { data, error } = await supabase.rpc('notification_inbox');
      if (error?.code === 'PGRST202' || error?.code === '42883') ({ data, error } = await supabase.rpc('get_my_inbox'));
      if (error) throw error;
      if (revision !== receiptRevisionRef.current) return;
      sysMsgsCargadosRef.current = true;
      loadedInboxRevisionRef.current=signalRevision;
      setSysMsgs(Array.isArray(data) ? data : []);
      onInboxNotifications?.(user.id, Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn("loadSysMsgs warn:", e?.message || e);
      setSysMsgs([]);
    } finally {
      sysMsgsPendingRef.current = false;
      setSysMsgsLoading(false);
    }
  }, [user?.id, onInboxNotifications]);

  const markReceipt = useCallback(async (receiptId, action, kind = 'system') => {
    receiptRevisionRef.current++;
    try {
      let { error } = await supabase.rpc(kind === 'staff' ? 'staff_message_receipt_action' : 'notification_receipt_action', kind === 'staff' ? {
        p_message: receiptId, p_action: action,
      } : {
        p_receipt_id: receiptId,
        p_action: action,
      });
      if (kind !== 'staff' && (error?.code === 'PGRST202' || error?.code === '42883')) ({ error } = await supabase.rpc('mark_receipt', {
        p_receipt_id: receiptId, p_action: action,
      }));
      if (error) throw error;
      receiptRevisionRef.current++;
      onInboxReceiptChange?.(user?.id, receiptId, action, kind);
      if (action === "delete") {
        setSysMsgs((prev) => prev.filter((m) => m.receipt_id !== receiptId));
      } else if (action === "read") {
        setSysMsgs((prev) => prev.map((m) => m.receipt_id === receiptId ? { ...m, read_at: new Date().toISOString() } : m));
      } else if (action === "unread") {
        setSysMsgs((prev) => prev.map((m) => m.receipt_id === receiptId ? { ...m, read_at: null } : m));
      }
    } catch (e) {
      console.warn("markReceipt warn:", e?.message || e);
    }
  }, [user?.id, onInboxReceiptChange]);

  // ✅ sysMsgs: solo se carga cuando el usuario abre "buzon" (lazy)
  const openedSystemNotificationRef = useRef(null);
  useEffect(() => {
    if (activeTab !== 'buzon' || inboxTab!=='system' || notificationTarget?.receiptKind==='support' || !notificationTarget?.receiptId
      || openedSystemNotificationRef.current === notificationTarget) return;
    const message = sysMsgs.find(item => String(item.receipt_id) === String(notificationTarget.receiptId));
    if (!message) return;
    openedSystemNotificationRef.current = notificationTarget;
    setSysMsgModal({ ...message, read_at: message.read_at || new Date().toISOString() });
    if (!message.read_at) markReceipt(message.receipt_id, 'read', message.receipt_kind);
  }, [notificationTarget, activeTab, inboxTab, sysMsgs, markReceipt]);

  useEffect(() => {
    if (!user?.id) return;
    if (activeTab !== "buzon" || inboxTab!=="system") return;
    if (sysMsgsCargadosRef.current && loadedInboxRevisionRef.current===inboxRevisionRef.current) return;
    loadSysMsgs();
  }, [user?.id, activeTab, inboxTab, loadSysMsgs]);

  useEffect(()=>{
    if(activeTab==='buzon'&&inboxTab==='system'&&notificationTarget?.receiptKind!=='support'&&notificationTarget?.receiptId&&openedSystemNotificationRef.current!==notificationTarget&&sysMsgsCargadosRef.current
      &&!sysMsgs.some(message=>String(message.receipt_id)===String(notificationTarget.receiptId)))loadSysMsgs();
    // A notification click may request a new body even when this tab was already loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[notificationTarget,activeTab,inboxTab,loadSysMsgs]);

  // ✅ Sin polling — refs para leer estado sin dependencias reactivas
  const publicationsRef = useRef([]);
  const rescatesRef = useRef([]);
  useEffect(() => { publicationsRef.current = publications || []; }, [publications]);
  useEffect(() => { rescatesRef.current = rescates || []; }, [rescates]);

  // ✅ Refresca unread y sysMsgs al volver a la pestaña (solo si >5 min)
  const lastProfileRefreshRef = useRef(0);
  useEffect(() => {
    if (!user?.id) return;
    const handleVisibility = async () => {
      if (document.visibilityState !== "visible") return;
      const elapsed = Date.now() - lastProfileRefreshRef.current;
      if (elapsed < 5 * 60 * 1000) return;
      lastProfileRefreshRef.current = Date.now();
      try {
        const pubIds = publicationsRef.current.map((p) => String(getArticuloId(p) || "")).filter(Boolean);
        const rescIds = rescatesRef.current.map((r) => String(r?.articulo_id || getArticuloId(r?.articulo) || "")).filter(Boolean);
        const allIds = [...new Set([...pubIds, ...rescIds])];
        if (allIds.length) await loadUnreadRef.current?.(allIds);
        if (activeTab === "buzon" && inboxTab === "system" && sysMsgsCargadosRef.current) await loadSysMsgs();
      } catch {}
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [user?.id, activeTab, inboxTab, loadSysMsgs]);



  // ✅ Buzón (Inbox): mezcla publicaciones + rescates, y muestra lo que tenga chat / notificación / unread
  const inboxItems = useMemo(() => {
    const map = new Map();

    const put = (art, source) => {
      const id = getArticuloId(art);
      if (!id) return;
      const key = String(id);

      const prev = map.get(key);
      if (!prev) {
        map.set(key, { art, source });
        return;
      }

      // si ya existe, preferimos el "art" más completo (por si uno viene incompleto)
      const prevTitle = prev?.art?.titulo || prev?.art?.title || "";
      const nextTitle = art?.titulo || art?.title || "";
      if (!prevTitle && nextTitle) map.set(key, { art, source });
    };

    (publications || []).forEach((a) => put(getArtEffective(a), "pub"));
    (rescates || []).forEach((r) => put(r?.articulo || {}, "res"));

    const items = Array.from(map.entries()).map(([id, v]) => {
      const hasUnread = unreadByArticulo.get(String(id)) === true;
      const notif = notifByArticulo?.[String(id)] || null;
      const notifCount = Number(notif?.total || 0) || 0;
      const hasChat =
        hasChatOwnerByArticulo.get(String(id)) === true ||
        hasChatBuyerByArticulo.get(String(id)) === true;

      return {
        articuloId: String(id),
        art: v.art,
        source: v.source,
        hasUnread,
        notifCount,
        hasChat,
      };
    });

    // solo lo “relevante”: chat o notif o unread
    const filtered = items.filter((x) => x.hasChat || x.notifCount > 0 || x.hasUnread);

    // orden: primero unread / notif
    filtered.sort((a, b) => {
      const scoreA = (a.hasUnread ? 10 : 0) + (a.notifCount ? 5 : 0);
      const scoreB = (b.hasUnread ? 10 : 0) + (b.notifCount ? 5 : 0);
      if (scoreB !== scoreA) return scoreB - scoreA;

      const ta = a?.art?.created_at ? new Date(a.art.created_at).getTime() : 0;
      const tb = b?.art?.created_at ? new Date(b.art.created_at).getTime() : 0;
      return tb - ta;
    });

    return filtered;
  }, [
    publications,
    rescates,
    unreadByArticulo,
    notifByArticulo,
    hasChatOwnerByArticulo,
    hasChatBuyerByArticulo,
    articuloOverridesById,
  ]);

  const {publicaciones:pubNotifCount=0,rescates:rescNotifCount=0,buzon:inboxUnreadCount=0}=notificationBadges;

  const formatDate = (item) => {
    try {
      if (item?.created_at) {
        const d = new Date(item.created_at);
        if (!isNaN(d.getTime())) {
          return d.toLocaleDateString("es-CO", {
            day: "numeric",
            month: "short",
            year: "numeric",
          });
        }
      }
      if (item?.createdAt?.seconds) {
        const d = new Date(item.createdAt.seconds * 1000);
        return d.toLocaleDateString("es-CO", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
      }
      if (typeof item?.createdAt === "string") {
        const d = new Date(item.createdAt);
        if (!isNaN(d.getTime())) {
          return d.toLocaleDateString("es-CO", {
            day: "numeric",
            month: "short",
            year: "numeric",
          });
        }
      }
      return "Sin fecha";
    } catch {
      return "Sin fecha";
    }
  };

  const abrirGestion = (art) => {
    if (isUserBlocked) return alert(blockedUserMsg());
    const titulo = art?.titulo || art?.title || "Artículo";
    if (isArticuloEnRevision(art)) return alert(revisionBlockMsg(titulo));

    if (typeof onOpenGestion === "function") return onOpenGestion(art);
    setManagingProduct(art);
  };

  const abrirEditar = (art) => {
    if (isUserBlocked) return alert(blockedUserMsg());
    const titulo = art?.titulo || art?.title || "Artículo";
    if (isArticuloEnRevision(art)) return alert(revisionBlockMsg(titulo));

    if (typeof onOpenEdit === "function") return onOpenEdit(art);
    alert("Falta pasar onOpenEdit a <UserProfile /> para abrir el modal de edición.");
  };

  const abrirSolicitudesDeArticulo = async (art0) => {
    if (isUserBlocked) return alert(blockedUserMsg());

    const art = getArtEffective(art0);
    const titulo = art?.titulo || art?.title || "Artículo";
    if (isArticuloEnRevision(art)) return alert(revisionBlockMsg(titulo));

    const articuloId = getArticuloId(art);
    if (!articuloId) return alert("Este artículo no tiene ID válido.");

    try {
      setArticuloSeleccionado(art);
      setCargandoSolicitudes(true);

      const { data, error } = await obtenerPostulaciones(articuloId);

      if (!error) {
        setSolicitudesDelArticulo(Array.isArray(data) ? data : []);
        setModalSolicitudesAbierto(true);
      } else {
        console.log("Error al cargar solicitudes:", error);
        alert("No se pudieron cargar las solicitudes. Revisa la consola.");
      }
    } catch (err) {
      console.error(err);
      alert("No se pudieron cargar las solicitudes. Revisa la consola.");
    } finally {
      setCargandoSolicitudes(false);
    }
  };

  const verMensajes = async (art0) => {
    if (isUserBlocked) return alert(blockedUserMsg());

    const art = getArtEffective(art0);
    const titulo = art?.titulo || art?.title || "Artículo";
    if (isArticuloEnRevision(art)) return alert(revisionBlockMsg(titulo));

    const articuloId = getArticuloId(art);
    if (!articuloId) return alert("Este artículo no tiene ID válido.");

    if (typeof onOpenChat !== "function") {
      alert("Falta pasar onOpenChat desde App.jsx a <UserProfile />.");
      return;
    }

    const isVenta = isVentaArticulo(art);

    if (isVenta) {
      const buyerId = art?.buyer_id || art?.buyerId || null;
      await markChatAsRead({ articuloId, buyerId: buyerId || null, knownChat: art.transaction_chat });
      await onOpenChat({ article: art, buyerId: buyerId || null });
      return;
    }

    const ganadorId = art?.ganador_id || art?.winner_id || art?.winnerUid || art?.recipient_id || null;

    if (!ganadorId) {
      alert("Este artículo aún no tiene un usuario seleccionado (ganador).");
      return;
    }

    await markChatAsRead({ articuloId, buyerId: ganadorId });
    onOpenChat({ article: art, buyerId: ganadorId });
  };

  const verMensajesRescate = async (rescate) => {
    if (isUserBlocked) return alert(blockedUserMsg());

    const art = rescate?.articulo || {};
    const titulo = art?.titulo || art?.title || "Artículo";
    if (isArticuloEnRevision(art)) return alert(revisionBlockMsg(titulo));

    const articuloId = rescate?.articulo_id || rescate?.articuloId || getArticuloId(art) || null;
    if (!articuloId) return alert("Este artículo no tiene ID válido.");

    if (typeof onOpenChat !== "function") {
      alert("Falta pasar onOpenChat desde App.jsx a <UserProfile />.");
      return;
    }

    const hasChatActivo = hasChatBuyerByArticulo.get(String(articuloId)) === true;
    if (!canOpenRescateChat(rescate, user.id, hasChatActivo)) return;

    try {
      setCargandoChatRescate(articuloId);
      onArticuloSeen?.(articuloId);
      await markChatAsRead({ articuloId, buyerId: user.id, knownChat: art.transaction_chat });
      await onOpenChat({ article: art, buyerId: user.id });
    } finally {
      setCargandoChatRescate(null);
    }
  };

  const refreshSolicitudesArticuloSeleccionado = async () => {
    const art = articuloSeleccionado;
    const articuloId = getArticuloId(art);
    if (!articuloId) return;

    try {
      setCargandoSolicitudes(true);
      const { data, error } = await obtenerPostulaciones(articuloId);
      if (!error) setSolicitudesDelArticulo(Array.isArray(data) ? data : []);
    } catch (e) {
      console.log("No se pudieron refrescar solicitudes:", e);
    } finally {
      setCargandoSolicitudes(false);
    }
  };

  const eliminarRescate = async (rescate) => {
    if (!user?.id) return;
    if (isUserBlocked) return alert(blockedUserMsg());

    const art = rescate?.articulo || {};
    const titulo = art?.titulo || art?.title || "Artículo";
    if (isArticuloEnRevision(art)) return alert(revisionBlockMsg(titulo));

    const articuloId = rescate?.articulo_id || rescate?.articuloId || getArticuloId(art) || null;

    if (!articuloId) {
      alert("No se encontró articulo_id para eliminar.");
      return;
    }

    const isPurchase = isVentaArticulo(art) && String(art.buyer_id || "") === String(user.id);
    const isActivePurchase = isPurchase && normEstado(art.estado || art.status) === "reservado";
    if (isPurchase && isRescateSaleLocked(rescate)) {
      return alert("La compra ya fue aprobada. Se conserva hasta siete días después de la entrega.");
    }
    if (isPurchase && normEstado(art.estado || art.status) === "entregado") {
      return alert("La compra entregada se conserva en tu historial.");
    }
    const ok = confirm(isActivePurchase
      ? `¿Cancelar la compra de "${titulo}"? El articulo volvera a estar disponible. Si usaste un credito, no se devuelve cuando cancelas tu.`
      : `¿Quitar de “Mis Rescates”? \n\n"${titulo}"\n\nEsto eliminará tu solicitud y el chat/mensajes.`);
    if (!ok) return;

    const disableKey = rescate?.id || articuloId;
    const key = `del:${disableKey}`;

    try {
      setCancelandoId(key);

      if (isActivePurchase) {
        const { article } = await transitionSale(supabase, articuloId, "cancel");
        onArticuloReservado?.(article);
        setRescatesReload(value => value + 1);
        return;
      }

      const result = await eliminarSolicitudCompradorYChat({
        articuloId,
        compradorId: user.id,
      });

      if (!result?.success) {
        console.log("eliminarSolicitudCompradorYChat error:", result?.error);
        alert("No se pudo eliminar tu solicitud (RLS/permisos). Revisa la consola.");
        return;
      }

      setRescates((prev) =>
        prev.filter((r) => {
          const aid = r?.articulo_id || r?.articuloId || getArticuloId(r?.articulo) || null;
          return String(aid) !== String(articuloId);
        })
      );

      setHasChatBuyerByArticulo((prev) => {
        const next = new Map(prev);
        next.delete(String(articuloId));
        return next;
      });

      setUnreadByArticulo((prev) => {
        const next = new Map(prev);
        next.delete(String(articuloId));
        return next;
      });

      try {
        const selectedId = getArticuloId(articuloSeleccionado);
        if (selectedId && String(selectedId) === String(articuloId)) {
          await refreshSolicitudesArticuloSeleccionado();
        }
      } catch {}
    } catch (e) {
      console.error(e);
      alert("No se pudo eliminar de Mis Rescates. Revisa la consola.");
    } finally {
      setCancelandoId(null);
    }
  };

  const togglePausado = async (art0) => {
    const art = getArtEffective(art0);
    const id = getArticuloId(art);
    if (!id) return;
    const current = articuloOverridesById.get(String(id)) || art;
    const estado = String(current?.estado || current?.status || "disponible").toLowerCase();
    if (!["disponible", "pausado"].includes(estado)) return;
    const next = estado !== "pausado";
    const nextEstado = next ? "pausado" : "disponible";
    try {
      const { error } = await supabase
        .from("articulos")
        .update({ estado: nextEstado, status: nextEstado })
        .eq("id", id)
        .eq("owner_id", user.id)
        .select("id")
        .single();
      if (error) throw error;
      setArticuloOverridesById((prev) => {
        const m = new Map(prev);
        const base = m.get(String(id)) || art;
        m.set(String(id), { ...base, estado: nextEstado, status: nextEstado, pausado: next });
        return m;
      });
      onArticuloReservado?.({ ...art, estado: nextEstado, status: nextEstado, pausado: next });
    } catch (e) {
      console.error("togglePausado error:", e);
      alert("No se pudo " + (next ? "pausar" : "reactivar") + " la publicación.");
    }
  };

  const enviarCalificacion = async () => {
    if (!calificarModal || calificarEstrellas < 1) return;
    setCalificarLoading(true);
    try {
      await supabase.from("reputacion").insert({
        reviewer_id: user.id,
        reviewed_id: calificarModal.reviewedId,
        articulo_id: calificarModal.articuloId,
        estrellas: calificarEstrellas,
      });
      setYaCalifique(prev => new Set([...prev, String(calificarModal.articuloId)]));
      setCalificarModal(null);
      setCalificarEstrellas(0);
      // Refrescar mi reputación si yo fui calificado
      supabase.from("reputacion_promedio").select("promedio,total").eq("usuario_id", user.id).maybeSingle()
        .then(({ data }) => setMiReputacion(data ? { promedio: parseFloat(data.promedio), total: parseInt(data.total) } : { promedio: 0, total: 0 }));
    } catch (e) { alert("No se pudo enviar la calificación."); }
    finally { setCalificarLoading(false); }
  };

  const eliminarPublicacion = async (art0) => {
    if (isUserBlocked) return alert(blockedUserMsg());

    const art = getArtEffective(art0);
    const articuloId = getArticuloId(art);
    if (!articuloId) return alert("Este artículo no tiene ID válido.");

    if (typeof onDelete !== "function") {
      alert("Falta pasar onDelete desde App.jsx a <UserProfile />.");
      return;
    }

    try {
      setEliminandoArticuloId(String(articuloId));

      setDeletedIds((prev) => {
        const next = new Set(prev);
        next.add(String(articuloId));
        return next;
      });

      await onDelete(art);
    } catch (e) {
      console.log("Eliminar publicación falló:", e);

      setDeletedIds((prev) => {
        const next = new Set(prev);
        next.delete(String(articuloId));
        return next;
      });

      alert("No se pudo eliminar. Revisa la consola.");
    } finally {
      setEliminandoArticuloId(null);
    }
  };

  const fallbackAvatar = useMemo(() => {
    const initial = (profile?.nombre?.[0] || "U").toUpperCase();
    return (
      "data:image/svg+xml;utf8," +
      encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'>
          <rect width='100%' height='100%' fill='#f3f4f6'/>
          <text x='50%' y='54%' font-size='72' text-anchor='middle' fill='#111827' font-family='Arial' font-weight='700'>
            ${initial}
          </text>
        </svg>`
      )
    );
  }, [profile?.nombre]);

  const avatarSrc = useMemo(() => {
    const url = String(profile?.foto_url || "").trim();
    if (avatarBroken) return fallbackAvatar;
    return url ? url : fallbackAvatar;
  }, [profile?.foto_url, avatarBroken, fallbackAvatar]);

  if (!user) return null;

  if (loading) {
    return <div className="p-10 text-center font-black uppercase">Cargando perfil...</div>;
  }

  return (
    <div className="user-profile max-w-5xl mx-auto p-4 animate-in slide-in-from-bottom-4 duration-300">
      <header className="profile-page-heading">
        <h1>Mi cuenta</h1>
        <button type="button" onClick={onBack} className="profile-return-home">
          <ArrowLeft size={16} aria-hidden="true" /> Volver al inicio
        </button>
        <p>Administra tus publicaciones, rescates y mensajes.</p>
      </header>

      {isUserBlocked ? (
        <div className="mb-6 rounded-3xl border border-red-200 bg-red-50 px-5 py-4">
          <p className="text-sm font-black text-red-700 uppercase flex items-center gap-2">
            <AlertTriangle size={16} />
            Cuenta bloqueada
          </p>
          <p className="mt-1 text-xs font-bold text-red-700">
            Tus acciones están desactivadas (chats, edición, gestión, eliminación).
          </p>
          <p className="mt-2 text-xs text-red-700">Tus créditos están bloqueados y no puedes realizar recargas. Para solicitar la devolución de créditos comprados, comunícate con administración en <a className="underline" href={`mailto:${LEGAL_OPERATOR.email}`}>{LEGAL_OPERATOR.email}</a>.</p>
        </div>
      ) : null}

      <div className="profile-layout grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-8">
        {/* IZQUIERDA */}
        <div className="lg:col-span-1 min-w-0 space-y-6">
          <section className="profile-personal overflow-hidden lg:rounded-lg lg:border lg:border-gray-200 lg:bg-white" aria-label="Datos de mi cuenta">
            <div className="hidden lg:block h-24 bg-forest-green" />
            <div className="profile-personal-body lg:px-6 lg:pb-6">
              <div className="profile-identity relative lg:-mt-12 mb-3 flex items-center gap-4 lg:justify-center">
                <div className="relative group">
                  <img
                    src={avatarSrc}
                    alt="Foto de perfil"
                    className="profile-avatar w-16 h-16 lg:w-24 lg:h-24 rounded-full border-4 border-white object-cover shadow-sm"
                    onError={(e) => {
                      if (e.currentTarget.dataset.fallbackApplied) return;
                      e.currentTarget.dataset.fallbackApplied = "1";
                      setAvatarBroken(true);
                      e.currentTarget.src = fallbackAvatar;
                    }}
                  />

                  <label
                    className={`absolute bottom-0 right-0 bg-white p-2 rounded-full shadow-md cursor-pointer hover:scale-110 transition ${
                      isUserBlocked ? "opacity-50 pointer-events-none" : ""
                    }`}
                    title={isUserBlocked ? "Cuenta bloqueada" : "Cambiar foto"}
                  >
                    <Camera size={18} className="text-forest-green" />
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      disabled={saving || isUserBlocked}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        handlePhotoChange(f);
                      }}
                    />
                  </label>
                </div>
                <div className="min-w-0 flex-1 lg:hidden">
                  <h2 className="text-lg font-bold text-gray-900 break-words">{profile.nombre || 'Mi perfil'}</h2>
                  <p className="mt-1 text-sm text-gray-500 break-words">{[profile.ciudad, profile.localidad].filter(Boolean).join(' · ')}</p>
                </div>
              </div>

              {/* \u2b50 Reputación propia */}
              {miReputacion && (
                <div className="profile-reputation flex flex-wrap items-center lg:justify-center gap-1 mb-3">
                  {[1,2,3,4,5].map(s => (
                    <span key={s} className={`text-xl ${s <= Math.round(miReputacion.promedio) ? "text-yellow-400" : "text-gray-200"}`}>★</span>
                  ))}
                  <span className="text-xs font-black text-gray-500 ml-1">
                    {miReputacion.promedio > 0 ? miReputacion.promedio.toFixed(1) : "Sin calificaciones"}
                    {miReputacion.total > 0 && <span className="font-normal text-gray-400"> ({miReputacion.total})</span>}
                  </span>
                </div>
              )}

              <button type="button" onClick={() => setPersonalDetailsOpen(open => !open)}
                aria-expanded={personalDetailsOpen || isEditing} aria-controls="profile-personal-details"
                className="lg:hidden flex min-h-11 w-full items-center justify-between gap-3 border-y border-gray-200 py-3 text-sm font-semibold text-gray-700">
                Datos personales
                <ChevronDown size={18} className={personalDetailsOpen || isEditing ? 'rotate-180' : ''} aria-hidden="true" />
              </button>
              <form id="profile-personal-details" onSubmit={handleUpdate} className={`${personalDetailsOpen || isEditing ? 'block' : 'hidden'} lg:block space-y-3 pt-4 lg:pt-0`}>
                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 ml-2">
                    Nombre completo (no editable)
                  </label>
                  <input
                    value={profile.nombre ?? ""}
                    onChange={(e) => setProfile((p) => ({ ...p, nombre: e.target.value }))}
                    className="w-full p-3 rounded-2xl bg-gray-100 border-none outline-none opacity-80 cursor-not-allowed"
                    disabled
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 ml-2">Correo (no editable)</label>
                  <input
                    value={emailReadonly || "—"}
                    className="w-full p-3 rounded-2xl bg-gray-100 border-none outline-none opacity-80 cursor-not-allowed"
                    disabled
                  />
                </div>

                <div>
                  <label htmlFor="profile-phone" className="text-[10px] font-black uppercase text-gray-400 ml-2">Teléfono</label>
                  <input
                    id="profile-phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    maxLength={10}
                    minLength={10}
                    pattern="[0-9]{10}"
                    required
                    title="El teléfono debe tener exactamente 10 dígitos."
                    aria-describedby="profile-privacy-note"
                    value={profile.movil ?? ""}
                    onPaste={(e) => {
                      e.preventDefault();
                      const input = e.currentTarget;
                      const pasted = e.clipboardData.getData('text').replace(/[^0-9]/g, '');
                      const start = input.selectionStart ?? input.value.length;
                      const end = input.selectionEnd ?? start;
                      const movil = (input.value.slice(0, start) + pasted + input.value.slice(end)).slice(0, 10);
                      setProfile((p) => ({ ...p, movil }));
                    }}
                    onChange={(e) => {
                      const movil = e.target.value.replace(/[^0-9]/g, '').slice(0, 10);
                      setProfile((p) => ({ ...p, movil }));
                    }}
                    className={`w-full p-3 rounded-2xl border-none outline-none ${
                      isEditing
                        ? "bg-gray-50 focus:ring-2 focus:ring-forest-green"
                        : "bg-gray-100 opacity-80 cursor-not-allowed"
                    }`}
                    disabled={!isEditing || saving || isUserBlocked}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
                  <div>
                    <label className="text-[10px] font-black uppercase text-gray-400 ml-2">Ciudad</label>
                    <select
                      value={profile.ciudad ?? ""}
                      onChange={(e) => setProfile((p) => ({ ...p, ciudad: e.target.value, localidad: "" }))}
                      className={`w-full p-3 rounded-2xl border-none outline-none ${
                        isEditing
                          ? "bg-gray-50 focus:ring-2 focus:ring-forest-green"
                          : "bg-gray-100 opacity-80 cursor-not-allowed"
                      }`}
                      disabled={!isEditing || saving || isUserBlocked}
                    >
                      <option value="">Seleccionar ciudad...</option>
                      {Object.keys(SAFE_LOCATIONS).map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase text-gray-400 ml-2">Localidad</label>
                    <select
                      value={profile.localidad ?? ""}
                      onChange={(e) => setProfile((p) => ({ ...p, localidad: e.target.value }))}
                      disabled={!isEditing || !profile.ciudad || saving || isUserBlocked}
                      className={`w-full p-3 rounded-2xl border-none outline-none ${
                        isEditing
                          ? "bg-gray-50 focus:ring-2 focus:ring-forest-green"
                          : "bg-gray-100 opacity-80 cursor-not-allowed"
                      }`}
                    >
                      <option value="">Seleccionar localidad...</option>
                      {(SAFE_LOCATIONS[profile.ciudad] || []).map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="profile-address" className="text-[10px] font-black uppercase text-gray-400 ml-2">Dirección</label>
                  <input
                    id="profile-address"
                    aria-describedby="profile-privacy-note"
                    value={profile.direccion ?? ""}
                    onChange={(e) => setProfile((p) => ({ ...p, direccion: e.target.value }))}
                    className={`w-full p-3 rounded-2xl border-none outline-none ${
                      isEditing
                        ? "bg-gray-50 focus:ring-2 focus:ring-forest-green"
                        : "bg-gray-100 opacity-80 cursor-not-allowed"
                    }`}
                    placeholder="Ej: Calle 10 #23-45"
                    disabled={!isEditing || saving || isUserBlocked}
                  />
                </div>

                <div className="flex items-start gap-2 border-t border-gray-200 pt-3 text-gray-500">
                  <LockKeyhole size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <p id="profile-privacy-note" className="text-xs leading-5">
                    Tu teléfono, correo y dirección no se muestran a otros usuarios; son de uso interno de la plataforma.
                    {' '}El contacto entre compradores y vendedores se realiza únicamente por el chat de MiBatute, incluso después de confirmar una venta o donación.
                  </p>
                </div>

                {!isEditing ? (
                  <button
                    type="button"
                    onClick={handleToggleEdit}
                    disabled={saving || isUserBlocked}
                    className="w-full mt-2 bg-gray-100 text-gray-700 p-4 rounded-2xl font-black uppercase tracking-widest hover:bg-gray-200 transition disabled:opacity-50 flex items-center justify-center gap-2"
                    title={isUserBlocked ? "Cuenta bloqueada" : "Editar"}
                  >
                    <Pencil size={16} />
                    Editar perfil
                  </button>
                ) : (
                  <>
                    <div className="mt-3 flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        disabled={saving || isUserBlocked}
                        className="w-36 px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-black uppercase transition disabled:opacity-50"
                      >
                        Cancelar
                      </button>

                      <button
                        type="submit"
                        disabled={saving || isUserBlocked}
                        className="w-36 px-4 py-2 rounded-xl bg-forest-green text-white text-xs font-black uppercase hover:brightness-110 transition disabled:opacity-50 inline-flex items-center justify-center"
                        title={isUserBlocked ? "Cuenta bloqueada" : "Guardar"}
                      >
                        {saving ? <Loader2 className="animate-spin" size={16} /> : "Guardar"}
                      </button>
                    </div>

                    <div className="pt-3 flex justify-center">
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteEmailInput("");
                          setDeleteModalOpen(true);
                        }}
                        disabled={saving || isUserBlocked}
                        className="text-xs font-black text-red-600 hover:underline disabled:opacity-50"
                      >
                        Solicitar cierre y supresión
                      </button>
                    </div>
                  </>
                )}

                {isEditing ? (
                  <p className="text-[10px] text-gray-400 font-bold text-center uppercase tracking-tight">
                    Por seguridad, el nombre y el correo no se pueden editar.
                  </p>
                ) : null}
              </form>
            </div>
          </section>
        </div>

        {/* DERECHA */}
        <div className="lg:col-span-2 min-w-0 space-y-5">

          {/* ── CAJA DE CRÉDITOS ── */}
          <section className="profile-credits border-y border-gray-200 py-4" aria-label="Créditos de mi cuenta">
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-10 h-10 flex items-center justify-center shrink-0 text-forest-green">
                <CircleDollarSign size={24} strokeWidth={1.5} aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-[140px]">
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-widest">{isUserBlocked ? 'Créditos bloqueados' : 'Saldo de créditos'}</p>
                <p className="text-2xl font-black text-gray-800">
                  {cuposSaldo === null ? "..." : cuposSaldo}
                  <span className="text-sm font-semibold text-gray-400 ml-1">crédito{cuposSaldo !== 1 ? "s" : ""}</span>
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">{isUserBlocked ? 'El saldo se conserva, pero no puede utilizarse mientras la cuenta esté bloqueada.' : 'Los créditos sirven para destacar, solicitar donaciones adicionales o reservar compras adicionales. Los destacados no son reembolsables.'}</p>
                {donacionLimit?.heldCredits > 0 && <p className="mt-1 text-xs text-gray-600">{donacionLimit.heldCredits} crédito{donacionLimit.heldCredits === 1 ? '' : 's'} retenido{donacionLimit.heldCredits === 1 ? '' : 's'} en solicitudes pendientes. El saldo muestra los disponibles.</p>}
                {purchaseLimit?.heldCredits > 0 && <p className="mt-1 text-xs text-gray-600">{purchaseLimit.heldCredits} crédito{purchaseLimit.heldCredits === 1 ? '' : 's'} retenido{purchaseLimit.heldCredits === 1 ? '' : 's'} en compras adicionales.</p>}
              </div>
              <button
                type="button"
                onClick={() => {if(!isUserBlocked)setRecargaOpen(true);}}
                disabled={isUserBlocked}
                title={isUserBlocked ? 'Recargas desactivadas por bloqueo de cuenta' : 'Recargar con Wompi'}
                className="profile-topup shrink-0 min-h-11 px-4 py-2 rounded-lg bg-forest-green text-white font-bold text-sm hover:bg-green-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Recargas - Proximamente
              </button>
            </div>
          </section>

          {recargaOpen && !isUserBlocked && <WompiTopupDialog onClose={() => setRecargaOpen(false)} onConfirmed={balance => {
            setCuposSaldo(balance);
            notifyCreditBalance(user.id,balance);
          }} />}

          <div className="profile-activity min-w-0">
            <div className="profile-tabs grid grid-cols-3 border-b border-gray-200" role="group" aria-label="Actividad de mi cuenta">
              <button
                onClick={() => setActiveTab("publicaciones")}
                className={`flex-1 py-4 text-sm font-bold transition flex items-center justify-center gap-2 ${
                  activeTab === "publicaciones"
                    ? "border-b-2 border-forest-green text-forest-green"
                    : "text-gray-400 hover:text-gray-600"
                }`}
                type="button"
                aria-label="Mis Publicaciones"
                aria-pressed={activeTab === 'publicaciones'}
              >
                <Package size={17} aria-hidden="true" className="profile-tab-icon" />
                <span><span className="hidden sm:inline">Mis </span>Publicaciones</span>
                {pubNotifCount > 0 ? (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-600 text-white text-[10px] font-black">
                    {pubNotifCount}
                  </span>
                ) : null}
              </button>

              <button
                onClick={() => setActiveTab("rescates")}
                className={`flex-1 py-4 text-sm font-bold transition flex items-center justify-center gap-2 ${
                  activeTab === "rescates"
                    ? "border-b-2 border-forest-green text-forest-green"
                    : "text-gray-400 hover:text-gray-600"
                }`}
                type="button"
                aria-label="Mis Rescates"
                aria-pressed={activeTab === 'rescates'}
              >
                <ShoppingBag size={17} aria-hidden="true" className="profile-tab-icon" />
                <span><span className="hidden sm:inline">Mis </span>Rescates</span>
                {rescNotifCount > 0 ? (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-600 text-white text-[10px] font-black">
                    {rescNotifCount}
                  </span>
                ) : null}
              </button>

              <button
                onClick={() => {
                  setActiveTab("buzon");
                  if(inboxTab==='system'&&sysMsgsCargadosRef.current&&loadedInboxRevisionRef.current!==inboxRevisionRef.current)loadSysMsgs();
                }}
                className={`flex-1 py-4 text-sm font-bold transition flex items-center justify-center gap-2 ${
                  activeTab === "buzon"
                    ? "border-b-2 border-forest-green text-forest-green"
                    : "text-gray-400 hover:text-gray-600"
                }`}
                type="button"
                aria-pressed={activeTab === 'buzon'}
              >
                <Inbox size={16} />
                Buzón
                {inboxUnreadCount > 0 ? (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[22px] h-[22px] px-2 rounded-full bg-red-600 text-white text-xs font-black">
                    {inboxUnreadCount}
                  </span>
                ) : null}
              </button>
            </div>

            <div className="profile-activity-body py-4 space-y-4">
              {activeTab === "buzon" && (
                <>
                  <div className="profile-inbox-tabs" role="tablist" aria-label="Secciones del buzón">
                    {[['system','Avisos del sistema',Bell,Math.max(0,inboxUnreadCount-supportUnreadCount)],['conversations','Conversaciones del sistema',MessageCircle,supportUnreadCount]].map(([tab,label,Icon,count])=>(
                      <button key={tab} type="button" role="tab" id={`${inboxTabId}-${tab}-tab`} aria-controls={`${inboxTabId}-${tab}-panel`} aria-selected={inboxTab===tab} tabIndex={inboxTab===tab?0:-1} data-inbox-tab={tab} onKeyDown={inboxTabKey} onClick={()=>changeInboxTab(tab)}>
                        <Icon size={16} aria-hidden="true" /><span>{label}</span>{count>0&&<span className="profile-inbox-count" aria-label={`${count} sin leer`}>{count}</span>}
                      </button>
                    ))}
                  </div>
                  <div role="tabpanel" id={`${inboxTabId}-conversations-panel`} aria-labelledby={`${inboxTabId}-conversations-tab`} hidden={inboxTab!=='conversations'} className="profile-inbox-panel">
                  <SupportInbox key={user.id} userId={user.id} isActive={inboxTab==='conversations'}
                    targetThreadId={notificationTarget?.receiptKind==='support'?notificationTarget.receiptId:null} targetVersion={notificationTarget}
                    onRemoved={threadId=>onInboxReceiptChange?.(user.id,threadId,'delete','support')}
                    onSeen={(threadId,throughAt)=>onInboxReceiptChange?.(user.id,threadId,'read','support',throughAt)} />
                  </div>
                  <div role="tabpanel" id={`${inboxTabId}-system-panel`} aria-labelledby={`${inboxTabId}-system-tab`} hidden={inboxTab!=='system'} className="profile-inbox-panel">
                  {/* ── Mensajes del sistema ──────────────────────────── */}
                  <div className="flex items-center justify-between gap-3"><h3 className="text-xs font-bold text-gray-500">Mensajes de MiBatute</h3><button type="button" aria-label="Actualizar buzón" title="Actualizar buzón" disabled={sysMsgsLoading} onClick={loadSysMsgs} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-600 disabled:opacity-40"><RefreshCw size={16} className={sysMsgsLoading?'animate-spin':''} /></button></div>
                  {sysMsgsLoading ? (
                    <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-white border border-gray-100 shadow-sm mb-3">
                      <Loader2 size={14} className="animate-spin text-gray-400" />
                      <span className="text-xs text-gray-400 font-medium">Cargando mensajes…</span>
                    </div>
                  ) : sysMsgs.length > 0 ? (
                    <div className="space-y-2 mb-5">
                      {sysMsgs.map((m) => {
                        const isUnread = !m?.read_at;
                        const sevBadge = {
                          critical: { cls: "bg-gray-100 text-gray-700 ring-1 ring-gray-200", label: "URGENTE" },
                          warning:  { cls: "bg-gray-100 text-gray-700 ring-1 ring-gray-200", label: "AVISO"   },
                          info:     { cls: "bg-gray-100 text-gray-600 ring-1 ring-gray-200", label: "INFO"    },
                        }[m?.severity] || { cls: "bg-gray-100 text-gray-600 ring-1 ring-gray-200", label: "INFO" };
                        const dateStr = m?.created_at
                          ? new Date(m.created_at).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })
                          : "";
                        return (
                          <div
                            key={m.receipt_id}
                            className={`profile-inbox-message relative flex items-center gap-3 px-4 py-3 bg-white rounded-2xl shadow-sm border transition hover:shadow-md cursor-pointer ${isUnread ? "border-gray-300" : "border-gray-100 opacity-70"}`}
                            data-unread={isUnread}
                            onClick={() => {
                              setSysMsgModal(m);
                              if (isUnread) markReceipt(m.receipt_id, "read", m.receipt_kind);
                            }}
                          >
                            {/* punto no leído */}
                            {isUnread && (
                              <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                            )}

                            {/* contenido */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-lg ${sevBadge.cls}`}>
                                  {sevBadge.label}
                                </span>
                                <span className="text-sm font-bold text-gray-800 truncate">
                                  {m?.title || "Mensaje del sistema"}
                                </span>
                              </div>
                              <span className="text-[10px] text-gray-400 font-medium">
                                {dateStr}
                              </span>
                            </div>

                            {/* botones derecha */}
                            <div className="shrink-0 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                title={isUnread ? "Marcar como leído" : "Marcar como no leído"}
                                onClick={() => markReceipt(m.receipt_id, isUnread ? "read" : "unread", m.receipt_kind)}
                                className={`p-2 rounded-xl transition ${isUnread ? "bg-forest-green/10 text-forest-green hover:bg-forest-green hover:text-white" : "bg-gray-100 text-gray-400 hover:bg-gray-200"}`}
                              >
                                <CheckCircle2 size={14} />
                              </button>
                              <button
                                type="button"
                                title="Borrar mensaje"
                                onClick={() => { if (window.confirm("¿Borrar este mensaje? No se puede deshacer.")) markReceipt(m.receipt_id, "delete", m.receipt_kind); }}
                                className="p-2 rounded-xl bg-gray-100 text-gray-700 hover:bg-red-50 hover:text-red-600 transition"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  {/* ── Modal mensaje completo ─────────────────────────────── */}
                  {sysMsgModal && (
                    <div
                      className="marketplace-overlay fixed inset-0 z-[300] bg-black/50 flex items-center justify-center p-4"
                      onClick={() => setSysMsgModal(null)}
                    >
                      <div
                        role="dialog" aria-modal="true" aria-labelledby="system-message-title"
                        data-system-message-receipt={sysMsgModal.receipt_id}
                        className="marketplace-surface marketplace-modal w-full max-w-md max-h-[85dvh] overflow-y-auto bg-white rounded-3xl shadow-2xl p-6 [overflow-wrap:anywhere]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* cabecera */}
                        <div className="flex items-start justify-between gap-3 mb-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className={`inline-flex items-center text-[9px] font-black uppercase px-2 py-0.5 rounded-lg ${
                                { critical: "bg-gray-100 text-gray-700 ring-1 ring-gray-200",
                                  warning:  "bg-gray-100 text-gray-700 ring-1 ring-gray-200",
                                  info:     "bg-gray-100 text-gray-600 ring-1 ring-gray-200" }[sysMsgModal?.severity] || "bg-gray-100 text-gray-600 ring-1 ring-gray-200"
                              }`}>
                                {{ critical: "URGENTE", warning: "AVISO", info: "INFO" }[sysMsgModal?.severity] || "INFO"}
                              </span>
                            </div>
                            <h3 id="system-message-title" className="text-base font-black text-gray-900 leading-snug">
                              {sysMsgModal?.title || "Mensaje del sistema"}
                            </h3>
                            <p className="text-[11px] text-gray-400 font-medium mt-0.5">
                              {sysMsgModal?.created_at
                                ? new Date(sysMsgModal.created_at).toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short" })
                                : ""}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSysMsgModal(null)}
                            aria-label="Cerrar aviso"
                            className="p-2 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 transition shrink-0"
                          >
                            <X size={16} />
                          </button>
                        </div>

                        {/* cuerpo del mensaje */}
                        <div className="bg-gray-50 rounded-2xl p-4 text-sm text-gray-700 font-medium leading-relaxed whitespace-pre-wrap">
                          {sysMsgModal?.message}
                        </div>

                        {/* acciones */}
                        <div className="flex gap-2 mt-4">
                          <button
                            type="button"
                            onClick={() => {
                              markReceipt(sysMsgModal.receipt_id, sysMsgModal.read_at ? "unread" : "read", sysMsgModal.receipt_kind);
                              setSysMsgModal((prev) => prev ? { ...prev, read_at: prev.read_at ? null : new Date().toISOString() } : null);
                            }}
                            className="flex-1 py-2.5 rounded-2xl bg-gray-100 text-gray-800 font-bold text-sm hover:bg-gray-200 transition"
                          >
                            {sysMsgModal?.read_at ? "Marcar no leído" : "Marcar leído"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!window.confirm("¿Borrar este mensaje? No se puede deshacer.")) return;
                              markReceipt(sysMsgModal.receipt_id, "delete", sysMsgModal.receipt_kind);
                              setSysMsgModal(null);
                            }}
                            className="flex-1 py-2.5 rounded-2xl bg-red-50 text-red-700 font-bold text-sm hover:bg-red-100 transition"
                          >
                            Borrar
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Buzón vacío ────────────────────────────────────────── */}
                  {sysMsgs.length === 0 && !sysMsgsLoading && (
                    <div className="text-center py-12">
                      <p className="text-gray-400 font-bold">
                        No tienes avisos del sistema.
                      </p>
                    </div>
                  )}
                  </div>
                </>
              )}

              {/* Nota: Las pestañas "publicaciones" y "rescates" se mantienen igual en tu archivo original.
                 Aquí, por tamaño, no vuelvo a pegar esos bloques completos. */}


              {activeTab === "publicaciones" && (
                <>
                  <ProfileListFilters value={publicationFilters} onChange={setPublicationFilters}
                    count={filteredPublications.length} total={publications.length} />
                  {filteredPublications.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-gray-400 font-bold">
                        {publications.length ? "No hay publicaciones con esos filtros." : "Aún no has publicado nada. ¡Publica tu primer tesoro!"}
                      </p>
                    </div>
                  ) : (
                    publicationListing.items.map((art0, idx) => {
                      const art = getArtEffective(art0);
                      const titulo = art?.titulo || art?.title || "Sin título";
                      const estado = normEstado(art?.estado || art?.status || "disponible");
                      const isReview = estado === "en_revision";
                      const isVencido = isPublicationUnavailable(art, publicationNow);
                      const tipo = getTipoPublicacion(art);

                      const currentId = getArticuloId(art);
                      const selectedId = getArticuloId(articuloSeleccionado);
                      const isLoadingThis =
                        cargandoSolicitudes && selectedId && selectedId === currentId;

                      const isEntregado = estado === "entregado";
      const isPausado = String(art?.estado || art?.status || "").toLowerCase() === "pausado";
                      const isReservado = estado === "reservado";
                      const reservadoAt = art?.updated_at ? new Date(art.updated_at) : null;
                      const diasDesdeReserva = reservadoAt ? Math.floor((Date.now() - reservadoAt.getTime()) / 86400000) : 0;
                      const diasRestantes = isReservado ? Math.max(0, 7 - diasDesdeReserva) : 0;
                      const bloqueadoPorReserva = isReservado && diasRestantes > 0;
                      const isVenta = isVentaArticulo(art);

                      const buyerId = art?.buyer_id || art?.buyerId || null;
                      const hasBuyer = !!buyerId;

                      const hasPosts = currentId
                        ? hasPostulacionesByArticulo.get(String(currentId)) === true
                        : false;
                      const hasChatOwner = currentId
                        ? hasChatOwnerByArticulo.get(String(currentId)) === true
                        : false;

                      const ganadorId =
                        art?.ganador_id ||
                        art?.winner_id ||
                        art?.winnerUid ||
                        art?.recipient_id ||
                        null;
                      const hasWinner = !!ganadorId;

                      const canOpenMsgs =
                        !isReview &&
                        !isUserBlocked &&
                        (isVenta ? hasBuyer || hasChatOwner : hasChatOwner || hasWinner);

                      const statusUI = badgeUIByStatus(isVencido ? 'vencido' : estado);
                      const tipoUI = badgeUIByTipo(tipo);

                      const isDeletingThis =
                        currentId && eliminandoArticuloId === String(currentId);

                      const hasUnread = currentId
                        ? unreadByArticulo.get(String(currentId)) === true
                        : false;

                      const notif = currentId ? notifByArticulo?.[String(currentId)] : null;
                      const hasSolicitudes = !isVenta && (hasPosts || Number(notif?.newSolicitudes || 0) > 0);
                      const canRate = !!currentId && canRateProfileArticle(art);
                      const pendingRating = canRate && !yaCalifique.has(String(currentId));

                      return (
                        <div
                          key={currentId ? `art-${currentId}` : `art-idx-${idx}`}
                          data-profile-article-id={currentId}
                          tabIndex={-1}
                          className={`relative flex flex-wrap items-center gap-4 p-4 mb-3 rounded-3xl shadow-sm border transition focus:outline-2 focus:outline-forest-green focus:outline-offset-2 sm:flex-nowrap ${
                            isEntregado
                              ? "bg-gray-50 border-gray-200 [&>img]:opacity-50 [&>[data-profile-content]>:not([data-rating-notice])]:opacity-50"
                              : isReservado
                              ? "bg-emerald-50 border-emerald-400 ring-1 ring-emerald-200"
                              : hasSolicitudes
                              ? "bg-amber-50 border-amber-400 ring-1 ring-amber-200"
                              : !isVenta && notif?.total
                              ? "bg-orange-50 border-orange-200 ring-1 ring-orange-200"
                              : "bg-white border-gray-100"
                          } ${
                            isEntregado
                              ? "cursor-default"
                              : isReview || isUserBlocked
                              ? "opacity-70 cursor-not-allowed"
                              : "hover:shadow-md cursor-pointer"
                          }`}
                          onClick={() => { if (isEntregado) return;
                            if (isVencido) return;
                            if (isUserBlocked) return alert(blockedUserMsg());
                            if (isReview) return alert(revisionBlockMsg(titulo));

                            if (isVenta) {
                              abrirGestion(art);
                              return;
                            }

                            abrirSolicitudesDeArticulo(art);
                          }}
                        >
                          <img
                            src={getThumb(art)}
                            onError={(e) => {
                              if (e.currentTarget.dataset.fallbackApplied) return;
                              e.currentTarget.dataset.fallbackApplied = "1";
                              e.currentTarget.src = FALLBACK_SVG;
                            }}
                            className="w-16 h-16 rounded-2xl object-cover"
                            alt="miniatura"
                          />

                          <div data-profile-content className="flex-1 min-w-0">
                            {pendingRating && <p data-rating-notice className="profile-rating-notice">Calificación pendiente</p>}
                            <h4 className="font-bold text-gray-800 truncate">{titulo}</h4>
                            {isVenta && hasBuyer && art.buyer_public?.nombre && (
                              <p className="mt-1 truncate text-xs font-semibold text-gray-600">
                                {isEntregado ? "Comprado por" : "Reservado por"} {art.buyer_public.nombre}
                              </p>
                            )}

                            <div className="flex flex-wrap items-center gap-2 mt-1">
                              <span
                                className={`inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-1 rounded-xl ${statusUI.cls}`}
                              >
                                <statusUI.Icon size={12} />
                                {isVencido ? "Vencida" : statusUI.label}
                              </span>

                              <span
                                className={`inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-1 rounded-xl ${tipoUI.cls}`}
                              >
                                <tipoUI.Icon size={12} />
                                {tipoUI.label}
                              </span>

                              <span className="text-[10px] text-gray-400 font-medium uppercase tracking-tighter">
                                {formatDate(art)}
                              </span>
                              <PublicationCountdown article={art} now={publicationNow} />

                              {hasSolicitudes ? (
                                <span className="inline-flex items-center gap-1 bg-orange-100 text-orange-800 ring-1 ring-orange-200 px-2 py-1 rounded-xl text-[10px] font-black uppercase">
                                  <Bell size={12} />
                                  TIENE SOLICITUDES
                                </span>
                              ) : null}

                              {notif?.total ? (
                                <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 ring-1 ring-gray-200 px-2 py-1 rounded-xl text-[10px] font-black uppercase">
                                  {notif.total} NUEVO
                                </span>
                              ) : null}

                              {isPausado ? (
                                <span className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-800 ring-1 ring-yellow-200 px-2 py-1 rounded-xl text-[10px] font-black uppercase">
                                  <Pause size={10} />
                                  PAUSADA
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <fieldset disabled={isUserBlocked} data-profile-actions className={`min-w-0 flex w-full items-center justify-end gap-2 sm:w-auto sm:justify-start ${isEntregado ? "[&>button:not([data-rating-action])]:opacity-50" : ""}`}>
                            {canRate && (
                              <ProfileRatingAction
                                rated={yaCalifique.has(String(currentId))}
                                onClick={() => {
                                  const target = isVenta ? buyerId : ganadorId;
                                  setCalificarModal({ reviewedId: target, articuloId: currentId, rol: "vendedor" });
                                  setCalificarEstrellas(0);
                                }}
                              />
                            )}
                            <button
                              type="button"
                              onPointerDown={(e) => e.stopPropagation()}
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (isUserBlocked) return alert(blockedUserMsg());
                                if (isReview) return alert(revisionBlockMsg(titulo));
                                await verMensajes(art);
                              }}
                              className="relative bg-forest-green/10 text-forest-green p-3 rounded-2xl hover:bg-forest-green hover:text-white transition disabled:opacity-50"
                              disabled={isUserBlocked || isLoadingThis || !canOpenMsgs}
                              aria-label="Ver mensajes"
                            >
                              {(hasUnread || (notif?.unreadChats > 0)) ? (
                                <span aria-hidden="true" className="profile-unread-dot absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-600 ring-2 ring-white" />
                              ) : null}
                              {isLoadingThis ? (
                                <Loader2 className="animate-spin" size={16} />
                              ) : (
                                <MessageCircle size={16} />
                              )}
                            </button>

                            {/* Botón ⭐ Destacar: oculto si ya hay ganador o está entregado */}
                            {!isEntregado && !isVencido && !hasWinner && (() => {
                              const isFeat = featuredOverrides[currentId] ?? art?.is_featured ?? false;
                              return (
                                <button
                                  type="button"
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={(e) => { e.stopPropagation(); toggleDestacado(art); }}
                                  disabled={isUserBlocked || isFeat || destacandoId === currentId}
                                  className={`p-3 rounded-2xl transition ${
                                    isFeat ? "bg-yellow-100 text-yellow-500 cursor-default" : "bg-gray-100 text-gray-400 hover:bg-yellow-50 hover:text-yellow-500 disabled:opacity-50"
                                  }`}
                                  title={isFeat ? "⭐ Publicación destacada" : "Destacar — 1 crédito"}
                                  aria-label={isFeat ? "Publicación destacada" : "Destacar publicación"}
                                >
                                  <Star size={16} fill={isFeat ? "currentColor" : "none"} />
                                </button>
                              );
                            })()}

                            {!isEntregado ? (
                              <button
                                type="button"
                                onPointerDown={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isUserBlocked) return alert(blockedUserMsg());
                                  if (isReview) return alert(revisionBlockMsg(titulo));
                                  if (isReservado) return alert("Este artículo ya tiene un ganador asignado y no puede editarse.");
                                  abrirEditar(art);
                                }}
                                className="bg-gray-100 p-3 rounded-2xl hover:bg-forest-green hover:text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={isReview || isUserBlocked || isReservado}
                                aria-label="Editar"
                                title={isReservado ? "No se puede editar un artículo reservado" : "Editar"}
                              >
                                <Pencil size={16} />
                              </button>
                            ) : null}

                            {!isReservado && !isEntregado && !isVencido && (
                            <button
                              type="button"
                              onPointerDown={(e) => e.stopPropagation()}
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isUserBlocked) return alert(blockedUserMsg());
                                togglePausado(art0);
                              }}
                              disabled={isUserBlocked || isReview}
                              className={`p-3 rounded-2xl transition disabled:opacity-50 ${isPausado ? "bg-yellow-100 text-yellow-700 hover:bg-yellow-500 hover:text-white" : "bg-gray-100 text-gray-600 hover:bg-yellow-100 hover:text-yellow-700"}`}
                              aria-label={isPausado ? "Reactivar publicación" : "Pausar publicación"}
                              title={isPausado ? "Reactivar publicación" : "Pausar publicación"}
                            >
                              {isPausado ? <Play size={16} /> : <Pause size={16} />}
                            </button>
                            )}

                            {/* Botón eliminar: solo si NO está en cuenta regresiva de reserva */}
                            {(isVenta && (isReservado || isEntregado)) || bloqueadoPorReserva ? (
                              <div className="flex flex-col items-center gap-0.5">
                                <button type="button" disabled aria-label="Eliminar publicación"
                                  className="bg-gray-100 text-gray-400 p-3 rounded-2xl cursor-not-allowed"
                                  title={isVenta ? "Se retira de la lista siete días después de confirmar la entrega" : `Se borrará automáticamente en ${diasRestantes} días`}>
                                  <Trash2 size={16} />
                                </button>
                                {!isVenta && <span className="text-[9px] font-bold text-red-300 uppercase tracking-tight leading-none">
                                  {diasRestantes}d
                                </span>}
                              </div>
                            ) : !isEntregado ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <button
                                type="button"
                                onPointerDown={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isUserBlocked) return alert(blockedUserMsg());
                                  if (isReservado) {
                                    const ok = window.confirm("¿Ya entregaste el artículo?\n\nTe recomendamos marcarlo como Entregado antes de borrar, así el rescatador sabe que todo quedó bien.");
                                    if (!ok) return;
                                  } else {
                                    const ok = window.confirm("¿Estás seguro de que quieres eliminar esta publicación? Esta acción no se puede deshacer.");
                                    if (!ok) return;
                                  }
                                  eliminarPublicacion(art);
                                }}
                                disabled={!!isDeletingThis || isUserBlocked}
                                className="bg-red-100 text-red-700 p-3 rounded-2xl hover:bg-red-600 hover:text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
                                aria-label="Eliminar publicación"
                                title="Eliminar publicación"
                              >
                                {isDeletingThis ? (
                                  <Loader2 className="animate-spin" size={16} />
                                ) : (
                                  <Trash2 size={16} />
                                )}
                              </button>
                            </div>
                            ) : isEntregado ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <button
                                type="button"
                                onPointerDown={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const ok = window.confirm("¿Eliminar esta venta del historial?");
                                  if (!ok) return;
                                  eliminarPublicacion(art);
                                }}
                                disabled={isUserBlocked || !!isDeletingThis || pendingRating}
                                className="bg-red-100 text-red-700 p-3 rounded-2xl hover:bg-red-600 hover:text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
                                aria-label="Eliminar publicación"
                                title={pendingRating ? "Califica la transacción antes de eliminar" : "Eliminar publicación"}
                              >
                                {isDeletingThis ? (
                                  <Loader2 className="animate-spin" size={16} />
                                ) : (
                                  <Trash2 size={16} />
                                )}
                              </button>
                            </div>
                            ) : null}
                          </fieldset>
                        </div>
                      );
                    })
                  )}
                </>
              )}

              {activeTab === "publicaciones" && <ProfilePagination {...publicationListing}
                onChange={page => setPublicationPage({ key: publicationPageKey, page })} />}

              {activeTab === "rescates" && (
                <>
                  <ProfileListFilters value={rescateFilters} onChange={setRescateFilters} rescates
                    count={filteredRescates.length} total={rescatesSorted.length} />

                  {cargandoRescates ? (
                    <div className="py-12 text-center text-gray-500 font-bold">
                      Cargando rescates...
                    </div>
                  ) : rescatesError ? (
                    <div className="text-center py-12" role="alert">
                      <p className="text-red-700">{rescatesError}</p>
                      <button type="button" onClick={() => setRescatesReload(value => value + 1)}
                        className="mt-3 text-forest-green font-bold underline">
                        Reintentar
                      </button>
                    </div>
                  ) : filteredRescates.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-gray-400 font-bold">
                        {rescatesSorted.length ? "No hay rescates con esos filtros." : "Aún no tienes rescates. Postúlate a una publicación y te aparecerá aquí."}
                      </p>
                    </div>
                  ) : (
                    rescateListing.items.map((r) => {
                      const art = r?.articulo || {};
                      const titulo = art?.titulo || art?.title || "Sin título";
                      const estado = normEstado(art?.estado || art?.status || "disponible");
                      const isReview = estado === "en_revision";
                      const tipo = getTipoPublicacion(art);
                      const thumb = getThumb(art);

                      const disableKey = r?.id || (r?.articulo_id || getArticuloId(r?.articulo));
                      const isDeletingMine = cancelandoId === `del:${disableKey}`;

                      const articuloId =
                        r?.articulo_id || r?.articuloId || getArticuloId(r?.articulo) || null;
                      const isVenta = isVentaArticulo(art);

                      const hasChatBuyer = articuloId
                        ? hasChatBuyerByArticulo.get(String(articuloId)) === true
                        : false;
                      const isBuyer = String(art?.buyer_id || "") === String(user.id);

                      const ganadorId =
                        art?.ganador_id ||
                        art?.winner_id ||
                        art?.winnerUid ||
                        art?.recipient_id ||
                        null;

                      const isEntregadoRescate = estado === "entregado";
                      const rejectedSale = saleCancellation(r)?.bySeller === true;
                      const rejectedDonation = !!donationRejection(r);
                      const rejectedRescate = rejectedSale || rejectedDonation;
                      const canRate = !!articuloId && !rejectedRescate && canRateProfileArticle(art, { rescates: true, userId: user.id });
                      const pendingRating = canRate && !yaCalifique.has(String(articuloId));

                      // Donación cuya reserva fue cancelada: art volvió a disponible sin ganador
                      const fueReservadoYCancelado =
                        !isVenta &&
                        estado === "disponible" &&
                        r?._chatStatus === "closed" &&
                        !ganadorId;

                      // Para donaciones: chat solo si eres el ganador activo.
                      // hasChatBuyer NO aplica en donaciones porque el chat persiste
                      // aunque el vendedor cancele la reserva.
                      const canOpenMsgsRescate =
                        !isReview &&
                        !isUserBlocked &&
                        canOpenRescateChat(r, user.id, hasChatBuyer);

                      const statusUI = badgeUIByStatus(estado);
                      const tipoUI = badgeUIByTipo(tipo);

                      const hasUnread = articuloId
                        ? unreadByArticulo.get(String(articuloId)) === true
                        : false;

                      return (
                        <div
                          key={r?.id || `${r?.articulo_id}-${r?.created_at}`}
                          data-profile-article-id={articuloId}
                          tabIndex={-1}
                          className={`relative flex items-center gap-4 p-4 mb-3 rounded-3xl shadow-sm border transition focus:outline-2 focus:outline-forest-green focus:outline-offset-2 ${
                            isEntregadoRescate
                              ? "bg-gray-50 border-gray-200 [&>img]:opacity-50 [&>[data-profile-content]>:not([data-rating-notice])]:opacity-50"
                              : rejectedRescate
                              ? "bg-gray-100 border-gray-300 opacity-70"
                              : fueReservadoYCancelado
                              ? "bg-gray-50 border-gray-200 opacity-60"
                              : hasUnread
                                ? "bg-green-50 border-green-200 ring-1 ring-green-200"
                                : "bg-white border-gray-100"
                          } ${
                            isEntregadoRescate || rejectedRescate ? "cursor-default" : fueReservadoYCancelado ? "cursor-default" : isReview || isUserBlocked ? "opacity-80" : "hover:shadow-md"
                          }`}
                        >
                          <img
                            src={thumb}
                            onError={(e) => {
                              if (e.currentTarget.dataset.fallbackApplied) return;
                              e.currentTarget.dataset.fallbackApplied = "1";
                              e.currentTarget.src = FALLBACK_SVG;
                            }}
                            className="w-16 h-16 rounded-2xl object-cover"
                            alt="miniatura"
                          />

                          <div data-profile-content className="flex-1 min-w-0">
                            {pendingRating && <p data-rating-notice className="profile-rating-notice">Calificación pendiente</p>}
                            <h4 className="font-bold text-gray-800 truncate">{titulo}</h4>

                            <div className="flex flex-wrap items-center gap-2 mt-1">
                              {!rejectedRescate && <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-1 rounded-xl ${statusUI.cls}`}>
                                <statusUI.Icon size={12} />
                                {statusUI.label}
                              </span>}

                              <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-1 rounded-xl ${tipoUI.cls}`}>
                                <tipoUI.Icon size={12} />
                                {tipoUI.label}
                              </span>

                              <span className="text-[10px] text-gray-400 font-medium uppercase tracking-tighter">
                                {isVenta ? "Compra / contacto" : "Postulado"}: {formatDateTime(r?.created_at) || "Sin fecha"}
                              </span>

                              {fueReservadoYCancelado && (
                                <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-500 ring-1 ring-gray-300 px-2 py-1 rounded-xl text-[10px] font-black uppercase">
                                  El vendedor canceló la reserva
                                </span>
                              )}

                              {isVenta && r?._chatStatus === "pending" && (
                                <span className="text-xs font-semibold text-amber-800">
                                  Para hablar con el vendedor, él debe aprobar la compra.
                                </span>
                              )}

                              {rejectedSale && (
                                <span className="text-xs font-semibold text-gray-600">
                                  No aprobada por el vendedor
                                </span>
                              )}
                              {rejectedDonation && <span className="text-xs font-semibold text-gray-600">Solicitud rechazada por el donante</span>}

                              {!isVenta && String(ganadorId || "") === String(user?.id || "") && (estado === "reservado" || estado === "entregado") && (
                                <span className="inline-flex items-center gap-1 bg-green-100 text-green-800 ring-1 ring-green-300 px-2 py-1 rounded-xl text-[10px] font-black uppercase animate-pulse">
                                  <CheckCircle2 size={11} />
                                  {estado === "entregado" ? "¡Recibiste esto!" : "¡Fuiste elegido!"}
                                </span>
                              )}
                            </div>

                            {rejectedSale && <p className="mt-1 text-xs text-gray-500">Se retira de Mis Rescates 24 horas después de la cancelación.</p>}
                            {rejectedDonation && <p className="mt-1 text-xs text-gray-500">Desaparece en 24 horas desde el rechazo. Hasta entonces no puedes volver a postularte.</p>}

                            {r?.justificacion ? (
                              <p className="mt-2 text-sm text-gray-600 line-clamp-2">
                                <span className="font-black text-gray-700">Tu mensaje:</span>{" "}
                                {r.justificacion}
                              </p>
                            ) : null}
                          </div>

                          <fieldset disabled={isUserBlocked} data-profile-actions className={`min-w-0 shrink-0 flex items-center gap-2 ${isEntregadoRescate ? "[&>button:not([data-rating-action])]:opacity-50" : ""}`}>
                            {canRate && (
                              <ProfileRatingAction
                                rated={yaCalifique.has(String(articuloId))}
                                onClick={() => {
                                  setCalificarModal({ reviewedId: art.owner_id, articuloId, rol: "ganador" });
                                  setCalificarEstrellas(0);
                                }}
                              />
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                if (isUserBlocked) return alert(blockedUserMsg());
                                if (isReview) return alert(revisionBlockMsg(titulo));
                                verMensajesRescate(r);
                              }}
                              disabled={isUserBlocked || cargandoChatRescate === articuloId || isDeletingMine || !canOpenMsgsRescate}
                              className="relative bg-forest-green/10 text-forest-green p-3 rounded-2xl hover:bg-forest-green hover:text-white transition disabled:opacity-50"
                              aria-label="Ver mensajes"
                              title={isEntregadoRescate ? "Ver historial del chat" : canOpenMsgsRescate ? "Abrir chat" : "Chat disponible al confirmar la reserva"}
                            >
                              {hasUnread ? (
                                <span aria-hidden="true" className="profile-unread-dot absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-600 ring-2 ring-white" />
                              ) : null}
                              {cargandoChatRescate === articuloId ? (
                                <Loader2 className="animate-spin" size={16} />
                              ) : (
                                <MessageCircle size={16} />
                              )}
                            </button>

                            {!isVenta ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setPreviewArt(art);
                                  setPreviewOpen(true);
                                }}
                                className="bg-gray-100 text-gray-700 p-3 rounded-2xl hover:bg-gray-200 transition"
                                aria-label="Ver publicación"
                              >
                                <Eye size={16} />
                              </button>
                            ) : null}

                            <button
                              type="button"
                              onClick={() => {
                                if (isUserBlocked) return alert(blockedUserMsg());
                                if (isReview) return alert(revisionBlockMsg(titulo));
                                eliminarRescate(r);
                              }}
                              disabled={pendingRating || isDeletingMine || isReview || isUserBlocked || rejectedDonation || (isVenta && isBuyer && isRescateSaleLocked(r))}
                              className="bg-red-100 text-red-700 p-3 rounded-2xl hover:bg-red-600 hover:text-white transition disabled:opacity-50"
                              aria-label={isVenta && isBuyer && estado === "reservado" ? "Cancelar compra" : "Eliminar de Mis Rescates"}
                              title={pendingRating ? "Califica la transacción antes de eliminar" : isVenta && isBuyer && isRescateSaleLocked(r) ? "Compra aprobada: se conserva hasta siete días después de la entrega" : isVenta && isBuyer && estado === "reservado" ? "Cancelar compra" : "Eliminar de Mis Rescates"}
                            >
                              {isDeletingMine ? (
                                <Loader2 className="animate-spin" size={16} />
                              ) : (
                                <Trash2 size={16} />
                              )}
                            </button>
                          </fieldset>
                        </div>
                      );
                    })
                  )}
                </>
              )}

              {activeTab === "rescates" && <ProfilePagination {...rescateListing}
                onChange={page => setRescatePage({ key: rescatePageKey, page })} />}
              {activeTab === "rescates" && <RescueLimits purchaseLimit={purchaseLimit} donacionLimit={donacionLimit} />}

</div>
          </div>

          {/* \u2b50 Modal calificación */}
      {calificarModal && (
        <div className="marketplace-overlay fixed inset-0 z-[200] flex items-center justify-center bg-black/50 px-4">
          <div role="dialog" aria-modal="true" aria-label="Calificar experiencia" className="marketplace-surface marketplace-modal marketplace-rating bg-white rounded-3xl p-6 w-full max-w-sm shadow-xl">
            {/* Título */}
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-0.5">Reputación</p>
            <h3 className="text-lg font-black text-gray-900 mb-1">Califica tu experiencia</h3>
            <p className="text-sm text-gray-500 mb-6">
              {calificarModal.rol === "vendedor"
                ? "¿Cómo fue la experiencia con el ganador/rescatador?"
                : "¿Cómo fue la experiencia con el vendedor/donante?"}
            </p>
            {/* Estrellas SVG planas */}
            <div className="flex justify-center gap-2 mb-6">
              {[1,2,3,4,5].map(s => {
                const activa = s <= (calificarHover || calificarEstrellas);
                return (
                  <button key={s} type="button" aria-label={`Calificar con ${s} ${s === 1 ? "estrella" : "estrellas"}`} aria-pressed={calificarEstrellas === s}
                    onMouseEnter={() => setCalificarHover(s)}
                    onMouseLeave={() => setCalificarHover(0)}
                    onClick={() => setCalificarEstrellas(s)}
                    className="p-1 transition-transform hover:scale-110 focus:outline-none">
                    <svg width="36" height="36" viewBox="0 0 24 24"
                      fill={activa ? "#1a7a4a" : "none"}
                      stroke={activa ? "#1a7a4a" : "#D1D5DB"}
                      strokeWidth="1.5"
                      xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinejoin="round" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    </svg>
                  </button>
                );
              })}
            </div>
            {/* Label selección */}
            <p className="text-center text-xs font-black text-gray-400 uppercase tracking-wide mb-5">
              {calificarEstrellas === 0 && "Selecciona una calificación"}
              {calificarEstrellas === 1 && "Mala experiencia"}
              {calificarEstrellas === 2 && "Regular"}
              {calificarEstrellas === 3 && "Buena"}
              {calificarEstrellas === 4 && "Muy buena"}
              {calificarEstrellas === 5 && "Excelente"}
            </p>
            <div className="flex gap-3">
              <button type="button"
                onClick={() => { setCalificarModal(null); setCalificarEstrellas(0); }}
                className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-600 font-black text-sm hover:bg-gray-200 transition">
                Ahora no
              </button>
              <button type="button"
                disabled={calificarEstrellas < 1 || calificarLoading}
                onClick={enviarCalificacion}
                className="flex-1 py-3 rounded-2xl bg-forest-green text-white font-black text-sm hover:brightness-110 transition disabled:opacity-30">
                {calificarLoading ? "Enviando..." : "Enviar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {typeof onOpenGestion !== "function" && (
            <ManageArticleModal
              isOpen={!!managingProduct}
              article={managingProduct}
              onClose={() => setManagingProduct(null)}
            />
          )}
        </div>
      </div>

      <ModalSolicitudes
        isOpen={modalSolicitudesAbierto}
        onClose={() => setModalSolicitudesAbierto(false)}
        articulo={articuloSeleccionado}
        solicitudes={solicitudesDelArticulo}
        loading={cargandoSolicitudes}
        userIdOwner={user?.id}
        onArticuloUpdated={(nuevoArticulo) => {
          const id = getArticuloId(nuevoArticulo);
          if (id) {
            setArticuloOverridesById((prev) => {
              const next = new Map(prev);
              next.set(String(id), nuevoArticulo);
              return next;
            });
          }
          setArticuloSeleccionado(nuevoArticulo);
          onArticuloReservado?.(nuevoArticulo);
        }}
        onAfterDecision={refreshSolicitudesArticuloSeleccionado}
        onOpenChat={onOpenChat}
        yaCalifique={yaCalifique}
        onAbrirCalificar={(data) => { setCalificarModal(data); setCalificarEstrellas(0); }}
      />

      {/* ✅ MODAL: Confirmar eliminación de cuenta */}
      {deleteModalOpen ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              if (deletingAccount) return;
              setDeleteModalOpen(false);
            }}
            aria-label="Cerrar"
          />

          <div className="marketplace-surface marketplace-modal relative w-full max-w-md bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
            <div className="p-5 border-b">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                Solicitar cierre y supresión
              </p>
              <h3 className="text-lg font-black text-gray-900">Confirmación requerida</h3>
              <p className="mt-2 text-sm text-gray-600 font-medium">
                Registraremos tu solicitud para revisar el cierre y la supresión de datos. No ejecuta un borrado ni un bloqueo inmediato. Podrá conservarse información únicamente con un fundamento y plazo aplicables. Para confirmar, escribe tu correo:
              </p>
              <p className="mt-1 text-sm font-black text-gray-900 break-all">
                {emailReadonly || "—"}
              </p>
            </div>

            <div className="p-5 space-y-3">
              <label className="text-[10px] font-black uppercase text-gray-400 ml-2">
                Escribe tu correo para confirmar
              </label>

              <input
                value={deleteEmailInput}
                onChange={(e) => setDeleteEmailInput(e.target.value)}
                placeholder="tu-correo@ejemplo.com"
                className="w-full p-3 rounded-2xl bg-gray-50 border-none outline-none focus:ring-2 focus:ring-forest-green"
                disabled={deletingAccount}
                autoFocus
              />

              <p className="text-xs text-gray-500 font-bold">
                Esto borrará tu perfil y datos asociados.
              </p>

              <div className="pt-2 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (deletingAccount) return;
                    setDeleteModalOpen(false);
                  }}
                  className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-black uppercase transition"
                  disabled={deletingAccount}
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    try {
                      setDeletingAccount(true);

                      const emailTyped = String(deleteEmailInput || "").trim().toLowerCase();
                      const emailReal = String(emailReadonly || "").trim().toLowerCase();

                      if (!emailTyped) {
                        alert("Escribe tu correo para confirmar.");
                        return;
                      }

                      if (emailTyped !== emailReal) {
                        alert("El correo no coincide.");
                        return;
                      }

                      // Registro trazable de la solicitud; no promete un borrado automático.
                      if(!deletionRequestRef.current)deletionRequestRef.current=crypto.randomUUID();
                      const { data, error } = await supabase.rpc("submit_data_request", {
                        p_request:deletionRequestRef.current,p_kind:'deletion',p_body:'Solicito el cierre de mi cuenta y la supresión de mis datos personales. Informen qué información se elimina o anonimiza y el fundamento y plazo de lo que deba conservarse.',
                      });



                      if (error) {
                        alert(error.message || "No se pudo registrar la solicitud. Inténtalo de nuevo o escribe al correo de atención.");
                        return;
                      }

                      if (!data) {
                        alert("No se pudo registrar: " + (data?.error || "Error desconocido"));
                        return;
                      }

                      alert(`Solicitud registrada. Radicado: ${data}. Puedes consultar su estado en Solicitudes de datos. La cuenta y sus datos todavía no se han eliminado.`);
                      setDeleteModalOpen(false);
                      window.location.href = '/datos-personales';
                    } catch (e) {
                      console.error(e);
                      alert("Error inesperado.");
                    } finally {
                      setDeletingAccount(false);
                    }
                  }}
                  disabled={
                    deletingAccount ||
                    String(deleteEmailInput || "").trim().toLowerCase() !==
                      String(emailReadonly || "").trim().toLowerCase()
                  }
                  className="px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-black uppercase hover:brightness-110 transition disabled:opacity-50"
                >
                  Registrar solicitud
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Modal previsualización */}
      {previewOpen && previewArt ? (
        <div
          className="marketplace-overlay fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => {
            setPreviewOpen(false);
            setPreviewArt(null);
          }}
        >
          <div
            className="marketplace-surface marketplace-modal w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <div className="font-black text-gray-800 truncate pr-3">Previsualización</div>
              <button
                type="button"
                className="p-2 rounded-xl hover:bg-gray-100 transition"
                onClick={() => {
                  setPreviewOpen(false);
                  setPreviewArt(null);
                }}
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 grid md:grid-cols-2 gap-4">
              <div className="rounded-3xl overflow-hidden bg-black relative aspect-square">
                <img
                  src={getThumb(previewArt)}
                  alt={previewArt?.titulo || previewArt?.title || "publicación"}
                  className="absolute inset-0 w-full h-full object-cover"
                  onError={(e) => {
                    if (e.currentTarget.dataset.fallbackApplied) return;
                    e.currentTarget.dataset.fallbackApplied = "1";
                    e.currentTarget.src = FALLBACK_SVG;
                  }}
                />
              </div>

              <div className="min-w-0">
                <div className="text-xs font-black uppercase tracking-widest text-gray-500">
                  {getTipoPublicacion(previewArt)}
                </div>
                <div className="text-xl font-black text-gray-900 mt-1 break-words">
                  {previewArt?.titulo || previewArt?.title || "Sin título"}
                </div>

                <div className="mt-2 text-sm text-gray-600">
                  {(previewArt?.ciudad || previewArt?.city || "") +
                    (previewArt?.localidad || previewArt?.locality ? `, ${previewArt?.localidad || previewArt?.locality}` : "")}
                </div>

                {isVentaArticulo(previewArt) && (previewArt?.precio || previewArt?.price) ? (
                  <div className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-2xl bg-emerald-50 border border-emerald-100">
                    <span className="text-xs font-black uppercase text-emerald-800">Precio</span>
                    <span className="text-base font-black text-emerald-900">
                      {formatMoney(previewArt?.precio ?? previewArt?.price)}
                    </span>
                  </div>
                ) : null}

                <div className="mt-3">
                  <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                    Descripción
                  </div>
                  <div className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">
                    {previewArt?.descripcion || previewArt?.description || "Sin descripción"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
