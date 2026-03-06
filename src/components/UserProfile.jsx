// src/components/UserProfile.jsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { getProfile, updateProfile } from "../supabase/profileService";
import {
  Camera,
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
  Bell,
  AlertTriangle,
  Eye,
  X,
  Inbox,
} from "lucide-react";
import { LOCATIONS } from "../data/locations";
import ManageArticleModal from "./ManageArticleModal";

// ✅ IMPORT CORRECTO
import {
  obtenerPostulaciones,
  eliminarSolicitudCompradorYChat,
} from "../supabase/solicitudesService";

// ✅ servicio para Mis Rescates
import { obtenerMisRescates } from "../supabase/rescatesService";

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
  const raw =
    art?.tipo ??
    art?.mode ??
    art?.tipo_publicacion ??
    art?.tipo_publicación ??
    "";
  const t = String(raw || "").toLowerCase().trim();
  return t === "venta" || t.includes("venta");
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
    return await q.select("*").maybeSingle();
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
    art?.tipo_publicacion ??
    art?.tipo ??
    art?.tipo_articulo ??
    art?.tipo_publicación ??
    art?.publication_type ??
    art?.type ??
    art?.categoria ??
    art?.category ??
    art?.modo ??
    art?.modalidad ??
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
}) {
  const [updatingKey, setUpdatingKey] = useState(null);

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

  const deleteChatForUser = async (targetUserId) => {
    if (!articuloId || !targetUserId) return;

    let chatIds = [];

    const tryFetchChats = async (orExpr) => {
      const { data, error } = await supabase
        .from("chats")
        .select("id")
        .eq("articulo_id", articuloId)
        .or(orExpr);
      if (error) return { data: null, error };
      return { data, error: null };
    };

    let res = await tryFetchChats(`buyer_id.eq.${targetUserId},seller_id.eq.${targetUserId}`);
    if (res.error?.message && /Could not find the 'seller_id' column/i.test(res.error.message)) {
      res = await tryFetchChats(`buyer_id.eq.${targetUserId},owner_id.eq.${targetUserId}`);
    }
    if (res.error?.message && /Could not find the 'owner_id' column/i.test(res.error.message)) {
      res = await tryFetchChats(`buyer_id.eq.${targetUserId},usuario_id.eq.${targetUserId}`);
    }
    if (res.error?.message && /Could not find the 'buyer_id' column/i.test(res.error.message)) {
      res = await tryFetchChats(`usuario_id.eq.${targetUserId}`);
    }

    if (res.error) {
      console.log("Warn fetch chats:", res.error);
      return;
    }

    chatIds = (res.data || []).map((c) => c?.id).filter(Boolean);
    if (!chatIds.length) return;

    try {
      const { error: delMsgsErr } = await supabase
        .from("chat_messages")
        .delete()
        .in("chat_id", chatIds);
      if (delMsgsErr) console.log("Warn delete chat_messages:", delMsgsErr);
    } catch (e) {
      console.log("Delete chat_messages catch:", e);
    }

    try {
      const { error: delChatsErr } = await supabase
        .from("chats")
        .delete()
        .in("id", chatIds);
      if (delChatsErr) console.log("Warn delete chats:", delChatsErr);
    } catch (e) {
      console.log("Delete chats catch:", e);
    }
  };

  const cleanupChatsExceptWinner = async (winnerUserId) => {
    if (!articuloId) return;

    try {
      const { data: chats, error: chErr } = await supabase
        .from("chats")
        .select("id,buyer_id")
        .eq("articulo_id", articuloId);

      if (chErr) {
        console.log("Warn list chats:", chErr);
        return;
      }

      const deleteIds = (chats || [])
        .filter((c) => String(c?.buyer_id || "") !== String(winnerUserId || ""))
        .map((c) => c?.id)
        .filter(Boolean);

      if (!deleteIds.length) return;

      const { error: delMsgErr } = await supabase
        .from("chat_messages")
        .delete()
        .in("chat_id", deleteIds);
      if (delMsgErr) console.log("Warn delete chat_messages:", delMsgErr);

      const { error: delChatErr } = await supabase
        .from("chats")
        .delete()
        .in("id", deleteIds);
      if (delChatErr) console.log("Warn delete chats:", delChatErr);
    } catch (e) {
      console.log("Cleanup chats catch:", e);
    }
  };

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

      const { error: delErr } = await supabase
        .from("postulaciones")
        .delete()
        .eq("articulo_id", articuloId)
        .neq("usuario_id", targetUserId);

      if (delErr) {
        console.log("No se pudieron borrar otras postulaciones (RLS?):", delErr);
      }

      await cleanupChatsExceptWinner(targetUserId);

      onArticuloUpdated?.(data || { ...articulo, ganador_id: targetUserId, estado: "reservado", status: "reservado" });
      onAfterDecision?.();

      alert("✅ Seleccionado. El artículo quedó reservado y los demás quedaron removidos.");
      onClose?.();
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

      alert("✅ Entrega marcada. El chat queda visible (solo lectura).");
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
      `¿Rechazar la solicitud de ${displayName}?\n\nSe eliminará su postulación y TAMBIÉN el chat/mensajes (si existen) para que si vuelve a postular sea como primera vez.`
    );
    if (!ok) return;

    const key = `${articuloId}:${targetUserId}:reject`;

    try {
      setUpdatingKey(key);

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

      await deleteChatForUser(targetUserId);

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
      <button type="button" onClick={onClose} className="absolute inset-0 bg-black/40" aria-label="Cerrar modal" />

      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
        <div className="p-5 border-b flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
              Postulaciones
            </p>
            <h3 className="text-lg font-black text-gray-900 truncate">{titulo}</h3>

            {!isVenta && (
              <p className="mt-1 text-[11px] text-gray-500 font-bold">
                {hasWinner ? "✅ Ya hay un usuario seleccionado." : "Selecciona a quién entregarlo (regalo / donación)."}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-2xl bg-gray-100 hover:bg-gray-200 font-black text-xs uppercase"
          >
            Cerrar
          </button>
        </div>

        <div className="p-5 max-h-[70vh] overflow-auto">
          {loading ? (
            <div className="py-10 text-center text-gray-500 font-bold">Cargando...</div>
          ) : isVenta ? (
            <div className="py-10 text-center text-gray-500 font-bold">
              Este modal es para regalo/donación.
            </div>
          ) : hasWinner ? (
            <div className="space-y-3">
              <div className="bg-green-50 border border-green-100 rounded-3xl p-4">
                <p className="text-sm font-black text-green-800 uppercase">
                  {normEstado(articulo?.estado || articulo?.status || "disponible") === "entregado"
                    ? "Entregado ✅"
                    : "Seleccionado ✅"}
                </p>
                <p className="text-xs text-green-700 mt-1 font-bold">
                  {normEstado(articulo?.estado || articulo?.status || "disponible") === "entregado"
                    ? "Transacción cerrada. El chat debe abrirse para ver historial, pero debe quedar en solo lectura."
                    : "Los demás interesados no deben ver a quién fue elegido."}
                </p>
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
                      className="p-4 rounded-3xl border border-gray-100 bg-forest-green/10"
                    >
                      <div className="flex items-start gap-3">
                        <div className="shrink-0">
                          {foto ? (
                            <img
                              src={foto}
                              alt={nombre}
                              className="w-10 h-10 rounded-full object-cover border border-white shadow"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center font-black text-gray-600">
                              {String(nombre).charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-black text-gray-900 truncate">{nombre}</p>
                            {fecha ? (
                              <span className="text-[10px] font-black uppercase text-gray-400 whitespace-nowrap">
                                {fecha}
                              </span>
                            ) : null}
                          </div>

                          <p className="mt-2 text-sm text-gray-700 font-medium leading-relaxed whitespace-pre-wrap">
                            {mensaje}
                          </p>

                          {normEstado(articulo?.estado || articulo?.status || "disponible") === "entregado" ? null : (
                            <div className="mt-3 flex items-center gap-2">
                              <button
                                type="button"
                                onClick={marcarComoEntregado}
                                disabled={updatingKey === `${articuloId}:deliver`}
                                className="bg-gray-900 text-white px-3 py-2 rounded-2xl text-[10px] font-black uppercase hover:brightness-110 transition disabled:opacity-50"
                              >
                                {updatingKey === `${articuloId}:deliver` ? "Marcando..." : "Marcar como entregado"}
                              </button>

                              <button
                                type="button"
                                onClick={cancelarEntrega}
                                disabled={updatingKey === `${articuloId}:cancel`}
                                className="bg-red-100 text-red-700 px-3 py-2 rounded-2xl text-[10px] font-black uppercase hover:brightness-110 transition disabled:opacity-50"
                              >
                                {updatingKey === `${articuloId}:cancel` ? "Cancelando..." : "Cancelar entrega"}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
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
            <div className="space-y-3">
              {solicitudesVisibles.map((s) => {
                const { nombre, foto, userId } = getUserFromSolicitud(s);
                const mensaje =
                  s?.justificacion || s?.mensaje || s?.message || "(Sin justificación)";
                const fecha = formatDateTime(s?.created_at);

                const isBusyElegir = updatingKey === `${articuloId}:${userId}`;
                const isBusyRechazar = updatingKey === `${articuloId}:${userId}:reject`;

                return (
                  <div
                    key={s?.id || `${nombre}-${fecha}`}
                    className="p-4 rounded-3xl border border-gray-100 bg-gray-50"
                  >
                    <div className="flex items-start gap-3">
                      <div className="shrink-0">
                        {foto ? (
                          <img
                            src={foto}
                            alt={nombre}
                            className="w-10 h-10 rounded-full object-cover border border-white shadow"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center font-black text-gray-600">
                            {String(nombre).charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-black text-gray-900 truncate">{nombre}</p>
                          {fecha ? (
                            <span className="text-[10px] font-black uppercase text-gray-400 whitespace-nowrap">
                              {fecha}
                            </span>
                          ) : null}
                        </div>

                        <p className="mt-2 text-sm text-gray-700 font-medium leading-relaxed whitespace-pre-wrap">
                          {mensaje}
                        </p>

                        <div className="mt-3 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => entregarAUsuario(userId)}
                            disabled={isBusyElegir || isBusyRechazar || !userId}
                            className="bg-forest-green/15 text-forest-green px-3 py-2 rounded-2xl text-[10px] font-black uppercase hover:brightness-110 transition disabled:opacity-50"
                          >
                            {isBusyElegir ? "Seleccionando..." : "Elegir a este usuario"}
                          </button>

                          <button
                            type="button"
                            onClick={() => rechazarSolicitud(userId, nombre)}
                            disabled={isBusyElegir || isBusyRechazar || !userId}
                            className="bg-red-100 text-red-700 px-3 py-2 rounded-2xl text-[10px] font-black uppercase hover:bg-red-600 hover:text-white transition disabled:opacity-50"
                          >
                            {isBusyRechazar ? "Rechazando..." : "Rechazar solicitud"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-10 text-center text-gray-500 font-bold">
              No hay postulaciones para este artículo aún.
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
        .select("*")
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
  user,
  myProducts = [],
  notifByArticulo = {},
  onArticuloSeen,
  onBack,
  onOpenEdit,
  onOpenGestion,
  onOpenChat,
  onDelete,
  onArticuloReservado,
}) {
  const [activeTab, setActiveTab] = useState("publicaciones"); // ✅ ahora inicia en Buzón
  const [authEmail, setAuthEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ✅ eliminar cuenta (modal)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteEmailInput, setDeleteEmailInput] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);

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
  const [cargandoRescates, setCargandoRescates] = useState(false);

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
    return articuloOverridesById.get(String(id)) || art;
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

  // ✅ BLOQUEO REAL desde tabla usuarios
  const [isUserBlocked, setIsUserBlocked] = useState(false);

  useEffect(() => {
    if (!user?.id) return;

    let alive = true;

    (async () => {
      const { data, error } = await supabase
        .from("usuarios")
        .select("is_blocked")
        .eq("id", user.id)
        .maybeSingle();

      if (!alive) return;

      if (!error && data) {
        setIsUserBlocked(!!data.is_blocked);
      }
    })();

    return () => {
      alive = false;
    };
  }, [user?.id]);

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

  // ✅ REALTIME bloqueo / desbloqueo instantáneo
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`realtime-user-block-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "usuarios",
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          const newRow = payload.new;
          if (typeof newRow?.is_blocked !== "undefined") {
            setIsUserBlocked(!!newRow.is_blocked);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const loadUnreadForArticuloIds = useCallback(
    async (articuloIds = []) => {
      if (!user?.id) return;

      const ids = (Array.isArray(articuloIds) ? articuloIds : [])
        .map(String)
        .filter(Boolean);
      if (!ids.length) {
        setUnreadByArticulo(new Map());
        return;
      }

      const { data: chats, error: chatErr } = await selectChatsForArticuloIds(ids);

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

      const { data: reads, error: readErr } = await supabase
        .from("chat_reads")
        .select("chat_id,last_read_at")
        .eq("user_id", user.id)
        .in("chat_id", chatIds);

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
    async ({ articuloId, buyerId }) => {
      if (!user?.id || !articuloId) return;

      let q = supabase.from("chats").select("id,articulo_id,buyer_id,seller_id").eq("articulo_id", articuloId);
      if (buyerId) q = q.eq("buyer_id", buyerId);

      let res = await q.maybeSingle();

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

  // ✅ Carga rescates — recarga al hacer clic en la pestaña
  useEffect(() => {
    if (!user?.id) return;

    let alive = true;

    const normalizarRescate = (row) => {
      const articulo = row?.articulo || row?.articulos || row?.article || null;
      const articulo_id = row?.articulo_id || row?.articuloId || getArticuloId(articulo) || null;

      return {
        ...row,
        articulo_id,
        articulo: articulo || row?.articulo || null,
      };
    };

    const filtrarVisibleParaUsuario = (list) => {
      return (Array.isArray(list) ? list : []).filter((r) => {
        const art = r?.articulo || {};
        const estado = normEstado(art?.estado || art?.status || "");
        const isVenta = isVentaArticulo(art);

        if (!isVenta) {
          const ganadorId =
            art?.ganador_id || art?.winner_id || art?.winnerUid || art?.recipient_id || null;

          if ((estado === "reservado" || estado === "entregado") && ganadorId) {
            return String(ganadorId) === String(user.id);
          }

          return true;
        }

        const buyerId = art?.buyer_id || art?.buyerId || null;
        const isBuyer = String(buyerId || "") === String(user.id);
        return isBuyer && (estado === "reservado" || estado === "entregado" || estado === "en_revision");
      });
    };

    const mergeUnicosPorArticulo = (a = [], b = []) => {
      const map = new Map();
      [...a, ...b].forEach((item) => {
        const rr = normalizarRescate(item);
        const key = String(rr?.articulo_id || getArticuloId(rr?.articulo) || rr?.id || "").trim();
        if (!key) return;

        if (!map.has(key)) {
          map.set(key, rr);
        } else {
          const prev = map.get(key);
          const prevHasArt = !!prev?.articulo;
          const nextHasArt = !!rr?.articulo;
          if (!prevHasArt && nextHasArt) map.set(key, rr);
        }
      });
      return Array.from(map.values());
    };

    const cargarPostulacionesConArticulo = async () => {
      const { data, error } = await supabase
        .from("postulaciones")
        .select("id, articulo_id, created_at, justificacion, articulo:articulos(*)")
        .eq("usuario_id", user.id)
        .order("created_at", { ascending: false });

      if (!error) {
        return (Array.isArray(data) ? data : []).map((p) => ({
          id: p.id,
          articulo_id: p.articulo_id,
          created_at: p.created_at,
          justificacion: p.justificacion,
          articulo: p.articulo || null,
        }));
      }

      const { data: posts, error: err2 } = await supabase
        .from("postulaciones")
        .select("id, articulo_id, created_at, justificacion")
        .eq("usuario_id", user.id)
        .order("created_at", { ascending: false });

      if (err2) return [];

      const ids = (Array.isArray(posts) ? posts : []).map((p) => p.articulo_id).filter(Boolean);

      if (!ids.length) {
        return (Array.isArray(posts) ? posts : []).map((p) => ({
          id: p.id,
          articulo_id: p.articulo_id,
          created_at: p.created_at,
          justificacion: p.justificacion,
          articulo: null,
        }));
      }

      const { data: arts, error: err3 } = await supabase.from("articulos").select("*").in("id", ids);
      if (err3) return [];

      const artMap = new Map((Array.isArray(arts) ? arts : []).map((a) => [String(a.id), a]));

      return (Array.isArray(posts) ? posts : []).map((p) => ({
        id: p.id,
        articulo_id: p.articulo_id,
        created_at: p.created_at,
        justificacion: p.justificacion,
        articulo: artMap.get(String(p.articulo_id)) || null,
      }));
    };

    (async () => {
      setCargandoRescates(true);

      try {
        const { data: dataService, error: errorService } = await obtenerMisRescates(user.id);
        const postulaciones = await cargarPostulacionesConArticulo();

        if (!alive) return;

        const listService = errorService ? [] : Array.isArray(dataService) ? dataService : [];
        const merged = mergeUnicosPorArticulo(listService, postulaciones);

        const filtrados = filtrarVisibleParaUsuario(merged);
        setRescates(filtrados);

        const rescateIds = filtrados
          .map((r) => r?.articulo_id || r?.articuloId || getArticuloId(r?.articulo))
          .filter(Boolean);

        await loadUnreadRef.current?.(rescateIds);
      } catch (e) {
        console.error("Error cargando rescates (merge):", e);
        if (alive) setRescates([]);
      } finally {
        if (alive) setCargandoRescates(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [user?.id]);

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
    if (Array.isArray(myProducts)) return myProducts;
    if (Array.isArray(myProducts?.data)) return myProducts.data;
    if (Array.isArray(myProducts?.items)) return myProducts.items;
    return [];
  }, [myProducts]);

  const publications = useMemo(() => {
    const base = [...(safeMyProducts || [])]
      .filter((a) => {
        const id = getArticuloId(a);
        if (!id) return true;
        return !deletedIds.has(String(id));
      })
      .sort((a, b) => {
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
  }, [safeMyProducts, deletedIds]);

  // ✅ maps publicaciones + unread (robusto)
  useEffect(() => {
    if (!user?.id) return;
    if (activeTab !== "publicaciones" && activeTab !== "buzon") return;

    const ids = (publications || []).map(getArticuloId).filter(Boolean);
    if (!ids.length) {
      setHasPostulacionesByArticulo(new Map());
      setHasChatOwnerByArticulo(new Map());
      setUnreadByArticulo(new Map());
      return;
    }

    let alive = true;

    (async () => {
      try {
        const { data: postRows, error: postErr } = await supabase
          .from("postulaciones")
          .select("articulo_id")
          .in("articulo_id", ids);
        if (postErr) console.log("Warn postulaciones map:", postErr);

        const { data: chats, error: chatErr } = await selectChatsForArticuloIds(ids);
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

        await loadUnreadForArticuloIds(ids);
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
  }, [activeTab, user?.id, publications, loadUnreadForArticuloIds]);

  // ✅ maps rescates + unread (buyer)
  useEffect(() => {
    if (!user?.id) return;
    if (activeTab === "publicaciones") return; // solo corre en rescates o buzon

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
        const { data: chatRows, error: chatErr } = await supabase
          .from("chats")
          .select("articulo_id")
          .in("articulo_id", ids)
          .eq("buyer_id", user.id);

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
  }, [activeTab, user?.id, rescates, loadUnreadForArticuloIds]);

  // ✅ REALTIME: mensajes + solicitudes en vivo
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel("realtime-userprofile-v3-" + user.id)

      // Mensaje nuevo en chat → refrescar unread del artículo
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (payload) => {
        const chatId = payload?.new?.chat_id;
        if (!chatId) return;
        if (String(payload?.new?.sender_id || "") === String(user.id)) return;
        supabase.from("chats").select("articulo_id").eq("id", chatId).maybeSingle()
          .then(({ data }) => {
            if (data?.articulo_id) {
              // Incremento optimista inmediato
              setUnreadByArticulo((prev) => {
                const next = new Map(prev);
                const aid = String(data.articulo_id);
                next.set(aid, true);
                return next;
              });
              loadUnreadForArticuloIds([data.articulo_id]);
            }
          });
      })

      // Chat actualizado → refrescar unread
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chats" }, (payload) => {
        const articuloId = payload?.new?.articulo_id;
        if (articuloId) loadUnreadForArticuloIds([articuloId]);
      })

      // Nueva solicitud/postulación → el padre maneja notifByArticulo vía su propio realtime
      // pero hacemos un evento personalizado para forzar re-render del badge
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "postulaciones" }, (payload) => {
        const articuloId = payload?.new?.articulo_id;
        if (!articuloId) return;
        // Forzar re-check de publicaciones del usuario (el padre actualizará notifByArticulo)
        loadUnreadForArticuloIds([articuloId]);
      })


      // DELETE en postulaciones → quitar rescate inmediatamente sin F5
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "postulaciones" }, () => {
        supabase
          .from("postulaciones")
          .select("articulo_id")
          .eq("usuario_id", user.id)
          .then(({ data }) => {
            const activos = new Set((data || []).map((p) => String(p.articulo_id)));
            setRescates((prev) =>
              prev.filter((r) => activos.has(String(r?.articulo_id || r?.articuloId || "")))
            );
          });
      })

      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  // ── Cargar mensajes del sistema ──────────────────────────────────────────
  const loadSysMsgs = useCallback(async () => {
    if (!user?.id) return;
    setSysMsgsLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_my_inbox");
      if (error) throw error;
      setSysMsgs(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn("loadSysMsgs warn:", e?.message || e);
      setSysMsgs([]);
    } finally {
      setSysMsgsLoading(false);
    }
  }, [user?.id]);

  const markReceipt = useCallback(async (receiptId, action) => {
    try {
      const { error } = await supabase.rpc("mark_receipt", {
        p_receipt_id: receiptId,
        p_action: action,
      });
      if (error) throw error;
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
  }, []);

  // Carga inicial al montar — necesario para mostrar el badge sin entrar al buzón
  useEffect(() => {
    if (user?.id) loadSysMsgs();
  }, [user?.id, loadSysMsgs]);



  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel("sys-msgs-" + user.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "system_message_receipts", filter: "user_id=eq." + user.id }, () => { loadSysMsgs(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, loadSysMsgs]);

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

  const inboxUnreadCount = useMemo(() => {
    return (Array.isArray(sysMsgs) ? sysMsgs : []).filter((m) => !m?.read_at).length;
  }, [sysMsgs]);

  // Badge de Mis Publicaciones: mensajes sin leer + solicitudes nuevas
  const pubNotifCount = useMemo(() => {
    let n = 0;
    (publications || []).forEach((art0) => {
      const id = String(getArticuloId(getArtEffective(art0)) || "");
      if (!id) return;
      if (unreadByArticulo.get(id) === true) n++;
      n += Number(notifByArticulo?.[id]?.total || 0);
    });
    return n;
  }, [publications, unreadByArticulo, notifByArticulo, articuloOverridesById]);

  // Badge de Mis Rescates: mensajes sin leer
  const rescNotifCount = useMemo(() => {
    let n = 0;
    (rescates || []).forEach((r) => {
      const art = r?.articulo || {};
      const id = String(r?.articulo_id || r?.articuloId || getArticuloId(art) || "");
      if (id && unreadByArticulo.get(id) === true) n++;
      // +1 si fue elegido ganador y el artículo está reservado (donación)
      const estado = normEstado(art?.estado || art?.status || "");
      const ganadorId = art?.ganador_id || art?.winner_id || art?.winnerUid || art?.recipient_id || null;
      const isVenta = isVentaArticulo(art);
      if (!isVenta && ganadorId && String(ganadorId) === String(user?.id || "") && estado === "reservado") n++;
    });
    return n;
  }, [rescates, unreadByArticulo, user?.id]);

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
      await markChatAsRead({ articuloId, buyerId: buyerId || null });
      onOpenChat({ article: art, buyerId: buyerId || null });
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

    const isVenta = isVentaArticulo(art);

    if (isVenta) {
      onArticuloSeen?.(articuloId);
      await markChatAsRead({ articuloId, buyerId: user.id });
      onOpenChat({ article: art, buyerId: user.id });
      return;
    }

    // Usar hasChatBuyerByArticulo ya cargado en memoria (evita re-query con posibles RLS)
    const hasChatActivo = hasChatBuyerByArticulo.get(String(articuloId)) === true;
    const ganadorId = art?.ganador_id || art?.winner_id || art?.winnerUid || art?.recipient_id || null;
    const estado = normEstado(art?.estado || art?.status || "disponible");
    const isGanador = String(ganadorId || "") === String(user.id) &&
      (estado === "reservado" || estado === "entregado");

    if (!hasChatActivo && !isGanador) return;

    try {
      setCargandoChatRescate(articuloId);
      onArticuloSeen?.(articuloId);
      await markChatAsRead({ articuloId, buyerId: user.id });
      onOpenChat({ article: art, buyerId: user.id });
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

    const ok = confirm(`¿Quitar de “Mis Rescates”? \n\n"${titulo}"\n\nEsto eliminará tu solicitud y el chat/mensajes.`);
    if (!ok) return;

    const disableKey = rescate?.id || articuloId;
    const key = `del:${disableKey}`;

    try {
      setCancelandoId(key);

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
    const next = !current?.pausado;
    try {
      const { error } = await supabase
        .from("articulos")
        .update({ pausado: next })
        .eq("id", id);
      if (error) throw error;
      setArticuloOverridesById((prev) => {
        const m = new Map(prev);
        const base = m.get(String(id)) || art;
        m.set(String(id), { ...base, pausado: next });
        return m;
      });
    } catch (e) {
      console.error("togglePausado error:", e);
      alert("No se pudo " + (next ? "pausar" : "reactivar") + " la publicación.");
    }
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
    <div className="max-w-5xl mx-auto p-4 animate-in slide-in-from-bottom-4 duration-300">
      <button
        onClick={onBack}
        className="mb-6 text-forest-green font-bold flex items-center gap-2 hover:underline"
        type="button"
      >
        ← Volver al inicio
      </button>

      {isUserBlocked ? (
        <div className="mb-6 rounded-3xl border border-red-200 bg-red-50 px-5 py-4">
          <p className="text-sm font-black text-red-700 uppercase flex items-center gap-2">
            <AlertTriangle size={16} />
            Cuenta bloqueada
          </p>
          <p className="mt-1 text-xs font-bold text-red-700">
            Tus acciones están desactivadas (chats, edición, gestión, eliminación).
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* IZQUIERDA */}
        <div className="md:col-span-1 space-y-6">
          <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">
            <div className="h-24 bg-forest-green" />
            <div className="px-6 pb-6">
              <div className="relative -mt-12 mb-4 flex justify-center">
                <div className="relative group">
                  <img
                    src={avatarSrc}
                    alt="Foto de perfil"
                    className="w-28 h-20 rounded-full border-4 border-white object-cover shadow-lg"
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
              </div>

              <form onSubmit={handleUpdate} className="space-y-3">
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
                  <label className="text-[10px] font-black uppercase text-gray-400 ml-2">Teléfono</label>
                  <input
                    value={profile.movil ?? ""}
                    onChange={(e) => setProfile((p) => ({ ...p, movil: e.target.value }))}
                    className={`w-full p-3 rounded-2xl border-none outline-none ${
                      isEditing
                        ? "bg-gray-50 focus:ring-2 focus:ring-forest-green"
                        : "bg-gray-100 opacity-80 cursor-not-allowed"
                    }`}
                    disabled={!isEditing || saving || isUserBlocked}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
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
                  <label className="text-[10px] font-black uppercase text-gray-400 ml-2">Dirección exacta</label>
                  <input
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
                        Eliminar perfil
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
          </div>
        </div>

        {/* DERECHA */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex border-b">
              <button
                onClick={() => setActiveTab("publicaciones")}
                className={`flex-1 py-4 text-sm font-bold transition flex items-center justify-center gap-2 ${
                  activeTab === "publicaciones"
                    ? "border-b-2 border-forest-green text-forest-green"
                    : "text-gray-400 hover:text-gray-600"
                }`}
                type="button"
              >
                Mis Publicaciones
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
              >
                Mis Rescates
                {rescNotifCount > 0 ? (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-600 text-white text-[10px] font-black">
                    {rescNotifCount}
                  </span>
                ) : null}
              </button>

              <button
                onClick={() => setActiveTab("buzon")}
                className={`flex-1 py-4 text-sm font-bold transition flex items-center justify-center gap-2 ${
                  activeTab === "buzon"
                    ? "border-b-2 border-forest-green text-forest-green"
                    : "text-gray-400 hover:text-gray-600"
                }`}
                type="button"
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

            <div className="p-4 space-y-4">
              {activeTab === "buzon" && (
                <>
                  {/* ── Mensajes del sistema ──────────────────────────── */}
                  {sysMsgsLoading ? (
                    <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-white border border-gray-100 shadow-sm mb-3">
                      <Loader2 size={14} className="animate-spin text-gray-400" />
                      <span className="text-xs text-gray-400 font-medium">Cargando mensajes…</span>
                    </div>
                  ) : sysMsgs.length > 0 ? (
                    <div className="space-y-2 mb-5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 px-1">
                        Mensajes del sistema
                      </p>
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
                            className={`relative flex items-center gap-3 px-4 py-3 bg-white rounded-2xl shadow-sm border transition hover:shadow-md cursor-pointer ${isUnread ? "border-gray-300" : "border-gray-100 opacity-70"}`}
                            onClick={() => {
                              setSysMsgModal(m);
                              if (isUnread) markReceipt(m.receipt_id, "read");
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
                                onClick={() => markReceipt(m.receipt_id, isUnread ? "read" : "unread")}
                                className={`p-2 rounded-xl transition ${isUnread ? "bg-forest-green/10 text-forest-green hover:bg-forest-green hover:text-white" : "bg-gray-100 text-gray-400 hover:bg-gray-200"}`}
                              >
                                <CheckCircle2 size={14} />
                              </button>
                              <button
                                type="button"
                                title="Borrar mensaje"
                                onClick={() => { if (window.confirm("¿Borrar este mensaje? No se puede deshacer.")) markReceipt(m.receipt_id, "delete"); }}
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
                      className="fixed inset-0 z-[300] bg-black/50 flex items-center justify-center p-4"
                      onClick={() => setSysMsgModal(null)}
                    >
                      <div
                        className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6"
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
                            <h3 className="text-base font-black text-gray-900 leading-snug">
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
                              markReceipt(sysMsgModal.receipt_id, sysMsgModal.read_at ? "unread" : "read");
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
                              markReceipt(sysMsgModal.receipt_id, "delete");
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
                        Tu buzón está vacío. Aquí verás notificaciones del sistema.
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* Nota: Las pestañas "publicaciones" y "rescates" se mantienen igual en tu archivo original.
                 Aquí, por tamaño, no vuelvo a pegar esos bloques completos. */}
              

              {activeTab === "publicaciones" && (
                <>
                  {publications.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-gray-400 font-bold">
                        Aún no has publicado nada. ¡Publica tu primer tesoro!
                      </p>
                    </div>
                  ) : (
                    publications.map((art0, idx) => {
                      const art = getArtEffective(art0);
                      const titulo = art?.titulo || art?.title || "Sin título";
                      const estado = normEstado(art?.estado || art?.status || "disponible");
                      const isReview = estado === "en_revision";
                      const tipo = getTipoPublicacion(art);

                      const currentId = getArticuloId(art);
                      const selectedId = getArticuloId(articuloSeleccionado);
                      const isLoadingThis =
                        cargandoSolicitudes && selectedId && selectedId === currentId;

                      const isEntregado = estado === "entregado";
      const isPausado = !!(getArtEffective(art0)?.pausado || articuloOverridesById.get(String(getArticuloId(getArtEffective(art0))))?.pausado);
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

                      const statusUI = badgeUIByStatus(estado);
                      const tipoUI = badgeUIByTipo(tipo);

                      const isDeletingThis =
                        currentId && eliminandoArticuloId === String(currentId);

                      const hasUnread = currentId
                        ? unreadByArticulo.get(String(currentId)) === true
                        : false;

                      const notif = currentId ? notifByArticulo?.[String(currentId)] : null;

                      return (
                        <div
                          key={currentId ? `art-${currentId}` : `art-idx-${idx}`}
                          className={`relative flex items-center gap-4 p-4 mb-3 rounded-3xl shadow-sm border transition ${
                            notif?.total
                              ? "bg-orange-50 border-orange-200 ring-1 ring-orange-200"
                              : "bg-white border-gray-100"
                          } ${
                            isReview || isUserBlocked
                              ? "opacity-70 cursor-not-allowed"
                              : "hover:shadow-md cursor-pointer"
                          }`}
                          onClick={() => {
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

                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-gray-800 truncate">{titulo}</h4>

                            <div className="flex flex-wrap items-center gap-2 mt-1">
                              <span
                                className={`inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-1 rounded-xl ${statusUI.cls}`}
                              >
                                <statusUI.Icon size={12} />
                                {statusUI.label}
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

                              {!isVenta && hasPosts ? (
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

                          <div className="flex items-center gap-2">
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
                              disabled={isLoadingThis || !canOpenMsgs}
                              aria-label="Ver mensajes"
                            >
                              {(hasUnread || (notif?.unreadChats > 0)) ? (
                                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-600 ring-2 ring-white" />
                              ) : null}
                              {isLoadingThis ? (
                                <Loader2 className="animate-spin" size={16} />
                              ) : (
                                <MessageCircle size={16} />
                              )}
                            </button>

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

                            {!isReservado && (
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

                            <div className="flex flex-col items-center gap-0.5">
                              <button
                                type="button"
                                onPointerDown={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isUserBlocked) return alert(blockedUserMsg());
                                  if (bloqueadoPorReserva) return alert(`Este artículo está reservado.\nPodrás eliminarlo en ${diasRestantes} día${diasRestantes === 1 ? "" : "s"}, una vez que se confirme la entrega.`);
                                  if (isReservado) {
                                    const ok = window.confirm("¿Ya entregaste el artículo?\n\nTe recomendamos marcarlo como Entregado antes de borrar, así el rescatador sabe que todo quedó bien.");
                                    if (!ok) return;
                                  }
                                  eliminarPublicacion(art);
                                }}
                                disabled={!!isDeletingThis || isUserBlocked || bloqueadoPorReserva}
                                className="bg-red-100 text-red-700 p-3 rounded-2xl hover:bg-red-600 hover:text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
                                aria-label="Eliminar publicación"
                                title={bloqueadoPorReserva ? `Podrás eliminar en ${diasRestantes} día${diasRestantes === 1 ? "" : "s"}` : "Eliminar publicación"}
                              >
                                {isDeletingThis ? (
                                  <Loader2 className="animate-spin" size={16} />
                                ) : (
                                  <Trash2 size={16} />
                                )}
                              </button>
                              {bloqueadoPorReserva && (
                                <span className="text-[9px] font-bold text-red-400 uppercase tracking-tight leading-none">
                                  {diasRestantes}d
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </>
              )}

              {activeTab === "rescates" && (
                <>
                  {cargandoRescates ? (
                    <div className="py-12 text-center text-gray-500 font-bold">
                      Cargando rescates...
                    </div>
                  ) : rescates.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-gray-400 font-bold">
                        Aún no tienes rescates. Postúlate a una publicación y te aparecerá aquí.
                      </p>
                    </div>
                  ) : (
                    rescates.map((r) => {
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

                      const canOpenMsgsRescate =
                        !isReview &&
                        !isUserBlocked &&
                        (isVenta
                          ? hasChatBuyer || isBuyer
                          : hasChatBuyer ||
                            (String(ganadorId || "") === String(user.id) &&
                             (estado === "reservado" || estado === "entregado")));

                      const statusUI = badgeUIByStatus(estado);
                      const tipoUI = badgeUIByTipo(tipo);

                      const hasUnread = articuloId
                        ? unreadByArticulo.get(String(articuloId)) === true
                        : false;

                      return (
                        <div
                          key={r?.id || `${r?.articulo_id}-${r?.created_at}`}
                          className={`relative flex items-center gap-4 p-4 mb-3 rounded-3xl shadow-sm border transition ${
                            hasUnread
                              ? "bg-green-50 border-green-200 ring-1 ring-green-200"
                              : "bg-white border-gray-100"
                          } ${
                            isReview || isUserBlocked ? "opacity-80" : "hover:shadow-md"
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

                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-gray-800 truncate">{titulo}</h4>

                            <div className="flex flex-wrap items-center gap-2 mt-1">
                              <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-1 rounded-xl ${statusUI.cls}`}>
                                <statusUI.Icon size={12} />
                                {statusUI.label}
                              </span>

                              <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-1 rounded-xl ${tipoUI.cls}`}>
                                <tipoUI.Icon size={12} />
                                {tipoUI.label}
                              </span>

                              <span className="text-[10px] text-gray-400 font-medium uppercase tracking-tighter">
                                Postulado: {formatDateTime(r?.created_at) || "Sin fecha"}
                              </span>

                              {!isVenta && String(ganadorId || "") === String(user?.id || "") && (estado === "reservado" || estado === "entregado") && (
                                <span className="inline-flex items-center gap-1 bg-green-100 text-green-800 ring-1 ring-green-300 px-2 py-1 rounded-xl text-[10px] font-black uppercase animate-pulse">
                                  <CheckCircle2 size={11} />
                                  {estado === "entregado" ? "¡Recibiste esto!" : "¡Fuiste elegido!"}
                                </span>
                              )}
                            </div>

                            {r?.justificacion ? (
                              <p className="mt-2 text-sm text-gray-600 line-clamp-2">
                                <span className="font-black text-gray-700">Tu mensaje:</span>{" "}
                                {r.justificacion}
                              </p>
                            ) : null}
                          </div>

                          <div className="shrink-0 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                if (isUserBlocked) return alert(blockedUserMsg());
                                if (isReview) return alert(revisionBlockMsg(titulo));
                                verMensajesRescate(r);
                              }}
                              disabled={cargandoChatRescate === articuloId || isDeletingMine || !canOpenMsgsRescate}
                              className="relative bg-forest-green/10 text-forest-green p-3 rounded-2xl hover:bg-forest-green hover:text-white transition disabled:opacity-50"
                              aria-label="Ver mensajes"
                            >
                              {hasUnread ? (
                                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-600 ring-2 ring-white" />
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
                              disabled={isDeletingMine || isReview || isUserBlocked}
                              className="bg-red-100 text-red-700 p-3 rounded-2xl hover:bg-red-600 hover:text-white transition disabled:opacity-50"
                              aria-label="Eliminar de Mis Rescates"
                            >
                              {isDeletingMine ? (
                                <Loader2 className="animate-spin" size={16} />
                              ) : (
                                <Trash2 size={16} />
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </>
              )}

</div>
          </div>

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

          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
            <div className="p-5 border-b">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                Eliminar cuenta
              </p>
              <h3 className="text-lg font-black text-gray-900">Confirmación requerida</h3>
              <p className="mt-2 text-sm text-gray-600 font-medium">
                Para confirmar, escribe tu correo exactamente:
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

                      // ✅ Método simple: RPC en DB (sin Edge Function)
                      const { data, error } = await supabase.rpc("self_delete_and_block", {
                        email_confirm: emailTyped,
                      });

                      console.log("self_delete_and_block:", { data, error });

                      if (error) {
                        alert(error.message || "No se pudo eliminar/bloquear. Revisa consola.");
                        return;
                      }

                      if (!data?.ok) {
                        alert("No se pudo eliminar: " + (data?.error || "Error desconocido"));
                        return;
                      }

                      alert("Cuenta eliminada y BLOQUEADA.");
                      await supabase.auth.signOut();
                      window.location.href = "/";
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
                  Confirmar eliminación
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Modal previsualización */}
      {previewOpen && previewArt ? (
        <div
          className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => {
            setPreviewOpen(false);
            setPreviewArt(null);
          }}
        >
          <div
            className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden"
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
