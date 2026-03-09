// src/App.jsx
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Routes, Route } from "react-router-dom";
import AdminPage from "./pages/AdminPage";
import AuthCallback from "./pages/AuthCallback";
import ResetPassword from "./pages/ResetPassword";
import Terms from "./pages/Terms";
import MasterPage from "./pages/MasterPage";
import AdsPanel from "./pages/AdsPanel";
import Navbar from "./components/Navbar";
import ProductCard from "./components/ProductCard";
import PublishModal from "./components/PublishModal";
import AuthModal from "./components/AuthModal";
import UserProfile from "./components/UserProfile";
import ProductDetail from "./components/ProductDetail";
import HeroBanner from "./components/HeroBanner";
import FeaturedTicker from "./components/FeaturedTicker";
import HowItWorks from "./components/HowItWorks";
import ManageArticleModal from "./components/ManageArticleModal";
import EditArticleModal from "./components/EditArticleModal";
import ChatMessenger from "./components/ChatMessenger";

import { COLOMBIA_DATA } from "./data/locations";
import { supabase } from "./supabase/supabaseClient";


import { crearPostulacionConLimite } from "./supabase/solicitudesService";
/**
 * ✅ Árbol categorías + subcategorías
 */
// ⚠️ IMPORTANTE:
// Este árbol DEBE coincidir con el que usas al publicar (PublishModal.jsx).
// Si no coincide, el filtro por subcategoría “no sirve” porque compara textos distintos.
const CATEGORY_TREE = [
  { key: "Hogar & Muebles", label: "🌿 Hogar & Muebles", subs: ["Muebles", "Decoración", "Electrodomésticos", "Colchones", "Cocina"] },
  { key: "Electrónica & Tecnología", label: "⚡ Electrónica & Tecnología", subs: ["Celulares", "Computadores", "Televisores", "Repuestos", "Chatarra electrónica"] },
  { key: "Construcción & Herramientas", label: "🧱 Construcción & Herramientas", subs: ["Materiales", "Herramientas", "Oficios", "Madera", "Metales"] },
  { key: "Ropa & Textiles", label: "👕 Ropa & Textiles", subs: ["Ropa", "Retazos", "Telas", "Uniformes"] },
  { key: "Reciclaje & Reutilización", label: "🔄 Reciclaje & Reutilización", subs: ["Plásticos", "Vidrio", "Cartón", "Materias primas"] },
  { key: "Infantil & Juguetes", label: "🧸 Infantil & Juguetes", subs: ["Juguetes", "Ropa infantil", "Coches y sillas", "Lactancia", "Escolar"] },
  { key: "Deportes & Movilidad", label: "🚲 Deportes & Movilidad", subs: ["Bicicletas", "Patines", "Gimnasio", "Autopartes", "Motos"] },
  { key: "Libros & Educación", label: "📚 Libros & Educación", subs: ["Libros", "Cuadernos y útiles", "Cursos y material", "Tecnología educativa", "Instrumentos"] },
  { key: "Mascotas", label: "🐶 Mascotas", subs: ["Accesorios", "Alimento", "Camas y casas", "Salud", "Juguetes"] },
  { key: "Antigüedades & Coleccionables", label: "🕰 Antigüedades & Coleccionables", subs: ["Monedas", "Relojes", "Arte", "Coleccionables", "Vintage"] },
];

// ✅ helper: id robusto
function getArticuloId(item) {
  return item?.id || item?.articulo_id || item?.uuid || item?.product_id || null;
}

// ✅ Normaliza estado
function normEstado(v) {
  const s = String(v || "").toLowerCase().trim();
  if (s === "available") return "disponible";
  if (s === "reserved") return "reservado";
  if (s === "delivered") return "entregado";
  return s || "disponible";
}

// ✅ Normaliza tipo publicación (regalo->donacion)
function normTipo(v) {
  const s = String(v || "").toLowerCase().trim();
  if (!s) return "";
  if (s.includes("don")) return "donacion";
  if (s.includes("regal")) return "donacion";
  if (s.includes("venta")) return "venta";
  return s;
}

// ✅ Normaliza strings para comparar (evita fallos por mayúsculas/espacios)
function normStr(v) {
  return String(v ?? "").trim().toLowerCase();
}

// ✅ Lee categoría/subcategoría aunque cambie el nombre de la columna
function getCategoria(item) {
  return (
    item?.category ??
    item?.categoria ??
    item?.categoria_es ??
    item?.category_name ??
    ""
  );
}

function getSubcategoria(item) {
  return (
    item?.subcategory ??
    item?.subcategoria ??
    item?.sub_category ??
    item?.subcategoria_es ??
    item?.subcategory_name ??
    ""
  );
}

// ✅ BLOQUEO REVISIÓN: detecta "en revisión" (soporta varios nombres/campos)
function isInReview(article) {
  const raw = String(
    article?.estado ??
      article?.status ??
      article?.review_status ??
      article?.approval_status ??
      article?.moderation_status ??
      article?.revision_status ??
      ""
  )
    .toLowerCase()
    .trim();

  return (
    raw === "revision" ||
    raw === "revisión" ||
    raw === "en revision" ||
    raw === "en revisión" ||
    raw === "review" ||
    raw === "pending_review" ||
    raw === "pending" ||
    raw === "under_review"
  );
}

// ✅ helper: update a prueba de columnas faltantes
async function safeUpdateArticulos(articleId, patch) {
  let payload = { ...(patch || {}) };

  const run = async () => {
    return await supabase.from("articulos").update(payload).eq("id", articleId).select("*").maybeSingle();
  };

  let { data, error } = await run();

  if (error?.message && /Could not find the '(.+?)' column/i.test(error.message)) {
    const m = error.message.match(/Could not find the '(.+?)' column/i);
    const missing = m?.[1];
    if (missing && Object.prototype.hasOwnProperty.call(payload, missing)) {
      delete payload[missing];
      ({ data, error } = await run());
    }
  }

  return { error, data };
}

// ✅ helper: chunk para IN() (evita límites)
function chunkArray(arr, size) {
  const out = [];
  const s = Math.max(1, size || 200);
  for (let i = 0; i < (arr || []).length; i += s) out.push(arr.slice(i, i + s));
  return out;
}

// ✅ helper: sacar max interesados si existe en el artículo (opcional)
function resolveInterestedMax(item) {
  const candidates = [
    item?.interested_max,
    item?.interestedMax,
    item?.max_interested,
    item?.maxInterested,
    item?.max_solicitudes,
    item?.maxSolicitudes,
    item?.cupos_max,
    item?.cuposMax,
  ];
  for (const v of candidates) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return 10; // default
}

export default function App() {
  const [products, setProducts] = useState([]);

  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const [isPublishOpen, setIsPublishOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  const [currentView, setCurrentView] = useState("home"); // home | profile | how-it-works
  const [selectedProduct, setSelectedProduct] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Todo");
  const [selectedSubcategory, setSelectedSubcategory] = useState("");

  const [selectedCity, setSelectedCity] = useState("Bogotá");
  const [selectedLocality, setSelectedLocality] = useState("Todas");

  const [quickTipo, setQuickTipo] = useState("todo"); // todo | donacion | venta | destacado
  const [onlyActive, setOnlyActive] = useState(true);
  const [sortOrder, setSortOrder] = useState("newest"); // newest | oldest

  const [isManageOpen, setIsManageOpen] = useState(false);
  const [manageArticle, setManageArticle] = useState(null);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editArticle, setEditArticle] = useState(null);

  const [reservingId, setReservingId] = useState(null);

  // ✅ Chat global
  const [chatOpen, setChatOpen] = useState(null);
  // chatOpen = { article, chat, otherUserId, role, errorMessage? }

  // ✅ Notificaciones
  const [notifChatCount, setNotifChatCount] = useState(0);
  const [notifProfileCount, setNotifProfileCount] = useState(0);
  // notifByArticulo[id] = { unreadChats, newSolicitudes, pendingVentas, total }
  const [notifByArticulo, setNotifByArticulo] = useState({});
  // ✅ lista para dropdown (Navbar)
  const [notifications, setNotifications] = useState([]);

  const getActiveUid = useCallback(() => currentUser?.id || null, [currentUser]);
  const isUserBlocked = !!(currentUser?.is_blocked || currentUser?.bloqueado);


  // =========================================================
  // ✅ LocalStorage helpers (visto/no visto por chat y por solicitudes)
  // =========================================================

  const lsKeyChats = useCallback((uid) => `mb_seen_chats_${uid}`, []);
  const lsKeyPosts = useCallback((uid) => `mb_seen_posts_${uid}`, []);

  const readSeenMap = (key) => {
    try {
      const raw = localStorage.getItem(key);
      const obj = raw ? JSON.parse(raw) : {};
      return obj && typeof obj === "object" ? obj : {};
    } catch {
      return {};
    }
  };

  const writeSeenMap = (key, mapObj) => {
    try {
      localStorage.setItem(key, JSON.stringify(mapObj || {}));
    } catch {}
  };

  const markChatSeen = useCallback(
    (chatId) => {
      const uid = getActiveUid();
      if (!uid || !chatId) return;
      const key = lsKeyChats(uid);
      const map = readSeenMap(key);
      map[String(chatId)] = new Date().toISOString();
      writeSeenMap(key, map);
    },
    [getActiveUid, lsKeyChats]
  );

  const markSolicitudesSeenForArticulo = useCallback(
    (articuloId) => {
      const uid = getActiveUid();
      if (!uid || !articuloId) return;
      const key = lsKeyPosts(uid);
      const map = readSeenMap(key);
      map[String(articuloId)] = new Date().toISOString();
      writeSeenMap(key, map);
    },
    [getActiveUid, lsKeyPosts]
  );

  // =========================================================
  // ✅ CHATS: helpers robustos (seller_id / owner_id / usuario_id)
  // =========================================================

  const inferSellerIdFromArticle = (article) => {
    return article?.seller_id || article?.owner_id || article?.usuario_id || null;
  };

  const safeGetOtherUserId = (uid, chatRow) => {
    const buyerId = chatRow?.buyer_id ?? null;
    const sellerId =
      chatRow?.seller_id ??
      chatRow?.owner_id ??
      chatRow?.usuario_id ??
      chatRow?.sellerUid ??
      null;

    if (String(uid) === String(sellerId)) return buyerId;
    if (String(uid) === String(buyerId)) return sellerId;
    return sellerId || buyerId || null;
  };

  const readChatByArticuloAndBuyer = async ({ articuloId, buyerId }) => {
    const { data, error } = await supabase
      .from("chats")
      .select("*")
      .eq("articulo_id", articuloId)
      .eq("buyer_id", buyerId)
      .maybeSingle();

    return { data, error };
  };

  const readChatByArticuloAndMember = async ({ articuloId, uid }) => {
    let res = await supabase
      .from("chats")
      .select("*")
      .eq("articulo_id", articuloId)
      .or(`buyer_id.eq.${uid},seller_id.eq.${uid}`)
      .maybeSingle();

    if (res?.error?.message && /Could not find the 'seller_id' column/i.test(res.error.message)) {
      res = await supabase
        .from("chats")
        .select("*")
        .eq("articulo_id", articuloId)
        .or(`buyer_id.eq.${uid},owner_id.eq.${uid}`)
        .maybeSingle();
    }

    if (res?.error?.message && /Could not find the 'owner_id' column/i.test(res.error.message)) {
      res = await supabase
        .from("chats")
        .select("*")
        .eq("articulo_id", articuloId)
        .or(`buyer_id.eq.${uid},usuario_id.eq.${uid}`)
        .maybeSingle();
    }

    return { data: res.data, error: res.error };
  };

  const ensureChatExists = async ({ article, articuloId, buyerId }) => {
    const sellerId = inferSellerIdFromArticle(article);

    if (!sellerId || !buyerId) {
      return { chat: null, errorMessage: "No se pudo crear chat: falta sellerId o buyerId." };
    }

    const payload1 = { articulo_id: articuloId, seller_id: sellerId, buyer_id: buyerId, status: "open" };
    let upsertErr = null;

    const r1 = await supabase.from("chats").upsert(payload1, { onConflict: "articulo_id,buyer_id" });

    if (r1?.error) {
      upsertErr = r1.error;

      if (r1.error?.message && /Could not find the 'seller_id' column/i.test(r1.error.message)) {
        const payload2 = { articulo_id: articuloId, owner_id: sellerId, buyer_id: buyerId, status: "open" };
        const r2 = await supabase.from("chats").upsert(payload2, { onConflict: "articulo_id,buyer_id" });

        if (r2?.error) {
          upsertErr = r2.error;

          if (r2.error?.message && /Could not find the 'owner_id' column/i.test(r2.error.message)) {
            const payload3 = { articulo_id: articuloId, usuario_id: sellerId, buyer_id: buyerId, status: "open" };
            const r3 = await supabase.from("chats").upsert(payload3, { onConflict: "articulo_id,buyer_id" });
            if (r3?.error) upsertErr = r3.error;
            else upsertErr = null;
          }
        } else {
          upsertErr = null;
        }
      }
    } else {
      upsertErr = null;
    }

    const { data: chatRow, error: readErr } = await readChatByArticuloAndBuyer({ articuloId, buyerId });

    if (!chatRow?.id) {
      const msg = readErr?.message || upsertErr?.message || "No se pudo abrir el chat (no existe o RLS).";
      return { chat: null, errorMessage: msg };
    }

    return { chat: chatRow, errorMessage: null };
  };

  // =========================================================
  // ✅ Notificaciones: cargar y calcular globos + lista dropdown
  // =========================================================

  const buildArticleThumb = (article) => {
    if (!article) return "";
    const img =
      article.image_url ||
      article.imagen_url_principal ||
      (Array.isArray(article.imagenes) ? article.imagenes?.[0] : null) ||
      (Array.isArray(article.imagenes_db) ? article.imagenes_db?.[0] : null) ||
      "";
    return img || "";
  };

  // ✅ chats fetch robusto (seller_id -> owner_id -> usuario_id)
  const fetchChatsForUid = useCallback(async (uid) => {
    let res = await supabase
      .from("chats")
      .select("id, articulo_id, buyer_id, seller_id, status, created_at, last_message_at")
      .or(`buyer_id.eq.${uid},seller_id.eq.${uid}`);

    if (res?.error?.message && /Could not find the 'seller_id' column/i.test(res.error.message)) {
      res = await supabase
        .from("chats")
        .select("id, articulo_id, buyer_id, owner_id, status, created_at, last_message_at")
        .or(`buyer_id.eq.${uid},owner_id.eq.${uid}`);
    }

    if (res?.error?.message && /Could not find the 'owner_id' column/i.test(res.error.message)) {
      res = await supabase
        .from("chats")
        .select("id, articulo_id, buyer_id, usuario_id, status, created_at, last_message_at")
        .or(`buyer_id.eq.${uid},usuario_id.eq.${uid}`);
    }

    return { data: Array.isArray(res?.data) ? res.data : [], error: res?.error || null };
  }, []);

  const loadNotifications = useCallback(async () => {
    const uid = getActiveUid();
    if (!uid) {
      setNotifChatCount(0);
      setNotifProfileCount(0);
      setNotifByArticulo({});
      setNotifications([]);
      return;
    }

    const byArticulo = {}; // { [articuloId]: { unreadChats, newSolicitudes, pendingVentas, total } }

    const addArticulo = (articuloId, patch) => {
      if (!articuloId) return;
      const k = String(articuloId);
      byArticulo[k] = byArticulo[k] || { unreadChats: 0, newSolicitudes: 0, pendingVentas: 0, total: 0 };
      byArticulo[k] = {
        ...byArticulo[k],
        ...patch,
      };
      byArticulo[k].total =
        (byArticulo[k].unreadChats || 0) +
        (byArticulo[k].newSolicitudes || 0) +
        (byArticulo[k].pendingVentas || 0);
    };

    // Para títulos/imagenes rápidos
    const articleById = Object.fromEntries((products || []).map((p) => [String(getArticuloId(p) || ""), p]));

    const dropdownItems = [];

    // 1) Ventas pendientes (desde products ya cargados)
    let pendingVentas = 0;
    try {
      const mine = (products || []).filter((p) => String(p?.owner_id || p?.usuario_id || "") === String(uid));
      for (const it of mine) {
        const estado = normEstado(it?.estado || it?.status || "");
        const tipo = normTipo(it?.mode || it?.tipo || "");
        const buyerId = it?.buyer_id || it?.buyerId || null;
        const artId = getArticuloId(it);

        if (tipo === "venta" && estado === "reservado" && buyerId) {
          pendingVentas += 1;

          const prev = byArticulo[String(artId)]?.pendingVentas || 0;
          addArticulo(artId, { pendingVentas: prev + 1 });

          dropdownItems.push({
            id: `venta-${String(artId)}`,
            type: "venta",
            articulo_id: artId,
            buyer_id: buyerId,
            created_at: it?.reserved_at || it?.updated_at || it?.created_at || new Date().toISOString(),
            title: "Venta pendiente",
            subtitle: `${it?.title || it?.titulo || "Artículo"} reservado. Toca para gestionar / abrir chat.`,
            thumb: buildArticleThumb(it),
          });
        }
      }
    } catch {}

    // 2) Solicitudes nuevas (postulaciones) para MIS artículos
    let newSolicitudes = 0;
    const solicitudesAgg = {}; // { [artId]: { count, latestAt } }
    try {
      const myArticuloIds = Array.from(
        new Set(
          (products || [])
            .filter((p) => String(p?.owner_id || p?.usuario_id || "") === String(uid))
            .map((p) => getArticuloId(p))
            .filter(Boolean)
        )
      );

      if (myArticuloIds.length) {
        const seenKey = lsKeyPosts(uid);
        const seenMap = readSeenMap(seenKey);

        const { data: posts, error: postErr } = await supabase
          .from("postulaciones")
          .select("id, articulo_id, created_at")
          .in("articulo_id", myArticuloIds)
          .order("created_at", { ascending: false })
          .limit(500);

        if (!postErr && Array.isArray(posts)) {
          for (const p of posts) {
            const artId = p?.articulo_id;
            const createdAtMs = p?.created_at ? new Date(p.created_at).getTime() : 0;
            const seenAtStr = seenMap[String(artId)];
            const seenAtMs = seenAtStr ? new Date(seenAtStr).getTime() : 0;

            if (createdAtMs && createdAtMs > seenAtMs) {
              newSolicitudes += 1;

              const prev = byArticulo[String(artId)]?.newSolicitudes || 0;
              addArticulo(artId, { newSolicitudes: prev + 1 });

              solicitudesAgg[String(artId)] = solicitudesAgg[String(artId)] || { count: 0, latestAt: 0 };
              solicitudesAgg[String(artId)].count += 1;
              solicitudesAgg[String(artId)].latestAt = Math.max(solicitudesAgg[String(artId)].latestAt, createdAtMs);
            }
          }
        }
      }
    } catch {}

    // push solicitudes agg a dropdown
    try {
      for (const [artIdStr, agg] of Object.entries(solicitudesAgg)) {
        const art = articleById[artIdStr];
        const title = art?.title || art?.titulo || "Tu publicación";
        dropdownItems.push({
          id: `post-${artIdStr}`,
          type: "postulacion",
          articulo_id: art?.id || Number(artIdStr) || artIdStr,
          created_at: new Date(agg.latestAt || Date.now()).toISOString(),
          title: "Nuevas solicitudes",
          subtitle: `${agg.count} nueva(s) en: ${title}. Toca para ver.`,
          thumb: buildArticleThumb(art),
        });
      }
    } catch {}

    // 3) Mensajes no vistos (chat_messages) usando seenMap por chatId
    let totalUnread = 0;
    const unreadChatAgg = {}; // { [chatId]: { count, latestAt, chatRow } }

    try {
      const chatsRes = await fetchChatsForUid(uid);
      const chats = Array.isArray(chatsRes?.data) ? chatsRes.data : [];
      const chatIds = chats.map((c) => c?.id).filter(Boolean);

      if (chatIds.length) {
        const seenKey = lsKeyChats(uid);
        const seenMap = readSeenMap(seenKey);

        const { data: msgs, error: msgErr } = await supabase
          .from("chat_messages")
          .select("id, chat_id, sender_id, created_at")
          .in("chat_id", chatIds)
          .order("created_at", { ascending: false })
          .limit(800);

        if (!msgErr && Array.isArray(msgs)) {
          const chatById = Object.fromEntries(chats.map((c) => [String(c.id), c]));
          const chatToArticulo = Object.fromEntries(chats.map((c) => [String(c.id), c?.articulo_id]));

          for (const m of msgs) {
            const chatId = m?.chat_id;
            const senderId = m?.sender_id;
            if (!chatId) continue;
            if (String(senderId) === String(uid)) continue;

            const createdAt = m?.created_at ? new Date(m.created_at).getTime() : 0;
            const seenAtStr = seenMap[String(chatId)];
            const seenAt = seenAtStr ? new Date(seenAtStr).getTime() : 0;

            if (createdAt && createdAt > seenAt) {
              totalUnread += 1;

              const artId = chatToArticulo[String(chatId)];
              const prev = byArticulo[String(artId)]?.unreadChats || 0;
              addArticulo(artId, { unreadChats: prev + 1 });

              unreadChatAgg[String(chatId)] = unreadChatAgg[String(chatId)] || {
                count: 0,
                latestAt: 0,
                chatRow: chatById[String(chatId)] || null,
              };
              unreadChatAgg[String(chatId)].count += 1;
              unreadChatAgg[String(chatId)].latestAt = Math.max(unreadChatAgg[String(chatId)].latestAt, createdAt);
            }
          }
        }

        for (const [chatIdStr, agg] of Object.entries(unreadChatAgg)) {
          const chatRow = agg.chatRow;
          const artId = chatRow?.articulo_id;
          const art = articleById[String(artId)];
          const artTitle = art?.title || art?.titulo || "Artículo";

          dropdownItems.push({
            id: `chat-${chatIdStr}`,
            type: "chat",
            chat_id: chatRow?.id,
            articulo_id: artId,
            buyer_id: chatRow?.buyer_id,
            created_at: new Date(agg.latestAt || Date.now()).toISOString(),
            title: "Mensaje nuevo",
            subtitle: `${agg.count} nuevo(s) en: ${artTitle}. Toca para abrir.`,
            thumb: buildArticleThumb(art),
          });
        }
      }
    } catch {}

    // 4) Elegido como ganador de donación/rescate
    try {
      const lsKeyGanador = `mb_seen_ganador_${uid}`;
      const seenGanador = readSeenMap(lsKeyGanador);
      const allProducts = Array.isArray(products) ? products : [];
      for (const p of allProducts) {
        const ganadorId = p?.ganador_id || p?.winner_id || p?.winnerUid || p?.recipient_id || null;
        if (!ganadorId || String(ganadorId) !== String(uid)) continue;
        const tipo = normTipo(p?.mode || p?.tipo || "");
        if (tipo === "venta") continue; // ventas ya se manejan arriba
        const estado = normEstado(p?.estado || p?.status || "");
        if (estado !== "reservado" && estado !== "entregado") continue;
        const artId = getArticuloId(p);
        if (!artId) continue;
        const updatedAt = p?.updated_at || p?.reserved_at || p?.created_at || new Date().toISOString();
        const updatedMs = new Date(updatedAt).getTime();
        const seenMs = seenGanador[String(artId)] ? new Date(seenGanador[String(artId)]).getTime() : 0;
        if (updatedMs <= seenMs) continue;
        dropdownItems.push({
          id: `ganador-${String(artId)}`,
          type: "ganador",
          articulo_id: artId,
          created_at: updatedAt,
          title: "¡Fuiste elegido! 🎉",
          subtitle: `${p?.titulo || p?.title || "Artículo"} — Abre el chat para coordinar la entrega.`,
          thumb: buildArticleThumb(p),
        });
      }
    } catch {}

    const sortedDropdown = [...dropdownItems].sort((a, b) => {
      const ta = a?.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b?.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });

    setNotifChatCount(totalUnread);
    setNotifProfileCount(totalUnread + newSolicitudes + pendingVentas);
    setNotifByArticulo(byArticulo);
    setNotifications(sortedDropdown);
  }, [getActiveUid, lsKeyChats, lsKeyPosts, products, fetchChatsForUid]);

  // =========================================================
  // ✅ helper: abrir chat por articulo + buyerId
  // =========================================================

  const openChatByArticleAndBuyer = useCallback(
    async ({ article, buyerId }) => {
      const uid = getActiveUid();
      const articuloId = getArticuloId(article);

      if (!uid) return alert("Debes iniciar sesión.");
      if (!articuloId) return alert("Este artículo no tiene ID válido.");
      if (!buyerId) return alert("No se encontró buyerId para abrir chat.");
      if (isUserBlocked) {
  alert("🚫 Tu cuenta está BLOQUEADA. No puedes acceder a chats por el momento.");
  return;
}

      // ✅ BLOQUEO REVISIÓN (central)
      if (isInReview(article)) {
        alert("Este artículo está en revisión. El chat está deshabilitado temporalmente.");
        return;
      }

      const { data: chatRow, error } = await readChatByArticuloAndBuyer({ articuloId, buyerId });

      let finalChat = chatRow;
      let errMsg = null;

      if (error || !finalChat?.id) {
        const ensured = await ensureChatExists({ article, articuloId, buyerId });
        finalChat = ensured.chat;
        errMsg = ensured.errorMessage || null;
      }

      const otherUserId = finalChat ? safeGetOtherUserId(uid, finalChat) : inferSellerIdFromArticle(article);

      const role =
        finalChat && String(uid) === String(finalChat?.buyer_id)
          ? "buyer"
          : finalChat &&
            (String(uid) === String(finalChat?.seller_id) ||
              String(uid) === String(finalChat?.owner_id) ||
              String(uid) === String(finalChat?.usuario_id))
          ? "seller"
          : "buyer";

      setChatOpen({
        article,
        chat: finalChat || null,
        otherUserId: otherUserId || null,
        role,
        errorMessage: finalChat ? null : errMsg || "No se pudo abrir el chat (RLS o no existe).",
      });

      if (finalChat?.id) {
        markChatSeen(finalChat.id);
        loadNotifications();
      }

      if (!finalChat?.id) {
        console.log("CHAT OPEN FALLÓ:", error || errMsg);
      }
    },
    [getActiveUid, markChatSeen, loadNotifications, isUserBlocked]

  );

  // ✅ helper: abrir chat por articulo para el usuario actual (buyer o seller)
  const openChatFromArticle = useCallback(
    async (article) => {
      const uid = getActiveUid();
      const articuloId = getArticuloId(article);
      if (!uid) return alert("Debes iniciar sesión.");
      if (!articuloId) return alert("Este artículo no tiene ID válido.");
      if (isUserBlocked) {
  alert("🚫 Tu cuenta está BLOQUEADA. No puedes acceder a chats por el momento.");
  return;
}

      // ✅ BLOQUEO REVISIÓN (central)
      if (isInReview(article)) {
        alert("Este artículo está en revisión. El chat está deshabilitado temporalmente.");
        return;
      }

      const { data: chatRow, error } = await readChatByArticuloAndMember({ articuloId, uid });

      let finalChat = chatRow;
      let errMsg = null;

      if (error || !finalChat?.id) {
        const buyerCandidate =
          article?.buyer_id ||
          article?.buyerId ||
          article?.ganador_id ||
          article?.winner_id ||
          article?.recipient_id ||
          uid;

        const ensured = await ensureChatExists({ article, articuloId, buyerId: buyerCandidate });

        finalChat = ensured.chat;
        errMsg = ensured.errorMessage || null;
      }

      const otherUserId = finalChat ? safeGetOtherUserId(uid, finalChat) : inferSellerIdFromArticle(article);

      const role =
        finalChat && String(uid) === String(finalChat?.buyer_id)
          ? "buyer"
          : finalChat &&
            (String(uid) === String(finalChat?.seller_id) ||
              String(uid) === String(finalChat?.owner_id) ||
              String(uid) === String(finalChat?.usuario_id))
          ? "seller"
          : "buyer";

      setChatOpen({
        article,
        chat: finalChat || null,
        otherUserId: otherUserId || null,
        role,
        errorMessage: finalChat ? null : errMsg || "No se pudo abrir el chat (RLS o no existe).",
      });

      if (finalChat?.id) {
        markChatSeen(finalChat.id);
        loadNotifications();
      }

      if (!finalChat?.id) {
        console.log("No se pudo cargar chat:", error || errMsg);
      }
    },
    [getActiveUid, markChatSeen, loadNotifications]
  );

  // =========================================================
  // ✅ helper: abrir gestión desde notificación (postulación/venta)
  // =========================================================
  const openManageFromNotif = useCallback(
    async (articuloId) => {
      if (!currentUser) {
        setIsAuthOpen(true);
        return;
      }
      if (!articuloId) return;

      const art = (products || []).find((p) => String(getArticuloId(p)) === String(articuloId)) || null;
      if (!art) {
        setCurrentView("profile");
        return;
      }

      markSolicitudesSeenForArticulo(getArticuloId(art));

      setManageArticle(art);
      setIsManageOpen(true);
      setCurrentView("profile");

      loadNotifications();
    },
    [currentUser, products, markSolicitudesSeenForArticulo, loadNotifications]
  );

  // =========================================================
  // ✅ Sesión Supabase + merge con tabla usuarios
  // =========================================================

  useEffect(() => {
    let alive = true;

    const hydrateUser = async (session) => {
      try {
        const sbUser = session?.user || null;
        if (!alive) return;

        if (!sbUser) {
          setCurrentUser(null);
          setCurrentView("home");
          setSelectedProduct(null);
          setIsPublishOpen(false);
          setIsAuthOpen(false);
          setIsManageOpen(false);
          setManageArticle(null);
          setIsEditOpen(false);
          setEditArticle(null);
          setChatOpen(null);

          setNotifChatCount(0);
          setNotifProfileCount(0);
          setNotifByArticulo({});
          setNotifications([]);

          setLoading(false);
          return;
        }

        let merged = { ...sbUser, email: sbUser.email };

// 1) intenta DB pero SIN romper si no hay fila o RLS
const dbRes = await supabase
  .from("usuarios")
  .select("*")
  .eq("id", sbUser.id)
  .maybeSingle();

if (!dbRes?.error && dbRes?.data) {
  merged = { ...merged, ...dbRes.data };
}

// 2) fallback SIEMPRE desde metadata (esto te salva cuando DB no responde)
const m = sbUser?.user_metadata || {};
const metaFoto = m.foto_url || m.avatar_url || m.photo_url || "";

if (!merged.foto_url && metaFoto) merged.foto_url = metaFoto;
if (!merged.nombre && (m.nombre || m.full_name || m.name)) merged.nombre = m.nombre || m.full_name || m.name;

        if (!alive) return;
        setCurrentUser(merged);
        setLoading(false);
      } catch (e) {
        console.error("Error cargando sesión/perfil:", e);
        if (!alive) return;
        setCurrentUser(null);
        setLoading(false);
      }
    };

    supabase.auth.getSession().then(({ data }) => hydrateUser(data?.session));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      hydrateUser(session);
    });

    return () => {
      alive = false;
      listener?.subscription?.unsubscribe?.();
    };
  }, []);

  // =========================================================
  // ✅ Loader artículos + owner_name/photo + ✅ interested_count
  // =========================================================

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("articulos")
      .select(
        `
        *,
        articulo_imagenes:articulo_imagenes (
          id, url, path, position, created_at
        )
      `
      )
      .order("created_at", { ascending: false })
      .order("position", { foreignTable: "articulo_imagenes", ascending: true });

    if (error) {
      console.error("Error cargando articulos:", error);
      return;
    }

    const raw = Array.isArray(data) ? data : [];
    const ownerIds = Array.from(new Set(raw.map((it) => it?.usuario_id || it?.owner_id).filter(Boolean)));

    let ownersMap = {};
    if (ownerIds.length) {
      const { data: owners, error: ownersErr } = await supabase
        .from("usuarios_publicos")
        .select("id,nombre,foto_url")
        .in("id", ownerIds);

      if (ownersErr) console.log("Error cargando usuarios_publicos:", ownersErr);
      else ownersMap = Object.fromEntries((owners || []).map((u) => [u.id, u]));
    }

    // ✅ 1) normaliza primero (como ya lo hacías)
    let normalized = raw.map((it) => {
      const imgsRel = Array.isArray(it.articulo_imagenes) ? it.articulo_imagenes : [];
      const imgsRelUrls = imgsRel.map((x) => x?.url).filter(Boolean);
      const imgsDb = Array.isArray(it.imagenes) ? it.imagenes.filter(Boolean) : [];

      const ownerId = it?.usuario_id || it?.owner_id;
      const ownerPublic = ownerId ? ownersMap[ownerId] : null;

      return {
        ...it,
        // ✅ Destacado (normalizado para UI)
        isFeatured: !!(it?.isFeatured ?? it?.is_featured ?? it?.destacado ?? it?.featured ?? false),
        articulo_imagenes: imgsRel,
        imagenes_db: imgsDb,
        imagenes: imgsRelUrls.length ? imgsRelUrls : imgsDb,
        owner_name_from_user_table: ownerPublic?.nombre || "",
        owner_photo: ownerPublic?.foto_url || "",
        interested_count: 0, // ✅ default
      };
    });

    // ✅ 2) calcular interesados por artículo (postulaciones)
    try {
      const ids = normalized.map((x) => getArticuloId(x)).filter(Boolean);
      const counts = {}; // { [artId]: count }

      const chunks = chunkArray(ids, 200);

      for (const ch of chunks) {
        const { data: posts, error: postErr } = await supabase
          .from("postulaciones")
          .select("articulo_id")
          .in("articulo_id", ch)
          .limit(5000);

        if (postErr) {
          break;
        }

        if (Array.isArray(posts)) {
          for (const p of posts) {
            const aid = p?.articulo_id;
            if (!aid) continue;
            const k = String(aid);
            counts[k] = (counts[k] || 0) + 1;
          }
        }
      }

      normalized = normalized.map((it) => {
        const id = getArticuloId(it);
        const c = id ? (counts[String(id)] || 0) : 0;
        return { ...it, interested_count: c };
      });
    } catch {}

    setProducts(normalized);

    setSelectedProduct((prev) => {
      if (!prev?.id) return prev;
      const updated = normalized.find((x) => x.id === prev.id);
      return updated ? { ...prev, ...updated } : prev;
    });
  }, []);

  // ✅ Poll simple (cada 7s): load + notifs
  useEffect(() => {
    let alive = true;

    const run = async () => {
      await load();
      await loadNotifications();
    };

    run();

    const t = setInterval(() => {
      if (!alive) return;
      load();
      loadNotifications();
    }, 7000);

    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [load, loadNotifications]);

  // =========================================================
  // ✅ REALTIME: refresca dropdown al llegar postulación/mensaje
  // =========================================================
  const rtRef = useRef({ channel: null, uid: null });

  useEffect(() => {
    const uid = getActiveUid();

    if (rtRef.current.channel) {
      try {
        supabase.removeChannel(rtRef.current.channel);
      } catch {}
      rtRef.current.channel = null;
      rtRef.current.uid = null;
    }

    if (!uid) return;

    const ch = supabase.channel(`mb-notifs-${uid}`);

    ch.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "postulaciones" },
      async (payload) => {
        const artId = payload?.new?.articulo_id;
        if (!artId) return;

        const isMine = (products || []).some(
          (p) =>
            String(getArticuloId(p)) === String(artId) &&
            String(p?.owner_id || p?.usuario_id || "") === String(uid)
        );

        if (!isMine) return;

        loadNotifications();
      }
    );

    ch.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "chat_messages" },
      async () => {
        loadNotifications();
      }
    );

    ch.subscribe();

    rtRef.current.channel = ch;
    rtRef.current.uid = uid;

    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {}
      rtRef.current.channel = null;
      rtRef.current.uid = null;
    };
  }, [getActiveUid, products, loadNotifications]);

  const currentCityData = useMemo(() => {
    return COLOMBIA_DATA.find((c) => c.city === selectedCity);
  }, [selectedCity]);

  const handlePublishClick = () => {
    if (!currentUser) setIsAuthOpen(true);
    else setIsPublishOpen(true);
  };

  const handleProfileClick = () => {
    if (!currentUser) return setIsAuthOpen(true);
    setCurrentView("profile");
  };

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (e) {
      console.error("LOGOUT ERROR:", e);
      alert("No se pudo cerrar sesión.");
    }
  };

  const handleAddProduct = (newItem) => {
    if (newItem?.id) setProducts((prev) => [newItem, ...prev]);
    setIsPublishOpen(false);
  };

  // ✅ APPLY (donación/regalo)
  const handleApply = async (productId, message) => {
    const uid = getActiveUid();

    if (!uid) {
      alert("Debes iniciar sesión para solicitar.");
      setIsAuthOpen(true);
      return;
    }

    const p = products.find((x) => x.id === productId);
    const estadoActual = normEstado(p?.estado || p?.status || "disponible");

    // ✅ BLOQUEO REVISIÓN (opcional pero coherente)
    if (p && isInReview(p)) {
      alert("Este artículo está en revisión. No se pueden enviar solicitudes por ahora.");
      return;
    }

    if (estadoActual === "entregado") {
      alert("Este artículo ya fue marcado como ENTREGADO. No se pueden enviar solicitudes.");
      return;
    }

    if (p && estadoActual !== "disponible") {
      alert("Este artículo ya no está disponible para nuevas solicitudes.");
      return;
    }

    const ownerId = p?.owner_id || p?.usuario_id || null;
    if (ownerId && ownerId === uid) {
      alert("Esta es tu publicación. No puedes postularte a tu propio artículo.");
      return;
    }

    try {
      const { data: ya, error: errYa } = await supabase
        .from("postulaciones")
        .select("id")
        .eq("articulo_id", productId)
        .eq("usuario_id", uid)
        .maybeSingle();

      if (!errYa && ya?.id) {
        alert("Ya te postulaste a este artículo.");
        return;
      }

      const res = await crearPostulacionConLimite({ articuloId: productId, usuarioId: uid, justificacion: message || "", applyRateLimit: true });
      if (res && res.success === false) {
        // res.error ya viene listo (bloqueo/filtro/límite)
        throw new Error(res.error || "No se pudo enviar tu solicitud.");
      }

      alert("¡Solicitud enviada! El vendedor decidirá a quién entregárselo.");
      await load();
      await loadNotifications();
    } catch (err) {
      console.error("Error enviando postulación:", err);
      alert(String(err?.message || "Error enviando la solicitud. Intenta de nuevo."));
    }
  };

  // ✅ BUY (reserva + buyer_id + crear chat)
  const handleBuy = async (productId) => {
    const uid = getActiveUid();

    if (!uid) {
      alert("Debes iniciar sesión para reservar.");
      setIsAuthOpen(true);
      return;
    }

    if (reservingId === productId) return;
    setReservingId(productId);

    const p = products.find((x) => x.id === productId);
    const estadoActual = normEstado(p?.estado || p?.status || "disponible");

    // ✅ BLOQUEO REVISIÓN: no reservar + no chat
    if (p && isInReview(p)) {
      alert("Este artículo está en revisión. No se puede reservar ni chatear por ahora.");
      setReservingId(null);
      return;
    }

    if (p && estadoActual !== "disponible") {
      alert("Este artículo ya no está disponible.");
      setReservingId(null);
      return;
    }

    const sellerId = p?.owner_id || p?.usuario_id || null;

    if (!sellerId) {
      alert("Este artículo no tiene vendedor (owner_id/usuario_id) válido.");
      setReservingId(null);
      return;
    }

    if (sellerId === uid) {
      alert("Esta es tu publicación. No puedes reservar tu propio artículo.");
      setReservingId(null);
      return;
    }

    try {
      const patch = {
        estado: "reservado",
        status: "reservado",
        buyer_id: uid,
        reserved_at: new Date().toISOString(),
      };

      const { error: upErr } = await safeUpdateArticulos(productId, patch);

      if (upErr) {
        console.log("UPDATE ARTICULOS ERROR FULL:", upErr);
        alert(
          "UPDATE FALLÓ: " +
            (upErr?.message || "") +
            (upErr?.code ? ` | code=${upErr.code}` : "") +
            (upErr?.details ? ` | details=${upErr.details}` : "")
        );
        throw upErr;
      }

      setProducts((prev) => prev.map((it) => (it?.id === productId ? { ...it, ...patch } : it)));

      setSelectedProduct((prev) => {
        if (!prev) return prev;
        const prevId = getArticuloId(prev);
        if (prevId !== productId) return prev;
        return { ...prev, ...patch };
      });

      const ensured = await ensureChatExists({ article: p, articuloId: productId, buyerId: uid });

      alert("Artículo reservado. Se habilitó el chat con el vendedor ✅");

      setChatOpen({
        article: p,
        chat: ensured.chat || null,
        otherUserId: sellerId,
        role: "buyer",
        errorMessage: ensured.chat ? null : ensured.errorMessage,
      });

      if (ensured?.chat?.id) {
        markChatSeen(ensured.chat.id);
      }

      await load();
      await loadNotifications();
    } catch (err) {
      console.error("HANDLEBUY ERROR:", err);
      alert(
        "Error reservando el artículo.\n" +
          "Revisa consola: UPDATE ARTICULOS ERROR FULL.\n" +
          "Esto suele ser RLS/permisos."
      );
    } finally {
      setReservingId(null);
    }
  };

  // ✅ CANCELAR VENTA
  const cancelSale = async (articleId) => {
    try {
      const { error: err1 } = await safeUpdateArticulos(articleId, {
        estado: "disponible",
        status: "disponible",
        buyer_id: null,
        reserved_at: null,
      });

      if (err1) {
        console.log("CANCEL UPDATE ERROR FULL:", err1);
        throw err1;
      }

      setProducts((prev) =>
        prev.map((it) =>
          it?.id === articleId
            ? { ...it, estado: "disponible", status: "disponible", buyer_id: null, reserved_at: null }
            : it
        )
      );

      setSelectedProduct((prev) => {
        if (!prev) return prev;
        const prevId = getArticuloId(prev);
        if (prevId !== articleId) return prev;
        return { ...prev, estado: "disponible", status: "disponible", buyer_id: null, reserved_at: null };
      });

      try {
        const { error: err2 } = await supabase.from("chats").update({ status: "closed" }).eq("articulo_id", articleId);
        if (err2) console.log("No se pudo cerrar chat (opcional):", err2);
      } catch (e) {
        console.log("Cerrar chat (opcional) falló:", e?.message || e);
      }

      alert("Venta cancelada. El artículo volvió a estar disponible ✅");
      await load();
      await loadNotifications();
    } catch (e) {
      console.error(e);
      alert("No se pudo cancelar la venta.");
    }
  };

  // ✅ ELIMINAR PUBLICACIÓN
  const deleteArticle = async (articleId) => {
    const uid = getActiveUid();
    if (!uid) {
      alert("Debes iniciar sesión.");
      throw new Error("no-auth");
    }

    const ok = confirm("¿Eliminar esta publicación? Esta acción no se puede deshacer.");
    if (!ok) return;

    try {
      try {
        const { data: chats, error: chErr } = await supabase.from("chats").select("id").eq("articulo_id", articleId);
        if (!chErr && Array.isArray(chats) && chats.length) {
          const chatIds = chats.map((c) => c?.id).filter(Boolean);
          if (chatIds.length) {
            await supabase.from("chat_messages").delete().in("chat_id", chatIds);
          }
        }
      } catch {}

      try {
        await supabase.from("chats").delete().eq("articulo_id", articleId);
      } catch {}

      try {
        await supabase.from("postulaciones").delete().eq("articulo_id", articleId);
      } catch {}

      try {
        await supabase.from("articulo_imagenes").delete().eq("articulo_id", articleId);
      } catch {}

      const { error } = await supabase.from("articulos").delete().eq("id", articleId);
      if (error) throw error;

      setProducts((prev) => prev.filter((x) => x?.id !== articleId));
      setSelectedProduct((prev) => {
        const pid = getArticuloId(prev);
        return pid === articleId ? null : prev;
      });

      setIsManageOpen(false);
      setManageArticle(null);
      setIsEditOpen(false);
      setEditArticle(null);

      alert("✅ Publicación eliminada.");
      await load();
      await loadNotifications();
    } catch (e) {
      console.error("DELETE ERROR:", e);
      alert("No se pudo eliminar. (Revisa RLS/policies en Supabase).");
      throw e;
    }
  };

  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const uid = getActiveUid();

    const base = products.filter((item) => {
      const estadoActual = normEstado(item?.estado || item?.status || "");
      const tipo = normTipo(item?.mode || item?.tipo || "");

      const ownerId = item?.usuario_id || item?.owner_id || null;
      const ganadorId = item?.ganador_id || item?.winner_id || item?.recipient_id || null;
      const buyerId = item?.buyer_id || item?.buyerId || null;

      const isOwner = uid && ownerId && String(uid) === String(ownerId);
      const isWinner = uid && ganadorId && String(uid) === String(ganadorId);
      const isBuyer = uid && buyerId && String(uid) === String(buyerId);

      if (estadoActual === "entregado") return !!(isOwner || isWinner || isBuyer);
      if (estadoActual === "reservado" && tipo === "venta") return !!(isOwner || isBuyer);

      if (onlyActive && estadoActual === "reservado") return !!(isOwner || isBuyer || isWinner);

      if (quickTipo === "destacado") {
        // ✅ Muestra SOLO los artículos marcados como destacados
        if (!item?.isFeatured) return false;
      } else if (quickTipo !== "todo") {
        // Donación o Venta
        if (tipo !== quickTipo) return false;
      }

      const title = (item.title || item.titulo || "").toLowerCase();
      const categoryText = normStr(getCategoria(item));
      const subcategoryText = normStr(getSubcategoria(item));

      const matchesSearch = !term || title.includes(term) || categoryText.includes(term) || subcategoryText.includes(term);

      const matchesCategory =
        selectedCategory === "Todo" || normStr(getCategoria(item)) === normStr(selectedCategory);

      const matchesSub =
        !selectedSubcategory || normStr(getSubcategoria(item)) === normStr(selectedSubcategory);

      const matchesCity = (item.city || item.ciudad) === selectedCity;
      const matchesLocality = selectedLocality === "Todas" || (item.locality || item.localidad_es) === selectedLocality;

      return matchesSearch && matchesCategory && matchesSub && matchesCity && matchesLocality;
    });

    const sorted = [...base].sort((a, b) => {
      const ta = a?.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b?.created_at ? new Date(b.created_at).getTime() : 0;
      return sortOrder === "oldest" ? ta - tb : tb - ta;
    });

    return sorted;
  }, [
    products,
    searchTerm,
    selectedCategory,
    selectedSubcategory,
    selectedCity,
    selectedLocality,
    getActiveUid,
    quickTipo,
    onlyActive,
    sortOrder,
  ]);

  // ✅ Artículos destacados (filtrados por búsqueda/categoría/ciudad igual que la lista principal)
  const featuredProducts = useMemo(() => {
    return (filteredProducts || []).filter((p) => !!p?.isFeatured);
  }, [filteredProducts]);


  const myProducts = useMemo(() => {
    const uid = getActiveUid();
    if (!uid) return [];
    return products.filter((p) => p.owner_id === uid || p.usuario_id === uid);
  }, [products, getActiveUid]);

  if (loading) {
    return <div className="h-screen flex items-center justify-center font-black uppercase">Cargando MiBatute...</div>;
  }

  return (
    <Routes>
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route
        path="/"
        element={
          <div className="min-h-screen bg-[#F5F5F5]">
            <Navbar
              onSearch={setSearchTerm}
              currentCity={selectedCity}
              onCityChange={(city) => {
                setSelectedCity(city);
                setSelectedLocality("Todas");
              }}
              onPublishClick={handlePublishClick}
              user={currentUser}
              onProfileClick={handleProfileClick}
              onLoginClick={() => setIsAuthOpen(true)}
              onLogout={handleLogout}
              onGoHome={() => setCurrentView("home")}
              notifProfileCount={notifProfileCount}
              notifChatCount={notifChatCount}
              isProfile={currentView === "profile"}
              notifications={notifications}
              onNotificationClick={async (item) => {
                const uid = getActiveUid();
                if (!uid) {
                  setIsAuthOpen(true);
                  return;
                }

                if (item?.type === "chat") {
                  const art =
                    products.find((p) => String(getArticuloId(p)) === String(item?.articulo_id)) || null;

                  if (!art) {
                    setCurrentView("profile");
                    return;
                  }

                  // ✅ BLOQUEO REVISIÓN (NOTIFICACIONES)
                  if (isInReview(art)) {
                    alert("Este artículo está en revisión. El chat está deshabilitado temporalmente.");
                    return;
                  }

                  await openChatByArticleAndBuyer({ article: art, buyerId: item?.buyer_id || uid });
                  return;
                }

                if (item?.type === "postulacion") {
                  await openManageFromNotif(item?.articulo_id);
                  return;
                }

                if (item?.type === "ganador") {
                  const uid2 = getActiveUid();
                  if (uid2 && item?.articulo_id) {
                    try {
                      const lsKeyGanador = `mb_seen_ganador_${uid2}`;
                      const m = readSeenMap(lsKeyGanador);
                      m[String(item.articulo_id)] = new Date().toISOString();
                      writeSeenMap(lsKeyGanador, m);
                    } catch {}
                  }
                  setCurrentView("profile");
                  return;
                }

                if (item?.type === "venta") {
                  await openManageFromNotif(item?.articulo_id);

                  const art =
                    products.find((p) => String(getArticuloId(p)) === String(item?.articulo_id)) || null;

                  if (art && item?.buyer_id) {
                    // ✅ BLOQUEO REVISIÓN (VENTA -> CHAT)
                    if (isInReview(art)) {
                      alert("Este artículo está en revisión. El chat está deshabilitado temporalmente.");
                      return;
                    }
                    await openChatByArticleAndBuyer({ article: art, buyerId: item?.buyer_id });
                  }
                  return;
                }

                setCurrentView("profile");
              }}
              onNotificationSeen={async (item) => {
                if (item?.type === "chat" && item?.chat_id) {
                  markChatSeen(item.chat_id);
                  loadNotifications();
                  return;
                }
                if (item?.type === "postulacion" && item?.articulo_id) {
                  markSolicitudesSeenForArticulo(item.articulo_id);
                  loadNotifications();
                  return;
                }
                loadNotifications();
              }}
              onMessagesClick={() => {
                if (!currentUser) return setIsAuthOpen(true);
                setCurrentView("profile");
              }}
            />

            <main className="max-w-7xl mx-auto px-4 py-8">
              {currentView === "home" && (
                <div className="animate-in fade-in duration-500">
                  {/* Mostrar banner solo cuando NO hay búsqueda (evita que se atraviese entre la barra y resultados) */}
                  {searchTerm.trim() === "" && (
                    <div className="rounded-3xl">
                      <HeroBanner onLearnMore={() => setCurrentView("how-it-works")} />

            {/* ✅ Barra de Destacados (carrusel automático) */}
            {featuredProducts?.length ? (
              <FeaturedTicker
                items={featuredProducts}
                onItemClick={(item) => {
                  setSelectedProduct(item);
                }}
              />
            ) : null}

                    </div>
                  )}

                  <div className="flex flex-col lg:flex-row gap-8">
                    <aside className="lg:w-1/4 space-y-6">
                      {/* Categorías */}
                      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="font-black text-gray-800 uppercase text-xs">
                            Categorías
                          </h3>

                          {(selectedCategory !== "Todo" || selectedSubcategory) && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedCategory("Todo");
                                setSelectedSubcategory("");
                              }}
                              className="text-[10px] font-black uppercase text-gray-500 hover:text-forest-green"
                            >
                              Limpiar
                            </button>
                          )}
                        </div>

                        <div className="space-y-1">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCategory("Todo");
                              setSelectedSubcategory("");
                            }}
                            className={`w-full text-left text-sm py-2 px-3 rounded-2xl transition border ${
                              selectedCategory === "Todo"
                                ? "bg-forest-green text-white font-bold border-forest-green"
                                : "bg-white text-gray-600 border-gray-200 hover:border-forest-green"
                            }`}
                          >
                            Todo
                          </button>

                          {CATEGORY_TREE.map((cat) => {
                            const isActive = selectedCategory === cat.key;
                            return (
                              <div key={cat.key} className="pt-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedCategory(cat.key);
                                    setSelectedSubcategory("");
                                  }}
                                  className={`w-full text-left text-sm py-2 px-3 rounded-2xl transition border ${
                                    isActive
                                      ? "bg-gray-900 text-white font-bold border-gray-900"
                                      : "bg-white text-gray-600 border-gray-200 hover:border-forest-green"
                                  }`}
                                >
                                  {cat.label}
                                </button>

                                {isActive ? (
                                  <div className="mt-2 ml-3 space-y-1 bg-gray-50/70 p-2 rounded-2xl border border-gray-100">
                                    <button
                                      type="button"
                                      onClick={() => setSelectedSubcategory("")}
                                      className={`w-full text-left text-[13px] py-2 px-3 rounded-2xl transition border flex items-center gap-2 ${
                                        !selectedSubcategory
                                          ? "bg-forest-green text-white font-bold border-forest-green"
                                          : "bg-white text-gray-600 border-gray-200 hover:border-forest-green"
                                      }`}
                                    >
                                      <span className={`text-[10px] ${!selectedSubcategory ? "text-white/90" : "text-gray-400"}`}>•</span>
                                      <span className="truncate">Todas</span>
                                    </button>

                                    {cat.subs.map((sub) => (
                                      <button
                                        key={sub}
                                        type="button"
                                        onClick={() => setSelectedSubcategory(sub)}
                                        className={`w-full text-left text-[13px] py-2 px-3 rounded-2xl transition border flex items-center gap-2 ${
                                          selectedSubcategory === sub
                                            ? "bg-forest-green text-white font-bold border-forest-green"
                                            : "bg-white text-gray-600 border-gray-200 hover:border-forest-green"
                                        }`}
                                      >
                                        <span className={`text-[10px] ${selectedSubcategory === sub ? "text-white/90" : "text-gray-400"}`}>•</span>
                                        <span className="truncate">{sub}</span>
                                      </button>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Localidades */}
                      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                        <h3 className="font-black text-gray-800 uppercase text-xs mb-4">
                          Localidades en {selectedCity}
                        </h3>

                        <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                          <button
                            onClick={() => setSelectedLocality("Todas")}
                            className={`w-full text-left text-sm py-1 px-2 rounded-lg transition ${
                              selectedLocality === "Todas"
                                ? "bg-forest-green text-white font-bold"
                                : "text-gray-500 hover:bg-gray-100"
                            }`}
                          >
                            Todas las localidades
                          </button>

                          {(currentCityData?.localities ?? []).map((loc) => (
                            <button
                              key={loc}
                              onClick={() => setSelectedLocality(loc)}
                              className={`w-full text-left text-sm py-1 px-2 rounded-lg transition ${
                                selectedLocality === loc
                                  ? "bg-forest-green text-white font-bold"
                                  : "text-gray-500 hover:bg-gray-100"
                              }`}
                            >
                              {loc}
                            </button>
                          ))}
                        </div>

                        <div className="mt-5 pt-5 border-t border-gray-100 space-y-4">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
                              Tipo de publicación
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {[
                                { key: "todo", label: "Todo" },
                                { key: "donacion", label: "Donación / Regalo" },
                                { key: "venta", label: "Venta" },
                                { key: "destacado", label: "Destacado" },
                              ].map((t) => (
                                <button
                                  key={t.key}
                                  type="button"
                                  onClick={() => setQuickTipo(t.key)}
                                  className={`px-3 py-2 rounded-2xl text-[11px] font-black uppercase transition border ${
                                    quickTipo === t.key
                                      ? "bg-forest-green text-white border-forest-green"
                                      : "bg-white text-gray-600 border-gray-200 hover:border-forest-green"
                                  }`}
                                >
                                  {t.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                                Solo activas
                              </p>
                              <p className="text-[11px] text-gray-500 font-bold">
                                Oculta las reservadas (para el público)
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => setOnlyActive((v) => !v)}
                              className={`shrink-0 px-4 py-2 rounded-2xl text-[11px] font-black uppercase transition border ${
                                onlyActive
                                  ? "bg-forest-green text-white border-forest-green"
                                  : "bg-white text-gray-600 border-gray-200 hover:border-forest-green"
                              }`}
                              title="Ocultar/mostrar reservadas"
                            >
                              {onlyActive ? "Activo" : "Mostrar"}
                            </button>
                          </div>

                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
                              Orden
                            </p>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setSortOrder("newest")}
                                className={`flex-1 px-3 py-2 rounded-2xl text-[11px] font-black uppercase transition border ${
                                  sortOrder === "newest"
                                    ? "bg-forest-green text-white border-forest-green"
                                    : "bg-white text-gray-600 border-gray-200 hover:border-forest-green"
                                }`}
                              >
                                Más nuevas
                              </button>
                              <button
                                type="button"
                                onClick={() => setSortOrder("oldest")}
                                className={`flex-1 px-3 py-2 rounded-2xl text-[11px] font-black uppercase transition border ${
                                  sortOrder === "oldest"
                                    ? "bg-forest-green text-white border-forest-green"
                                    : "bg-white text-gray-600 border-gray-200 hover:border-forest-green"
                                }`}
                              >
                                Más antiguas
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </aside>

                    <div className="lg:w-3/4">
                      <div className="mb-4 flex justify-between items-center">
                        <h2 className="text-lg font-black text-gray-800">
                          {searchTerm ? `Resultados para "${searchTerm}"` : "Últimos hallazgos"}
                        </h2>
                        <span className="text-xs font-bold text-gray-400">
                          {filteredProducts.length} tesoros encontrados
                        </span>
                      </div>

                      {filteredProducts.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                          {filteredProducts.map((item) => {
                            const resolvedImage =
                              item.image_url ||
                              item.imagen_url_principal ||
                              (Array.isArray(item.imagenes) ? item.imagenes : item.imagenes_db) ||
                              "";

                            const resolvedLocation = `${item.city || item.ciudad || ""}${
                              item.locality || item.localidad_es
                                ? `, ${item.locality || item.localidad_es}`
                                : ""
                            }`;

                            const artId = getArticuloId(item);
                            const notif = artId ? notifByArticulo[String(artId)] : null;

                            const interestedCount = Number(item?.interested_count || 0) || 0;
                            const interestedMax = resolveInterestedMax(item);

                            return (
  <div key={item.id} className={isUserBlocked ? "cursor-not-allowed" : "cursor-pointer"}>
    <ProductCard
      title={item.title || item.titulo || "Sin título"}
      location={resolvedLocation}
      mode={normTipo(item.mode || item.tipo || "donacion")}
      price={item.price || 0}
      image={resolvedImage}
      isFeatured={item.isFeatured || false}
      status={item.estado || item.status || "disponible"}
      estadoProducto={typeof item?.estado_producto === "number" ? item.estado_producto : (item?.estado_producto ? Number(item.estado_producto) : null)}
      interestedCount={interestedCount}
      interestedMax={interestedMax}
      notifTotal={notif?.total || 0}
      notifChats={notif?.unreadChats || 0}
      notifSolicitudes={notif?.newSolicitudes || 0}
      notifVentas={notif?.pendingVentas || 0}

      // ✅ NUEVO: bloquea abrir desde la lista
      isUserBlocked={isUserBlocked}
      onBlockedClick={() => alert("🚫 Tu cuenta está BLOQUEADA. No puedes abrir artículos ni acceder a chats por el momento.")}
      onClick={() => {
        if (isUserBlocked) return; // por seguridad
        setSelectedProduct(item);
      }}
    />
  </div>
);

                          })}
                        </div>
                      ) : (
                        <div className="text-center py-20">
                          <p className="text-gray-400 font-bold">
                            No encontramos nada con ese filtro. ¡Sé el primero en publicarlo!
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {currentView === "profile" && (
                <UserProfile
                  user={currentUser}
                  myProducts={myProducts}
                  notifByArticulo={notifByArticulo}
                  onArticuloSeen={(articuloId) => {
                    if (articuloId) markSolicitudesSeenForArticulo(articuloId);
                    loadNotifications();
                  }}
                  onBack={() => setCurrentView("home")}
                  onOpenEdit={(art) => {
                    setEditArticle(art);
                    setIsEditOpen(true);
                  }}
                  onOpenGestion={(art) => {
                    const id = getArticuloId(art);
                    if (id) markSolicitudesSeenForArticulo(id);

                    setManageArticle(art);
                    setIsManageOpen(true);

                    loadNotifications();
                  }}
                  onOpenChat={async ({ article, buyerId }) => {
                    // ✅ BLOQUEO REVISIÓN (perfil)
                    if (isInReview(article)) {
                      alert("Este artículo está en revisión. El chat está deshabilitado temporalmente.");
                      return;
                    }

                    if (buyerId) {
                      await openChatByArticleAndBuyer({ article, buyerId });
                      return;
                    }
                    await openChatFromArticle(article);
                  }}
                  onDelete={async (art) => {
                    const id = getArticuloId(art);
                    if (!id) return alert("Este artículo no tiene id válido.");
                    await deleteArticle(id);
                  }}
                  onArticuloReservado={(articuloActualizado) => {
                    const id = getArticuloId(articuloActualizado);
                    if (!id) return;
                    setProducts((prev) =>
                      prev.map((p) =>
                        String(getArticuloId(p)) === String(id)
                          ? { ...p, ...articuloActualizado }
                          : p
                      )
                    );
                  }}
                />
              )}

              {currentView === "how-it-works" && <HowItWorks onBack={() => setCurrentView("home")} />}
            </main>

            <AuthModal
              isOpen={isAuthOpen}
              onClose={() => setIsAuthOpen(false)}
              onLogin={() => setIsAuthOpen(false)}
            />

            <PublishModal
              isOpen={isPublishOpen}
              onClose={() => setIsPublishOpen(false)}
              onPublish={handleAddProduct}
              currentCity={selectedCity}
              user={currentUser}
              categories={CATEGORY_TREE}
            />

            <ProductDetail
              item={selectedProduct}
              isOpen={!!selectedProduct}
              onClose={() => setSelectedProduct(null)}
              user={currentUser}
              onSolicitar={async (item, message) => {
                const id = getArticuloId(item);
                if (!id) return alert("Este artículo no tiene id válido.");

                const isVenta = normTipo(item?.mode || item?.tipo) === "venta";

                if (isVenta) {
                  await handleBuy(id);
                  return;
                } else {
                  await handleApply(id, message);
                  setSelectedProduct(null);
                }
              }}
              onOpenChat={async (item) => {
                // ✅ BLOQUEO REVISIÓN (detalle)
                if (isInReview(item)) {
                  alert("Este artículo está en revisión. El chat está deshabilitado temporalmente.");
                  return;
                }
                await openChatFromArticle(item);
              }}
              onCategoryClick={(catKey) => {
                setSelectedCategory(String(catKey || "Todo"));
                setSelectedSubcategory("");
                setSearchTerm("");
                setCurrentView("home");
                setSelectedProduct(null);
              }}
              onSubcategoryClick={(catKey, subKey) => {
                if (catKey) setSelectedCategory(String(catKey));
                else setSelectedCategory("Todo");
                setSelectedSubcategory(String(subKey || ""));
                setSearchTerm("");
                setCurrentView("home");
                setSelectedProduct(null);
              }}
            />

            <ManageArticleModal
              isOpen={isManageOpen}
              article={manageArticle}
              onClose={() => {
                setIsManageOpen(false);
                setManageArticle(null);
              }}
              onCancelSale={cancelSale}
              onCancelSaleSuccess={async () => {
                await load();
                await loadNotifications();
              }}
              onOpenChat={async ({ article, buyerId }) => {
                // ✅ BLOQUEO REVISIÓN (gestión)
                if (isInReview(article)) {
                  alert("Este artículo está en revisión. El chat está deshabilitado temporalmente.");
                  return;
                }
                await openChatByArticleAndBuyer({ article, buyerId });
              }}
            />

            <EditArticleModal
              isOpen={isEditOpen}
              article={editArticle}
              onClose={() => {
                setIsEditOpen(false);
                setEditArticle(null);
              }}
              onUpdateSuccess={async () => {
                await load();
                await loadNotifications();
              }}
            />

            {/* ✅ CHAT GLOBAL */}
            <ChatMessenger
              isOpen={!!chatOpen}
              onClose={() => setChatOpen(null)}
              userId={currentUser?.id}
              chat={chatOpen?.chat}
              article={chatOpen?.article}
              otherUserId={chatOpen?.otherUserId}
              role={chatOpen?.role}
              errorMessage={chatOpen?.errorMessage}
            />
          </div>
        }
      />

      <Route path="/admin" element={<AdminPage />} />
      <Route path="/master" element={<MasterPage />} />
      <Route path="/master/ads" element={<AdsPanel />} />
      <Route path="/terminos" element={<Terms />} />
      </Routes>
  );
}