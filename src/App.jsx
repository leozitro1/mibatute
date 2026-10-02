// src/App.jsx
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Routes, Route } from "react-router-dom";
import { Eye, EyeOff, ChevronLeft, ChevronRight } from "lucide-react";
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
import SponsorCarousel from "./components/SponsorCarousel";
import HowItWorks from "./components/HowItWorks";
import ManageArticleModal from "./components/ManageArticleModal";
import EditArticleModal from "./components/EditArticleModal";
import { deleteArticleImages, getArticleWithImages } from "./supabase/articleService";
import { transitionSale } from "./supabase/saleTransaction";
import { readArticleContext, resolveChatBuyerId, validateTransactionChat } from "./supabase/articleContext";
import { saleDeletionBlocked } from './components/articleState.js';
import { queryArticlesWithCondition } from "./supabase/articleQuery";
import ChatMessenger from "./components/ChatMessenger";

import { COLOMBIA_DATA } from "./data/locations";
import { supabase } from "./supabase/supabaseClient";


import { crearPostulacionConLimite } from "./supabase/solicitudesService";

const HOME_QUERY_LIMIT = 100;
const NOTIFICATION_POST_LIMIT = 80;
const NOTIFICATION_MESSAGE_LIMIT = 100;
const INTERESTED_COUNT_LIMIT = 200;
const HOME_REFRESH_MS = 10 * 60 * 1000;
const ENABLE_BACKGROUND_REALTIME = false;
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
  const [hiddenAdsOwnerId, setHiddenAdsOwnerId] = useState(null);
  const [sortOrder, setSortOrder] = useState("newest"); // newest | oldest
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [featuredSeed] = useState(() => String(Math.random()));
  const [pageSelection, setPageSelection] = useState({ key: "", page: 1 });
  const [homePage, setHomePage] = useState({ ids: [], featuredIds: [], total: 0, page: 1 });
  const [homeBusy, setHomeBusy] = useState(true);
  const [homeError, setHomeError] = useState("");
  const homeRequestRef = useRef(0);
  const personalArticlesRef = useRef({ uid: null, rows: null });
  const listingRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const homeFilters = useMemo(() => ({
    search: debouncedSearch, category: selectedCategory, subcategory: selectedSubcategory,
    city: selectedCity, locality: selectedLocality, kind: quickTipo, onlyActive,
    hideOwn: !!currentUser?.id && hiddenAdsOwnerId === currentUser.id, sort: sortOrder, featuredSeed,
  }), [debouncedSearch, selectedCategory, selectedSubcategory, selectedCity, selectedLocality,
    quickTipo, onlyActive, hiddenAdsOwnerId, sortOrder, featuredSeed, currentUser?.id]);
  const homeFilterKey = JSON.stringify([homeFilters, currentUser?.id]);
  // Reset even when returning to a filter combination visited on another page.
  if (pageSelection.key !== homeFilterKey) {
    setPageSelection({ key: homeFilterKey, page: 1 });
  }
  const requestedPage = pageSelection.key === homeFilterKey ? pageSelection.page : 1;

  const [isManageOpen, setIsManageOpen] = useState(false);
  const [manageArticle, setManageArticle] = useState(null);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editArticle, setEditArticle] = useState(null);

  const saleInFlightRef = useRef(false);

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
      .select("id,articulo_id,buyer_id,seller_id,owner_id,usuario_id,status,created_at,last_message_at")
      .eq("articulo_id", articuloId)
      .eq("buyer_id", buyerId)
      .maybeSingle();

    return { data, error };
  };

  const ensureChatExists = async ({ article, articuloId, buyerId }) => {
    const sellerId = inferSellerIdFromArticle(article);

    if (!sellerId || !buyerId) {
      return { chat: null, errorMessage: "No se pudo crear chat: falta sellerId o buyerId." };
    }

    const existing = await readChatByArticuloAndBuyer({ articuloId, buyerId });
    if (existing.error) return { chat: null, errorMessage: existing.error.message };
    if (existing.data?.id) return { chat: existing.data, errorMessage: null };
    const assigned = article.buyer_id || article.ganador_id || article.winner_id || article.recipient_id;
    const state = normEstado(article.estado || article.status);
    if (String(assigned || "") !== String(buyerId) || state !== "reservado") {
      return { chat: null, errorMessage: "No hay una reserva activa para crear este chat." };
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

  // ✅ Ref espejo de products — loadNotifications lo lee sin crear dependencia circular
  const productsRef = useRef([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { productsRef.current = products; }, [products]);

  const loadNotifications = useCallback(async () => {
    const uid = getActiveUid();
    if (!uid) {
      setNotifChatCount(0);
      setNotifProfileCount(0);
      setNotifByArticulo({});
      setNotifications([]);
      return;
    }

    // ✅ Usa ref en vez de closure sobre products — rompe la dependencia circular
    const currentProducts = productsRef.current;

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
    const articleById = Object.fromEntries((currentProducts || []).map((p) => [String(getArticuloId(p) || ""), p]));

    const dropdownItems = [];

    // 1) Ventas pendientes (desde products ya cargados)
    let pendingVentas = 0;
    try {
      const mine = (currentProducts || []).filter((p) => String(p?.owner_id || p?.usuario_id || "") === String(uid));
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
          .limit(NOTIFICATION_POST_LIMIT);

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
          .limit(NOTIFICATION_MESSAGE_LIMIT);

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
      const allProducts = Array.isArray(currentProducts) ? currentProducts : [];
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
  }, [getActiveUid, lsKeyChats, lsKeyPosts, fetchChatsForUid]);

  // =========================================================
  // ✅ helper: abrir chat por articulo + buyerId
  // =========================================================

  const openChatByArticleAndBuyer = useCallback(
    async ({ article: requestedArticle, buyerId: requestedBuyerId }) => {
      const uid = getActiveUid();
      const articuloId = getArticuloId(requestedArticle);
      if (!uid) return alert("Debes iniciar sesión.");
      if (!articuloId) return alert("Este artículo no tiene ID válido.");
      if (isUserBlocked) return alert("Tu cuenta está bloqueada. No puedes acceder a chats.");
      try {
        const article = await readArticleContext(supabase, articuloId);
        if (isInReview(article)) return alert("Este artículo está en revisión. El chat está deshabilitado temporalmente.");
        const isSale = normTipo(article.mode || article.tipo) === "venta";
        const buyerId = resolveChatBuyerId({ article, userId: uid, otherUserId: requestedBuyerId });
        if (isSale && (!article.buyer_id || !["reservado", "entregado"].includes(normEstado(article.estado || article.status)))) {
          return alert("Esta venta no tiene una reserva activa. Actualiza tus publicaciones.");
        }
        let finalChat = validateTransactionChat(article, uid);
        if (isSale && finalChat?.status === "pending") {
          if (String(uid) !== String(article.owner_id)) {
            return alert("Para hablar con el vendedor, él debe aprobar la compra. Tu solicitud está pendiente de aprobación.");
          }
          const approved = await transitionSale(supabase, articuloId, "approve_chat");
          finalChat = approved.chat;
          article.transaction_chat = finalChat;
        }
        if (!finalChat && !isSale) {
          const ensured = await ensureChatExists({ article, articuloId, buyerId });
          if (!ensured.chat?.id) throw new Error(ensured.errorMessage || "No se pudo abrir el chat.");
          finalChat = ensured.chat;
        }
        if (!finalChat) throw new Error("No se encontró el chat de esta reserva o no tienes permiso para abrirlo.");
        const otherUserId = safeGetOtherUserId(uid, finalChat);
        setProducts(previous => previous.map(item => String(item.id) === String(article.id) ? { ...item, ...article } : item));
        setManageArticle(previous => previous?.id === article.id ? { ...previous, ...article } : previous);
        setChatOpen({
          article, chat: finalChat, otherUserId,
          otherUserProfile: String(otherUserId) === String(article.owner_id) ? article.owner_public : article.buyer_public,
          role: String(uid) === String(finalChat.buyer_id) ? "buyer" : "seller",
          errorMessage: null,
        });
        markChatSeen(finalChat.id);
        loadNotifications();
      } catch (error) {
        console.error("Error abriendo chat:", error);
        alert(error.message || "No se pudo abrir el chat. Intenta nuevamente.");
      }
    },
    [getActiveUid, markChatSeen, loadNotifications, isUserBlocked]
  );

  const openChatFromArticle = useCallback(
    article => openChatByArticleAndBuyer({ article }),
    [openChatByArticleAndBuyer]
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

      // ✅ usa productsRef para no crear dependencia innecesaria
      let art;
      try { art = await readArticleContext(supabase, articuloId); }
      catch (error) { alert(error.message); return; }
      if (isInReview(art)) return alert("Este artículo está en revisión. No puedes gestionarlo por ahora.");
      if (!art) {
        setCurrentView("profile");
        return;
      }

      markSolicitudesSeenForArticulo(getArticuloId(art));

      setManageArticle(art);
      setIsManageOpen(true);
      setCurrentView("profile");

    },
    [currentUser, markSolicitudesSeenForArticulo]
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

        const { data: verified, error: verifyError } = await supabase.auth.getUser();
        const verifiedUser = verified?.user || null;

        if (verifyError || !verifiedUser || verifiedUser.id !== sbUser.id) {
          await supabase.auth.signOut();
          if (!alive) return;
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
          setLoading(false);
          return;
        }

        let merged = { ...verifiedUser, email: verifiedUser.email };

// 1) intenta DB pero SIN romper si no hay fila o RLS
const dbRes = await supabase
  .from("usuarios")
  .select("id,nombre,movil,ciudad,localidad,direccion,foto_url,is_blocked,bloqueado,blocked,estado,status,rol,role")
  .eq("id", verifiedUser.id)
  .maybeSingle();

if (!dbRes?.error && dbRes?.data) {
  merged = { ...merged, ...dbRes.data };
}

// 2) fallback SIEMPRE desde metadata (esto te salva cuando DB no responde)
const m = verifiedUser?.user_metadata || {};
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

  const load = useCallback(async ({ refreshPersonal = false } = {}) => {
    const request = ++homeRequestRef.current;
    setHomeBusy(true);
    setHomeError("");
    try {
    const { data: pageData, error: pageError } = await supabase.rpc("home_article_page", {
      p_filters: homeFilters, p_page: requestedPage,
    });
    if (pageError) throw pageError;
    const pageIds = [...new Set([...pageData.ids, ...pageData.featuredIds])];
    // ✅ Solo columnas necesarias para el listado — sin select("*")
    const columns = `id, titulo, title, mode, tipo, estado, status,
         city, locality, description,
         price, usuario_id, owner_id, buyer_id,
         ganador_id, winner_id, recipient_id,
         reserved_at, delivered_at, updated_at, created_at,
         image_url, imagen_url_principal, imagenes,
         is_featured,
         review_status, approval_status,
         moderation_status, revision_status,
         category, categoria,
         subcategory, subcategoria,
         articulo_imagenes:articulo_imagenes (
           id, url, position
         )`;
    const uid = currentUser?.id || null;
    if (refreshPersonal || personalArticlesRef.current.uid !== uid || !personalArticlesRef.current.rows) {
      const personal = uid ? await queryArticlesWithCondition(columns, selection =>
        supabase.from("articulos").select(selection)
          .or(`owner_id.eq.${uid},usuario_id.eq.${uid},buyer_id.eq.${uid},ganador_id.eq.${uid},winner_id.eq.${uid},recipient_id.eq.${uid}`)
          .order("created_at", { ascending: false }).limit(HOME_QUERY_LIMIT)) : { data: [] };
      if (personal.error) throw personal.error;
      if (request !== homeRequestRef.current) return;
      personalArticlesRef.current = { uid, rows: personal.data || [] };
    }
    const { data, error } = pageIds.length ? await queryArticlesWithCondition(columns, selection =>
      supabase.from("articulos").select(selection).in("id", pageIds)
        .order("position", { foreignTable: "articulo_imagenes", ascending: true })) : { data: [] };

    if (error) {
      throw error;
    }

    const raw = [...new Map([...personalArticlesRef.current.rows, ...(data || [])].map(item => [item.id, item])).values()];
    const ownerIds = Array.from(new Set(raw.flatMap(it => [it?.usuario_id || it?.owner_id, it?.buyer_id]).filter(Boolean)));

    let ownersMap = {};
    if (ownerIds.length) {
      const { data: owners, error: ownersErr } = await supabase
        .from("usuarios_publicos")
        .select("id,nombre,foto_url")
        .in("id", ownerIds);

      if (ownersErr) console.log("Error cargando usuarios_publicos:", ownersErr);
      else ownersMap = Object.fromEntries((owners || []).map((u) => [u.id, u]));
    }

    // ✅ Normaliza artículos
    let normalized = raw.map((it) => {
      const imgsRel = Array.isArray(it.articulo_imagenes) ? it.articulo_imagenes : [];
      const imgsRelUrls = imgsRel.map((x) => x?.url).filter(Boolean);
      const imgsDb = Array.isArray(it.imagenes) ? it.imagenes.filter(Boolean) : [];

      const ownerId = it?.usuario_id || it?.owner_id;
      const ownerPublic = ownerId ? ownersMap[ownerId] : null;

      return {
        ...it,
        isFeatured: !!(it?.isFeatured ?? it?.is_featured ?? it?.destacado ?? it?.featured ?? false),
        articulo_imagenes: imgsRel,
        imagenes_db: imgsDb,
        imagenes: imgsRelUrls.length ? imgsRelUrls : imgsDb,
        owner_name_from_user_table: ownerPublic?.nombre || "",
        owner_photo: ownerPublic?.foto_url || "",
        owner_public: ownerPublic || it.owner_public || null,
        buyer_public: ownersMap[it.buyer_id] || it.buyer_public || null,
        interested_count: 0,
      };
    });

    // ✅ Conteo de interesados: una sola query con count por grupo
    // Evita iterar con múltiples chunks y traer todos los registros
    try {
      const ids = normalized.map((x) => getArticuloId(x)).filter(Boolean);
      if (ids.length) {
        const counts = {};
        const chunks = chunkArray(ids, 200);
        for (const ch of chunks) {
          // ✅ Solo trae articulo_id — sin payload extra
          const { data: posts, error: postErr } = await supabase
            .from("postulaciones")
            .select("articulo_id")
            .in("articulo_id", ch)
            .limit(INTERESTED_COUNT_LIMIT);

          if (postErr) break;
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
          return { ...it, interested_count: id ? (counts[String(id)] || 0) : 0 };
        });
      }
    } catch {}

    if (request !== homeRequestRef.current) return;
    setHomePage(pageData);
    setProducts(normalized);

    setSelectedProduct((prev) => {
      if (!prev?.id) return prev;
      const updated = normalized.find((x) => x.id === prev.id);
      return updated ? { ...prev, ...updated } : prev;
    });
    } catch (error) {
      if (request !== homeRequestRef.current) return;
      console.error("Error cargando articulos:", error);
      setHomeError("No pudimos cargar las publicaciones. Intenta nuevamente.");
    } finally {
      if (request === homeRequestRef.current) setHomeBusy(false);
    }
  }, [homeFilters, requestedPage, currentUser?.id]);

  // ✅ Carga inicial única — sin polling agresivo
  // Se recarga solo cuando el usuario vuelve a la pestaña (visibilitychange)
  // y solo si pasó suficiente tiempo para ahorrar lecturas
  const lastLoadRef = useRef(0);

  useEffect(() => {
    let alive = true;

    const run = async (refreshPersonal = false) => {
      if (!alive) return;
      await load({ refreshPersonal });
      lastLoadRef.current = Date.now();
      if (refreshPersonal && getActiveUid()) await loadNotifications();
    };

    run();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        const elapsed = Date.now() - lastLoadRef.current;
        if (elapsed > HOME_REFRESH_MS) {
          run(true);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      alive = false;
      homeRequestRef.current++;
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  // =========================================================
  // ✅ REALTIME: refresca dropdown al llegar postulación/mensaje
  // =========================================================
  const rtRef = useRef({ channel: null, uid: null });

  // ✅ Suscripción realtime: depende SOLO de currentUser.id
  // Usa productsRef para leer products sin rehacer el canal en cada refresh
  useEffect(() => {
    if (!ENABLE_BACKGROUND_REALTIME) return;

    const uid = getActiveUid();

    if (rtRef.current.channel) {
      try { supabase.removeChannel(rtRef.current.channel); } catch {}
      rtRef.current.channel = null;
      rtRef.current.uid = null;
    }

    if (!uid) return;

    const ch = supabase.channel(`mb-notifs-${uid}`);

    ch.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "postulaciones" },
      (payload) => {
        const artId = payload?.new?.articulo_id;
        if (!artId) return;

        // ✅ Lee productsRef (no recrea el canal cuando products cambia)
        const isMine = (productsRef.current || []).some(
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
      () => { loadNotifications(); }
    );

    ch.subscribe();

    rtRef.current.channel = ch;
    rtRef.current.uid = uid;

    return () => {
      try { supabase.removeChannel(ch); } catch {}
      rtRef.current.channel = null;
      rtRef.current.uid = null;
    };
  // ✅ Solo se rehace cuando cambia el usuario — no cuando cambian products
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  // ✅ Carga notificaciones SOLO cuando el usuario se autentica o cambia
  // No se mezcla con el ciclo de load() de productos
  useEffect(() => {
    if (currentUser?.id) {
      loadNotifications();
    } else {
      setNotifChatCount(0);
      setNotifProfileCount(0);
      setNotifByArticulo({});
      setNotifications([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

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
    personalArticlesRef.current.rows = null;
    setPageSelection({ key: homeFilterKey, page: 1 });
    load({ refreshPersonal: true });
  };

  // ✅ APPLY (donación/regalo)
  const handleApply = async (productId, message) => {
    const uid = getActiveUid();

    if (!uid) {
      setIsAuthOpen(true);
      return { success: false, error: "Debes iniciar sesion para solicitar." };
    }

    const p = products.find((x) => x.id === productId);
    const estadoActual = normEstado(p?.estado || p?.status || "disponible");

    // ✅ BLOQUEO REVISIÓN (opcional pero coherente)
    if (p && isInReview(p)) {
      return { success: false, error: "Este articulo esta en revision." };
    }

    if (estadoActual === "entregado") {
      return { success: false, error: "Este articulo ya fue entregado." };
    }

    if (p && estadoActual !== "disponible") {
      return { success: false, error: "Este articulo ya no esta disponible para nuevas solicitudes." };
    }

    const ownerId = p?.owner_id || p?.usuario_id || null;
    if (ownerId && ownerId === uid) {
      return { success: false, error: "No puedes postularte a tu propio articulo." };
    }

    try {
      const { data: ya, error: errYa } = await supabase
        .from("postulaciones")
        .select("id")
        .eq("articulo_id", productId)
        .eq("usuario_id", uid)
        .maybeSingle();

      if (errYa) throw errYa;
      if (ya?.id) return { success: false, error: "Ya te postulaste a este articulo." };

      const res = await crearPostulacionConLimite({ articuloId: productId, usuarioId: uid, justificacion: message || "", applyRateLimit: true });
      if (res && res.success === false) {
        if (res.code === "RATE_LIMIT_REACHED") return res;
        throw new Error(res.error || "No se pudo enviar tu solicitud.");
      }

      alert("¡Solicitud enviada! El vendedor decidirá a quién entregárselo.");
      // ✅ Actualización local del contador — sin recargar todo
      setProducts((prev) =>
        prev.map((it) =>
          String(getArticuloId(it)) === String(productId)
            ? { ...it, interested_count: (Number(it.interested_count) || 0) + 1 }
            : it
        )
      );
      return { success: true };
    } catch (err) {
      console.error("Error enviando postulación:", err);
      return { success: false, error: err?.message || "Error enviando la solicitud. Intenta de nuevo." };
    }
  };

  const applyArticleUpdate = (article) => {
    const id = getArticuloId(article);
    setProducts(previous => previous.some(item => String(getArticuloId(item)) === String(id))
      ? previous.map(item => String(getArticuloId(item)) === String(id) ? { ...item, ...article } : item)
      : [...previous, article]);
    setSelectedProduct(previous => previous && String(getArticuloId(previous)) === String(id)
      ? { ...previous, ...article } : previous);
    setManageArticle(previous => previous && String(getArticuloId(previous)) === String(id)
      ? { ...previous, ...article } : previous);
    load({ refreshPersonal: true });
  };

  const handleBuy = async (productId) => {
    const uid = getActiveUid();
    if (!uid) {
      setIsAuthOpen(true);
      return { success: false, error: "Debes iniciar sesion para comprar." };
    }
    if (isUserBlocked) return { success: false, error: "Tu cuenta esta bloqueada." };
    if (saleInFlightRef.current) return { success: false, error: "Ya hay una compra en proceso." };
    const product = products.find(item => String(item.id) === String(productId)) || selectedProduct;
    if (product && isInReview(product)) {
      return { success: false, error: "Este articulo esta en revision." };
    }

    saleInFlightRef.current = true;
    try {
      const { article } = await transitionSale(supabase, productId, "reserve");
      applyArticleUpdate(article);
      setSelectedProduct(null);
      alert("Solicitud de compra enviada. Para hablar con el vendedor, él debe aprobar la compra y abrir el chat.");
      loadNotifications().catch(error => console.error("Error actualizando notificaciones:", error));
      return { success: true, data: article };
    } catch (error) {
      console.error("Error reservando venta:", error);
      return { success: false, error: error.message || "No se pudo reservar el articulo." };
    } finally {
      saleInFlightRef.current = false;
    }
  };

  const cancelSale = async (articleId) => {
    const { article } = await transitionSale(supabase, articleId, "cancel");
    applyArticleUpdate(article);
    return article;
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
      const freshArticle = await readArticleContext(supabase, articleId);
      if (saleDeletionBlocked(freshArticle)) {
        throw new Error("No puedes eliminar esta venta. Se retira del historial siete días después de confirmar la entrega.");
      }
      const cleanup = await deleteArticleImages(articleId);
      if (!cleanup.success) throw new Error(cleanup.error);
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
      await load({ refreshPersonal: true });
    } catch (e) {
      console.error("DELETE ERROR:", e);
      alert("No se pudo eliminar: " + (e?.message || "Error inesperado"));
      throw e;
    }
  };

  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const uid = getActiveUid();

    const base = products.filter((item) => {
      if (!homePage.ids.includes(item.id)) return false;
      const estadoActual = normEstado(item?.estado || item?.status || "");
      const tipo = normTipo(item?.mode || item?.tipo || "");

      const ownerId = item?.usuario_id || item?.owner_id || null;
      const isOwner = uid && ownerId && String(uid) === String(ownerId);

      if (isOwner && hiddenAdsOwnerId === uid) return false;
      if (estadoActual === "pausado") return false;

      if (estadoActual === "entregado") return false;
      if (onlyActive && estadoActual === "reservado") return false;

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

    return base.sort((a, b) => homePage.ids.indexOf(a.id) - homePage.ids.indexOf(b.id));
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
    hiddenAdsOwnerId,
    sortOrder,
    homePage.ids,
  ]);

  // ✅ Artículos destacados (filtrados por búsqueda/categoría/ciudad igual que la lista principal)
  const featuredProducts = useMemo(() => {
    return products.filter(p => homePage.featuredIds.includes(p.id) && p.isFeatured
      && normEstado(p.estado || p.status || "") !== "entregado");
  }, [products, homePage.featuredIds]);

  const totalPages = Math.max(1, Math.ceil(homePage.total / 9));
  const changeHomePage = page => {
    setPageSelection({ key: homeFilterKey, page });
    listingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };


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
                                Oculta las reservadas
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => setOnlyActive((v) => !v)}
                              aria-pressed={onlyActive}
                              aria-label={onlyActive ? "Mostrar reservadas" : "Ocultar reservadas"}
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
                      <SponsorCarousel />
                    </aside>

                    <div className="min-w-0 lg:w-3/4">
                      <FeaturedTicker
                        key={JSON.stringify([searchTerm.trim().toLowerCase(), selectedCategory, selectedSubcategory, selectedCity, selectedLocality, quickTipo, onlyActive, hiddenAdsOwnerId, currentUser?.id])}
                        items={featuredProducts}
                        onItemClick={setSelectedProduct}
                      />
                      <div ref={listingRef} className="mb-4 flex flex-wrap justify-between items-center gap-3 scroll-mt-24">
                        <h2 className="text-lg font-black text-gray-800">
                          {searchTerm ? `Resultados para "${searchTerm}"` : "Últimos hallazgos"}
                        </h2>
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="text-xs font-bold text-gray-400">
                            {homePage.total} tesoros encontrados
                          </span>
                          {currentUser?.id && (
                            <button
                              type="button"
                              aria-pressed={hiddenAdsOwnerId === currentUser.id}
                              onClick={() => setHiddenAdsOwnerId(hiddenAdsOwnerId === currentUser.id ? null : currentUser.id)}
                              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-600 hover:border-forest-green hover:text-forest-green transition"
                            >
                              {hiddenAdsOwnerId === currentUser.id ? <Eye size={16} aria-hidden="true" /> : <EyeOff size={16} aria-hidden="true" />}
                              {hiddenAdsOwnerId === currentUser.id ? "Mostrar mis anuncios" : "Ocultar mis anuncios"}
                            </button>
                          )}
                        </div>
                      </div>

                      {homeError ? (
                        <div role="alert" className="py-12 text-center">
                          <p className="text-sm text-red-600">{homeError}</p>
                          <button type="button" onClick={() => load()} className="mt-3 text-sm font-bold text-forest-green">Reintentar</button>
                        </div>
                      ) : homeBusy || searchTerm !== debouncedSearch ? (
                        <div role="status" className="py-20 text-center text-sm text-gray-500">Cargando publicaciones...</div>
                      ) : filteredProducts.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6" data-testid="home-listings">
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
      category={getCategoria(item)}
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
                      {!homeError && homePage.total > 9 && (
                        <nav aria-label="Paginación de publicaciones" className="mt-8 flex flex-wrap items-center justify-center gap-3">
                          <button type="button" title="Página anterior" aria-label="Página anterior"
                            disabled={homeBusy || homePage.page <= 1}
                            onClick={() => changeHomePage(homePage.page - 1)}
                            className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 hover:border-forest-green disabled:opacity-40 disabled:cursor-not-allowed">
                            <ChevronLeft size={20} />
                          </button>
                          <span aria-live="polite" className="text-sm font-semibold text-gray-600">Página {homePage.page} de {totalPages}</span>
                          <button type="button" title="Página siguiente" aria-label="Página siguiente"
                            disabled={homeBusy || homePage.page >= totalPages}
                            onClick={() => changeHomePage(homePage.page + 1)}
                            className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 hover:border-forest-green disabled:opacity-40 disabled:cursor-not-allowed">
                            <ChevronRight size={20} />
                          </button>
                        </nav>
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
                  onArticuloDestacado={(article) => {
                    setProducts(prev => prev.map(item =>
                      String(getArticuloId(item)) === String(article.id) ? { ...item, ...article, isFeatured: true } : item));
                    load({ refreshPersonal: true });
                  }}
                  onOpenEdit={(art) => {
                    setEditArticle(art);
                    setIsEditOpen(true);
                  }}
                  onOpenGestion={async (art) => {
                    try {
                      const fresh = await readArticleContext(supabase, getArticuloId(art));
                      if (isInReview(fresh)) return alert("Este artículo está en revisión. No puedes gestionarlo por ahora.");
                      markSolicitudesSeenForArticulo(fresh.id);
                      setProducts(previous => previous.map(item => item.id === fresh.id ? { ...item, ...fresh } : item));
                      setManageArticle(fresh);
                      setIsManageOpen(true);
                    } catch (error) { alert(error.message); }
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
                    load({ refreshPersonal: true });
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
                  return handleBuy(id);
                } else {
                  const applyRes = await handleApply(id, message);
                  if (applyRes?.success) setSelectedProduct(null);
                  return applyRes;
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
              onCancelSaleSuccess={async (updatedArticle) => {
                const id = getArticuloId(updatedArticle || manageArticle);
                const fresh = updatedArticle ? { success: true, data: updatedArticle } : await getArticleWithImages(id);
                if (!fresh.success) throw new Error(fresh.error);
                applyArticleUpdate(fresh.data);
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
              categories={CATEGORY_TREE}
              isOpen={isEditOpen}
              article={editArticle}
              onClose={() => {
                setIsEditOpen(false);
                setEditArticle(null);
              }}
              onUpdateSuccess={async () => {
                // ✅ Recarga completa solo cuando se edita un artículo (datos pueden haber cambiado)
                await load({ refreshPersonal: true });
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
              otherUserProfile={chatOpen?.otherUserProfile}
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
