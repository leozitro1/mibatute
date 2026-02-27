// src/components/ChatMessenger.jsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
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

function normEstado(v) {
  const s = String(v || "").toLowerCase().trim();
  if (s === "available") return "disponible";
  if (s === "reserved") return "reservado";
  if (s === "delivered") return "entregado";
  return s || "disponible";
}

function getThumb(item) {
  if (typeof item?.imagen_url_principal === "string" && item.imagen_url_principal.trim())
    return item.imagen_url_principal.trim();
  if (typeof item?.imagen_url === "string" && item.imagen_url.trim()) return item.imagen_url.trim();
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

function formatTime(value) {
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function formatDayLabel(value) {
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return "";
    const now = new Date();

    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);

    const isYesterday =
      d.getFullYear() === yesterday.getFullYear() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getDate() === yesterday.getDate();

    if (sameDay) return "Hoy";
    if (isYesterday) return "Ayer";

    return d.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

/** Agrupa por fecha y por bloques consecutivos del mismo usuario */
function buildBlocks(messages = []) {
  const sorted = [...messages].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const days = [];
  let currentDayKey = null;
  let currentDay = null;

  for (const m of sorted) {
    const dayKey = new Date(m.created_at).toDateString();
    if (dayKey !== currentDayKey) {
      currentDayKey = dayKey;
      currentDay = { dayLabel: formatDayLabel(m.created_at), blocks: [] };
      days.push(currentDay);
    }

    const lastBlock = currentDay.blocks[currentDay.blocks.length - 1];
    if (!lastBlock || String(lastBlock.sender_id) !== String(m.sender_id)) {
      currentDay.blocks.push({ sender_id: m.sender_id, items: [m] });
    } else {
      lastBlock.items.push(m);
    }
  }

  return days;
}

async function safeInsertChatMessage({ chat_id, sender_id, bodyText }) {
  const base = { chat_id, sender_id };

  const candidates = [
    { ...base, body: bodyText },
    { ...base, message: bodyText },
    { ...base, content: bodyText },
    { ...base, text: bodyText },
    { ...base, mensaje: bodyText },
  ];

  for (const payload of candidates) {
    const { error } = await supabase.from("chat_messages").insert(payload);
    if (!error) return { error: null };

    if (
      error?.code === "PGRST204" &&
      /Could not find the '(.+?)' column of 'chat_messages'/i.test(error.message || "")
    ) {
      continue;
    }

    return { error };
  }

  return {
    error: { message: "No se pudo insertar: ninguna columna de texto coincide con chat_messages." },
  };
}

async function fetchUserLite(userId) {
  const uid = String(userId || "").trim();
  if (!uid) return null;

  try {
    const { data, error } = await supabase
      .from("usuarios_publicos")
      .select("id,nombre,foto_url")
      .eq("id", uid)
      .maybeSingle();

    if (!error && data?.id) return data;
  } catch {
    // ignore
  }

  try {
    const { data, error } = await supabase
      .from("usuarios")
      .select("id,nombre,foto_url")
      .eq("id", uid)
      .maybeSingle();

    if (!error && data?.id) return data;
  } catch {
    // ignore
  }

  return null;
}

async function isBlockedUser(uid) {
  const id = String(uid || "").trim();
  if (!id) return false;

  try {
    // intentamos con is_blocked (tu campo real)
    const { data, error } = await supabase.from("usuarios").select("is_blocked").eq("id", id).maybeSingle();
    if (!error) return !!data?.is_blocked;

    // si la columna no existe por algún motivo, no bloqueamos por UI (RLS hará su trabajo)
    if (String(error?.code) === "42703") return false;

    // si hay otro error (RLS), tampoco “rompemos” UI
    return false;
  } catch {
    return false;
  }
}

async function findChatRow({ articuloId, buyerId }) {
  if (!articuloId) return null;

  try {
    let q = supabase.from("chats").select("*").eq("articulo_id", articuloId);
    if (buyerId) q = q.eq("buyer_id", buyerId);

    const { data, error } = await q.order("created_at", { ascending: false }).maybeSingle();
    if (!error && data) return data;

    if (error?.message && /Could not find the 'buyer_id' column/i.test(error.message)) {
      // continue a fallback
    } else if (error) {
      return null;
    }
  } catch {
    // continue
  }

  try {
    const { data, error } = await supabase
      .from("chats")
      .select("*")
      .eq("articulo_id", articuloId)
      .order("created_at", { ascending: false })
      .maybeSingle();

    if (!error && data) return data;
  } catch {
    // ignore
  }

  return null;
}

/**
 * ✅ Crea chat SOLO con buyer_id + seller_id + articulo_id
 * buyerId: el comprador (usuario actual o el “otro” dependiendo del flujo)
 * sellerId: dueño del artículo (article.owner_id / article.usuario_id / article.user_id)
 */
async function safeCreateChatRow({ articuloId, buyerId, sellerId }) {
  if (!articuloId || !buyerId || !sellerId) {
    return { data: null, error: { message: "Faltan datos para crear chat (articuloId/buyerId/sellerId)" } };
  }

  const payload = {
    articulo_id: articuloId,
    buyer_id: buyerId,
    seller_id: sellerId,
  };

  try {
    const { data, error } = await supabase.from("chats").insert(payload).select("*").maybeSingle();

    if (!error && data?.id) return { data, error: null };

    if (error?.code === "23505" || /duplicate key value/i.test(error?.message || "") || error?.status === 409) {
      // ya existe
      return { data: null, error: null };
    }

    // si RLS niega, lo tratamos arriba con uiError
    return { data: null, error };
  } catch (e) {
    return { data: null, error: { message: e?.message || "No se pudo crear chat" } };
  }
}

/** ✅ clave de visto por usuario/chat */
function seenKey(userId, chatId) {
  return `chat_seen_${String(userId || "").trim()}_${String(chatId || "").trim()}`;
}

/** ✅ guarda visto (ISO) */
function setSeen(userId, chatId, iso) {
  try {
    if (!userId || !chatId || !iso) return;
    localStorage.setItem(seenKey(userId, chatId), String(iso));
  } catch {
    // ignore
  }
}

/** ✅ lee visto (ms) */
function getSeenMs(userId, chatId) {
  try {
    const v = localStorage.getItem(seenKey(userId, chatId));
    if (!v) return 0;
    const t = new Date(v).getTime();
    return isNaN(t) ? 0 : t;
  } catch {
    return 0;
  }
}

export default function ChatMessenger({
  isOpen,
  onClose,
  userId,
  article,
  chat,
  otherUserId,
  role,
  errorMessage,
  otherUserFallbackName = "Usuario",
  onSeenChange,
}) {
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const [chatRow, setChatRow] = useState(chat || null);
  const [messages, setMessages] = useState([]);

  const [otherUser, setOtherUser] = useState(null);
  const [otherUserLoading, setOtherUserLoading] = useState(false);

  const [uiError, setUiError] = useState("");
  const [text, setText] = useState("");

  // 🚩 Reporte de chat (simple)
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState("acoso");
  const [reportDetails, setReportDetails] = useState("");
  const [sendingReport, setSendingReport] = useState(false);

  // ✅ bloqueo
  const [meBlocked, setMeBlocked] = useState(false);

  const endRef = useRef(null);
  const listRef = useRef(null);
  const userCacheRef = useRef(new Map());

  const articuloId = useMemo(
    () => article?.id || article?.articulo_id || article?.uuid || article?.product_id || null,
    [article]
  );

  const estado = useMemo(() => normEstado(article?.estado ?? article?.status ?? ""), [article?.estado, article?.status]);
  const isEntregado = estado === "entregado";

  const chatClosed = useMemo(() => {
    const s = String(chatRow?.status || "").toLowerCase().trim();
    return s === "closed";
  }, [chatRow?.status]);

  const readOnly = isEntregado || chatClosed || meBlocked;

  const title = useMemo(() => article?.titulo || article?.title || "Chat", [article]);

  const sellerIdFromArticle = useMemo(() => {
    return (
      article?.owner_id ||
      article?.usuario_id ||
      article?.user_id ||
      article?.seller_id ||
      null
    );
  }, [article]);

  const resolvedOtherUserId = useMemo(() => {
    if (otherUserId) return otherUserId;
    const me = String(userId || "").trim();
    if (!me) return null;

    const buyer = chatRow?.buyer_id || null;
    const seller = chatRow?.seller_id || null;

    const artOwner = sellerIdFromArticle;
    const artBuyer = article?.buyer_id || article?.buyerId || null;

    if (artBuyer && String(me) === String(artBuyer) && artOwner) return artOwner;
    if (artOwner && String(me) === String(artOwner) && artBuyer) return artBuyer;

    if (buyer && String(me) === String(buyer)) return seller || artOwner || null;
    if (seller && String(me) === String(seller)) return buyer || null;

    return artOwner || buyer || seller || null;
  }, [
    otherUserId,
    userId,
    chatRow?.buyer_id,
    chatRow?.seller_id,
    sellerIdFromArticle,
    article?.buyer_id,
    article?.buyerId,
  ]);

  // Buyer “objetivo” del chat: si viene otherUserId lo usamos (flujo rescate/venta),
  // si no, usamos buyer_id del artículo o del chat.
  const lookupBuyerId = useMemo(() => {
    return otherUserId || article?.buyer_id || article?.buyerId || chatRow?.buyer_id || null;
  }, [otherUserId, article?.buyer_id, article?.buyerId, chatRow?.buyer_id]);

  const otherName = useMemo(() => {
    if (otherUserLoading) return "Cargando...";
    return otherUser?.nombre || otherUserFallbackName;
  }, [otherUser, otherUserFallbackName, otherUserLoading]);

  const otherAvatar = useMemo(() => otherUser?.foto_url || "", [otherUser]);

  const scrollToBottom = useCallback((smooth = true) => {
    try {
      endRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "end" });
    } catch {
      // ignore
    }
  }, []);

  // ✅ marca visto hasta el último mensaje
  const markSeenUpToLatest = useCallback(
    (msgs) => {
      const uid = String(userId || "").trim();
      const chatId = chatRow?.id;
      if (!uid || !chatId) return;

      const arr = Array.isArray(msgs) ? msgs : [];
      if (!arr.length) return;

      const last = arr[arr.length - 1];
      const lastIso = last?.created_at ? String(last.created_at) : "";
      if (!lastIso) return;

      const prevMs = getSeenMs(uid, chatId);
      const nextMs = new Date(lastIso).getTime();
      if (isNaN(nextMs)) return;

      if (nextMs > prevMs) {
        setSeen(uid, chatId, lastIso);
        try {
          onSeenChange?.(chatId, lastIso);
        } catch {
          // ignore
        }
      }
    },
    [userId, chatRow?.id, onSeenChange]
  );

  // ✅ al abrir: reset + chequear bloqueo
  useEffect(() => {
    if (!isOpen) return;

    setText("");
    setMessages([]);
    setOtherUser(null);
    setOtherUserLoading(false);

    setChatRow(chat || null);
    setUiError(String(errorMessage || "").trim());
    setMeBlocked(false);

    // check bloqueo
    (async () => {
      const blocked = await isBlockedUser(userId);
      setMeBlocked(blocked);
      if (blocked) {
        setUiError("🚫 Tu cuenta está BLOQUEADA. No puedes usar chats por el momento.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setChatRow(chat || null);
    setUiError(String(errorMessage || "").trim());
  }, [isOpen, chat, errorMessage]);

  useEffect(() => {
    if (!isOpen) return;

    const uid = String(resolvedOtherUserId || "").trim();
    if (!uid) {
      setOtherUser(null);
      setOtherUserLoading(false);
      return;
    }

    const cached = userCacheRef.current.get(uid);
    if (cached) {
      setOtherUser(cached);
      setOtherUserLoading(false);
      return;
    }

    let alive = true;

    (async () => {
      setOtherUserLoading(true);
      const data = await fetchUserLite(uid);

      if (!alive) return;

      if (data) {
        userCacheRef.current.set(uid, data);
        setOtherUser(data);
      } else {
        setOtherUser(null);
      }

      setOtherUserLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [isOpen, resolvedOtherUserId]);

  const ensureChatRow = useCallback(async () => {
    if (!isOpen) return;
    if (!articuloId) return;

    // ✅ si está bloqueado, ni intentes
    const blocked = await isBlockedUser(userId);
    setMeBlocked(blocked);
    if (blocked) {
      setChatRow(null);
      setMessages([]);
      setUiError("🚫 Tu cuenta está BLOQUEADA. No puedes usar chats por el momento.");
      return;
    }

    try {
      setLoading(true);

      let row = await findChatRow({ articuloId, buyerId: lookupBuyerId });

      // ✅ si no existe, lo creamos con buyer/seller reales
      if (!row?.id && lookupBuyerId && sellerIdFromArticle) {
        const createRes = await safeCreateChatRow({
          articuloId,
          buyerId: lookupBuyerId,
          sellerId: sellerIdFromArticle,
        });

        row = await findChatRow({ articuloId, buyerId: lookupBuyerId });

        if (!row?.id && createRes?.error) {
          console.log("Warn creando chat:", createRes.error);

          // si fue RLS, mostramos mensaje claro
          const msg = String(createRes?.error?.message || "");
          if (/row level security/i.test(msg) || /permission/i.test(msg) || /RLS/i.test(msg)) {
            setUiError("No tienes permiso para abrir este chat (RLS).");
          }
        }
      }

      setChatRow(row || null);

      if (!row?.id) {
        if (!String(uiError || "").trim()) {
          setUiError(
            "Este chat no existe o no tienes permiso (RLS). Si el comprador eliminó la solicitud, el chat se borra automáticamente."
          );
        }
      } else {
        // si ya hay chat, limpiamos errores (si no estás bloqueado)
        if (!blocked) setUiError("");
      }
    } catch (e) {
      console.log("No se pudo asegurar chatRow:", e?.message || e);
      if (!String(uiError || "").trim()) {
        setUiError("No se pudo abrir el chat. Revisa permisos (RLS) o si el chat fue eliminado.");
      }
      setChatRow(null);
    } finally {
      setLoading(false);
    }
  }, [isOpen, articuloId, lookupBuyerId, userId, sellerIdFromArticle, uiError]);

  useEffect(() => {
    if (!isOpen) return;

    if (chat?.id) {
      setChatRow(chat);
      return;
    }

    ensureChatRow();
  }, [isOpen, chat?.id, ensureChatRow]);

  // ✅ cargar mensajes
  useEffect(() => {
    if (!isOpen) return;
    const chatId = chatRow?.id;

    if (!chatId) {
      setMessages([]);
      return;
    }

    // ✅ si está bloqueado, no leemos
    if (meBlocked) {
      setMessages([]);
      return;
    }

    let alive = true;

    (async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: true });

      if (!alive) return;

      if (!error && Array.isArray(data)) {
        setMessages(data);
        setTimeout(() => scrollToBottom(false), 0);
        markSeenUpToLatest(data);
      } else {
        // si es RLS, muestra mensaje
        const msg = String(error?.message || "");
        if (/row level security/i.test(msg) || /permission/i.test(msg)) {
          setUiError("No tienes permiso para ver este chat (RLS).");
        }
        setMessages([]);
      }

      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [isOpen, chatRow?.id, scrollToBottom, markSeenUpToLatest, meBlocked]);

  // ✅ realtime: INSERT mensajes
  useEffect(() => {
    if (!isOpen) return;
    const chatId = chatRow?.id;
    if (!chatId) return;
    if (meBlocked) return;

    const channel = supabase
      .channel(`chat_messages_${chatId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `chat_id=eq.${chatId}` },
        (payload) => {
          const row = payload?.new;
          if (!row) return;

          setMessages((prev) => {
            const exists = prev.some((m) => String(m.id) === String(row.id));
            if (exists) return prev;

            const next = [...prev, row];
            markSeenUpToLatest(next);
            return next;
          });

          setTimeout(() => scrollToBottom(true), 0);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen, chatRow?.id, scrollToBottom, markSeenUpToLatest, meBlocked]);

  useEffect(() => {
    if (!isOpen) return;
    const chatId = chatRow?.id;
    if (!chatId) return;

    const channel = supabase
      .channel(`chat_deleted_${chatId}`)
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "chats", filter: `id=eq.${chatId}` },
        () => {
          setMessages([]);
          setChatRow(null);
          setUiError("Este chat fue eliminado.");
          try {
            onClose?.();
          } catch {
            // ignore
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen, chatRow?.id, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    if (!messages?.length) return;
    setTimeout(() => scrollToBottom(true), 0);
  }, [isOpen, messages?.length, scrollToBottom]);

  const days = useMemo(() => buildBlocks(messages), [messages]);

  const sendMessage = async () => {
    if (readOnly) return;

    // ✅ check bloqueo justo antes de enviar
    const blocked = await isBlockedUser(userId);
    setMeBlocked(blocked);
    if (blocked) {
      setUiError("🚫 Tu cuenta está BLOQUEADA. No puedes enviar mensajes.");
      return;
    }

    const chatId = chatRow?.id;
    if (!chatId) return alert("No se encontró chat_id para enviar mensajes.");
    if (!userId) return alert("No se encontró userId para enviar mensajes.");

    const bodyText = String(text || "").trim();
    if (!bodyText) return;

    try {
      setSending(true);

      const { error } = await safeInsertChatMessage({
        chat_id: chatId,
        sender_id: userId,
        bodyText,
      });

      if (error) {
        console.log("Error insert chat_messages:", error);

        const msg = String(error?.message || "");
        if (/row level security/i.test(msg) || /permission/i.test(msg)) {
          alert("🚫 No tienes permiso para enviar mensajes (RLS).");
        } else {
          alert("No se pudo enviar. Revisa la consola.");
        }
        return;
      }

      setText("");
      setTimeout(() => scrollToBottom(true), 0);
    } catch (e) {
      console.log(e);
      alert("No se pudo enviar el mensaje.");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!sending) sendMessage();
    }
  };


  const sendChatReport = async () => {
    try {
      if (!userId || !otherUserId) {
        alert("No se pudo identificar al usuario.");
        return;
      }
      const details = String(reportDetails || "").trim();
      if (details.length < 5) {
        alert("Escribe un poco más de detalle (mínimo 5 caracteres).");
        return;
      }
      setSendingReport(true);

      const context = (Array.isArray(messages) ? messages : [])
        .slice(-20)
        .map((m) => ({
          id: m?.id,
          created_at: m?.created_at,
          sender_id: m?.sender_id,
          body: m?.bodyText ?? m?.message ?? m?.content ?? m?.text ?? m?.mensaje ?? "",
        }));

      const payload = {
        reporter_id: userId,
        reported_user_id: otherUserId,
        chat_id: chat?.id || null,
        articulo_id: article?.id || null,
        reason: reportReason,
        details,
        context,
      };

      const { error } = await supabase.from("chat_reports").insert(payload);

      if (error) {
        console.log("sendChatReport error:", error);
        alert("No se pudo enviar la denuncia. Revisa consola.");
        return;
      }

      alert("Denuncia enviada. Gracias por reportar.");
      setShowReport(false);
      setReportDetails("");
      setReportReason("acoso");
    } catch (e) {
      console.log(e);
      alert("No se pudo enviar la denuncia.");
    } finally {
      setSendingReport(false);
    }
  };


  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex">
      <button type="button" onClick={onClose} className="absolute inset-0 bg-black/40" aria-label="Cerrar chat" />

      <div className="relative ml-auto h-full w-full max-w-xl bg-white shadow-2xl border-l border-gray-200 flex flex-col">
        {/* HEADER */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-3 rounded-2xl bg-gray-100 hover:bg-gray-200 text-xs font-black uppercase"
          >
            Volver
          </button>

          <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0">
            {otherAvatar ? (
              <img
                src={otherAvatar}
                alt={otherName}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ) : (
              <span className="font-black text-gray-600">{String(otherName || "U").charAt(0).toUpperCase()}</span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="font-black text-gray-900 truncate">{otherName}</p>
            <p className="text-[10px] font-black uppercase text-gray-400">
              {estado} {chatClosed ? "· chat cerrado" : ""} {role ? `· ${role}` : ""}
            </p>
          </div>

          {readOnly ? (
            <span className="text-[10px] font-black uppercase px-3 py-2 rounded-2xl bg-gray-100 text-gray-600">
              {meBlocked ? "Bloqueado" : "Solo lectura"}
            </span>
          ) : null}
          <button
            type="button"
            className="ml-2 px-3 py-2 rounded-2xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 text-sm font-black"
            title="Denunciar usuario"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowReport(true);
            }}
          >
            🚩
          </button>

        </div>

        {/* CARD ARTÍCULO */}
        <div className="px-4 pt-4">
          <div className="rounded-3xl border border-gray-100 bg-gray-50 p-4 flex gap-3">
            <img
              src={getThumb(article)}
              alt="art"
              className="w-14 h-14 rounded-2xl object-cover border border-gray-100 bg-white"
              onError={(e) => {
                if (e.currentTarget.dataset.fallbackApplied) return;
                e.currentTarget.dataset.fallbackApplied = "1";
                e.currentTarget.src = FALLBACK_SVG;
              }}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase text-gray-400">Artículo</p>
              <p className="font-black text-gray-900 truncate">{title}</p>
              <p className="text-xs text-gray-600 mt-1">
                {isEntregado ? "✅ Transacción cerrada" : estado === "reservado" ? "Reserva activa" : "Disponible"}
              </p>
            </div>
          </div>
        </div>

        {/* BANNER ERROR */}
        {String(uiError || "").trim() ? (
          <div className="px-4 pt-4">
            <div className="rounded-3xl border border-yellow-200 bg-yellow-50 p-4">
              <p className="text-xs font-black uppercase text-yellow-800">Aviso</p>
              <p className="text-sm text-yellow-900 mt-1 font-bold leading-snug">{uiError}</p>

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={ensureChatRow}
                  className="px-4 py-2 rounded-2xl bg-gray-900 text-white text-[10px] font-black uppercase"
                  disabled={meBlocked}
                  title={meBlocked ? "Cuenta bloqueada" : "Reintentar"}
                >
                  Reintentar abrir chat
                </button>
                <button
                  type="button"
                  onClick={() => setUiError("")}
                  className="px-4 py-2 rounded-2xl bg-white border border-yellow-200 text-yellow-900 text-[10px] font-black uppercase"
                >
                  Ocultar
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* MENSAJES */}
        <div ref={listRef} className="flex-1 overflow-auto px-4 py-4 bg-gray-50">
          {loading ? (
            <div className="py-10 text-center text-gray-500 font-bold">Cargando chat...</div>
          ) : meBlocked ? (
            <div className="py-10 text-center text-gray-500 font-bold">
              🚫 Tu cuenta está bloqueada.
              <br />
              <span className="text-xs font-bold text-gray-400">No puedes usar chats por el momento.</span>
            </div>
          ) : !chatRow?.id ? (
            <div className="py-10 text-center text-gray-500 font-bold">
              Este chat ya no existe o no tienes permiso.
              <br />
              <span className="text-xs font-bold text-gray-400">
                (Si el comprador eliminó la solicitud, el chat se borra automáticamente).
              </span>

              <div className="mt-4">
                <button
                  type="button"
                  onClick={ensureChatRow}
                  className="px-5 py-3 rounded-3xl bg-gray-900 text-white text-xs font-black uppercase"
                >
                  Reintentar
                </button>
              </div>
            </div>
          ) : days.length === 0 ? (
            <div className="py-10 text-center text-gray-500 font-bold">
              No hay mensajes aún. {readOnly ? "Este chat está en solo lectura." : "Envía el primero."}
            </div>
          ) : (
            <div className="space-y-5">
              {days.map((day, idx) => (
                <div key={`${day.dayLabel}-${idx}`} className="space-y-4">
                  <div className="flex items-center justify-center">
                    <span className="text-[10px] font-black uppercase px-3 py-1 rounded-full bg-gray-200 text-gray-700">
                      {day.dayLabel}
                    </span>
                  </div>

                  {day.blocks.map((block, bIdx) => {
                    const isMe = String(block.sender_id) === String(userId);
                    const last = block.items[block.items.length - 1];

                    return (
                      <div
                        key={`${block.sender_id}-${bIdx}`}
                        className={`flex gap-2 ${isMe ? "justify-end" : "justify-start"}`}
                      >
                        {!isMe ? (
                          <div className="w-8 shrink-0">
                            <div className="w-8 h-8 rounded-full overflow-hidden bg-white border border-gray-200 flex items-center justify-center">
                              {otherAvatar ? (
                                <img
                                  src={otherAvatar}
                                  alt={otherName}
                                  className="w-full h-full object-cover"
                                  onError={(e) => (e.currentTarget.style.display = "none")}
                                />
                              ) : (
                                <span className="font-black text-gray-600">
                                  {String(otherName || "U").charAt(0).toUpperCase()}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="w-8 shrink-0" />
                        )}

                        <div className={`max-w-[82%] space-y-1 ${isMe ? "items-end" : "items-start"}`}>
                          {block.items.map((m, i) => {
                            const msgText = m.body || m.message || m.content || m.text || m.mensaje || "";
                            return (
                              <div
                                key={m.id || `${m.created_at}-${i}`}
                                className={`px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words shadow-sm ${
                                  isMe
                                    ? "bg-forest-green text-white rounded-br-md"
                                    : "bg-white text-gray-800 border border-gray-100 rounded-bl-md"
                                }`}
                              >
                                {msgText}
                              </div>
                            );
                          })}

                          <div className={`text-[10px] font-bold text-gray-400 ${isMe ? "text-right" : "text-left"}`}>
                            {formatTime(last?.created_at)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
              <div ref={endRef} />
            </div>
          )}
        </div>

        {/* INPUT */}
        <div className="sticky bottom-0 border-t border-gray-100 bg-white px-4 py-3">
          {readOnly ? (
            <div className="text-center text-xs font-bold text-gray-500">
              {meBlocked
                ? "Tu cuenta está bloqueada. No puedes enviar mensajes."
                : "Este chat está en solo lectura. No se pueden enviar más mensajes."}
            </div>
          ) : (
            <div className="flex items-end gap-2">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder="Escribe un mensaje..."
                className="flex-1 resize-none rounded-3xl border border-gray-200 bg-gray-50 px-4 py-3 outline-none focus:ring-2 focus:ring-forest-green text-sm"
              />
              <button
                type="button"
                onClick={sendMessage}
                disabled={sending || !String(text || "").trim()}
                className="h-12 px-5 rounded-3xl bg-forest-green text-white font-black uppercase text-xs disabled:opacity-50"
              >
                {sending ? "Enviando..." : "Enviar"}
              </button>
            </div>
          )}
        </div>
      </div>
      {/* MODAL DENUNCIA CHAT */}
      {showReport && (
        <div className="fixed inset-0 z-[500] bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <div className="text-xs font-black uppercase text-gray-500">Denunciar usuario</div>
                <div className="font-black text-gray-900 text-sm mt-1">¿Qué pasó en el chat?</div>
              </div>
              <button
                type="button"
                className="p-2 rounded-xl hover:bg-gray-100"
                onClick={() => setShowReport(false)}
                title="Cerrar"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div>
                <label className="text-[11px] font-black uppercase text-gray-500">Motivo</label>
                <select
                  className="mt-1 w-full border border-gray-200 rounded-2xl px-3 py-2 text-sm"
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                >
                  <option value="acoso">Acoso</option>
                  <option value="estafa">Estafa</option>
                  <option value="ofensivo">Lenguaje ofensivo</option>
                  <option value="spam">Spam</option>
                  <option value="otro">Otro</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-black uppercase text-gray-500">Descripción</label>
                <textarea
                  className="mt-1 w-full border border-gray-200 rounded-2xl px-3 py-2 text-sm min-h-[90px]"
                  value={reportDetails}
                  onChange={(e) => setReportDetails(e.target.value)}
                  placeholder="Cuéntanos qué pasó (se adjuntan los últimos 20 mensajes automáticamente)."
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  className="flex-1 py-2 rounded-2xl border border-gray-200 font-black text-sm hover:bg-gray-50"
                  onClick={() => setShowReport(false)}
                  disabled={sendingReport}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="flex-1 py-2 rounded-2xl bg-red-600 text-white font-black text-sm hover:opacity-90 disabled:opacity-50"
                  onClick={sendChatReport}
                  disabled={sendingReport}
                >
                  {sendingReport ? "Enviando..." : "Enviar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
