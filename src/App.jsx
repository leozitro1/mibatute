// src/App.jsx
import { lazy, Suspense, useEffect, useMemo, useState, useCallback } from "react";
import Navbar from "./components/Navbar";
import ProductCard from "./components/ProductCard";
import HeroBanner from "./components/HeroBanner";

import { COLOMBIA_DATA } from "./data/locations";
import { isSupabaseConfigured, supabase } from "./supabase/supabaseClient";

const PublishModal = lazy(() => import("./components/PublishModal"));
const AuthModal = lazy(() => import("./components/AuthModal"));
const UserProfile = lazy(() => import("./components/UserProfile"));
const ProductDetail = lazy(() => import("./components/ProductDetail"));
const HowItWorks = lazy(() => import("./components/HowItWorks"));
const ManageArticleModal = lazy(() => import("./components/ManageArticleModal"));
const EditArticleModal = lazy(() => import("./components/EditArticleModal"));
const ChatMessenger = lazy(() => import("./components/ChatMessenger"));

const HOME_PAGE_SIZE = Number(import.meta.env.VITE_HOME_PAGE_SIZE || 12);
const MAX_HOME_ARTICLES = Number(import.meta.env.VITE_MAX_HOME_ARTICLES || 48);
const NOTIFICATIONS_REFRESH_MS = Number(import.meta.env.VITE_NOTIFICATIONS_REFRESH_MS || 300000);
const ARTICLE_LIST_SELECT = `
  id,
  owner_id,
  usuario_id,
  owner_name,
  owner_photo,
  title,
  description,
  category,
  subcategory,
  subcategoria,
  mode,
  price,
  city,
  locality,
  status,
  estado,
  interested_count,
  imagenes,
  image_url,
  imagen_url,
  imagen_url_principal,
  buyer_id,
  comprador_id,
  ganador_id,
  winner_id,
  recipient_id,
  reserved_at,
  updated_at,
  created_at,
  articulo_imagenes:articulo_imagenes (
    id, url, path, position, created_at
  )
`;
const CHAT_SELECT =
  "id, articulo_id, buyer_id, seller_id, owner_id, usuario_id, status, last_message_at, created_at, updated_at";
const ARTICLE_MUTATION_SELECT =
  "id,status,estado,buyer_id,comprador_id,ganador_id,winner_id,recipient_id,reserved_at,updated_at";

/**
 * ✅ Árbol categorías + subcategorías
 */
const CATEGORY_TREE = [
  { key: "Hogar & Muebles", label: "🌿 Hogar & Muebles", subs: ["Muebles", "Decoración", "Electrodomésticos", "Colchones", "Cocina"] },
  { key: "Electrónica & Tecnología", label: "⚡ Electrónica & Tecnología", subs: ["Celulares", "Computadores", "Televisores", "Repuestos", "Chatarra electrónica"] },
  { key: "Construcción & Herramientas", label: "🧱 Construcción & Herramientas", subs: ["Materiales", "Herramientas", "Oficios", "Madera", "Metales"] },
  { key: "Ropa & Textiles", label: "👕 Ropa & Textiles", subs: ["Ropa", "Retazos", "Telas", "Uniformes"] },
  { key: "Reciclaje & Reutilización", label: "🔄 Reciclaje & Reutilización", subs: ["Plásticos", "Vidrio", "Cartón", "Materias primas"] },
  { key: "Infantil & Juguetes", label: "🧸 Infantil & Juguetes", subs: ["Juguetes", "Ropa infantil", "Coche/Accesorios", "Libros infantiles", "Otros"] },
  { key: "Deportes & Movilidad", label: "🚲 Deportes & Movilidad", subs: ["Bicicletas", "Patines", "Gimnasio", "Autopartes", "Motos"] },
  { key: "Libros & Educación", label: "📚 Libros & Educación", subs: ["Libros", "Cuadernos", "Útiles", "Cursos/Material", "Otros"] },
  { key: "Mascotas", label: "🐶 Mascotas", subs: ["Accesorios", "Alimento", "Camas", "Juguetes", "Otros"] },
  { key: "Antigüedades & Coleccionables", label: "🕰 Antigüedades & Coleccionables", subs: ["Monedas", "Figuras", "Vinilos", "Decoración vintage", "Otros"] },
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

// ✅ helper: update a prueba de columnas faltantes
async function safeUpdateArticulos(articleId, patch) {
  let payload = { ...(patch || {}) };

  const run = async () => {
    return await supabase
      .from("articulos")
      .update(payload)
      .eq("id", articleId)
      .select(ARTICLE_MUTATION_SELECT)
      .maybeSingle();
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
  const [hasMoreProducts, setHasMoreProducts] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

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

  const [quickTipo, setQuickTipo] = useState("todo"); // todo | donacion | venta
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
      .select(CHAT_SELECT)
      .eq("articulo_id", articuloId)
      .eq("buyer_id", buyerId)
      .maybeSingle();

    return { data, error };
  };

  const readChatByArticuloAndMember = async ({ articuloId, uid }) => {
    let res = await supabase
      .from("chats")
      .select(CHAT_SELECT)
      .eq("articulo_id", articuloId)
      .or(`buyer_id.eq.${uid},seller_id.eq.${uid}`)
      .maybeSingle();

    if (res?.error?.message && /Could not find the 'seller_id' column/i.test(res.error.message)) {
      res = await supabase
        .from("chats")
        .select(CHAT_SELECT)
        .eq("articulo_id", articuloId)
        .or(`buyer_id.eq.${uid},owner_id.eq.${uid}`)
        .maybeSingle();
    }

    if (res?.error?.message && /Could not find the 'owner_id' column/i.test(res.error.message)) {
      res = await supabase
        .from("chats")
        .select(CHAT_SELECT)
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
          .limit(100);

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

    // 3) Mensajes no vistos usando chats.last_message_at + chat_reads.
    // Evita descargar filas de chat_messages para calcular badges.
    let totalUnread = 0;

    try {
      const chatsRes = await supabase
        .from("chats")
        .select("id, articulo_id, buyer_id, seller_id, owner_id, usuario_id, status, created_at, last_message_at")
        .or(`buyer_id.eq.${uid},seller_id.eq.${uid}`);

      const chats = Array.isArray(chatsRes?.data) ? chatsRes.data : [];
      const chatIds = chats.map((c) => c?.id).filter(Boolean);

      if (chatIds.length) {
        const seenKey = lsKeyChats(uid);
        const seenMap = readSeenMap(seenKey);

        const { data: reads } = await supabase
          .from("chat_reads")
          .select("chat_id,last_read_at")
          .eq("user_id", uid)
          .in("chat_id", chatIds);

        const readMap = new Map((reads || []).map((r) => [String(r.chat_id), r?.last_read_at || null]));

        for (const chatRow of chats) {
          const chatId = chatRow?.id;
          const artId = chatRow?.articulo_id;
          const latestAtMs = chatRow?.last_message_at ? new Date(chatRow.last_message_at).getTime() : 0;
          const localSeenAtStr = seenMap[String(chatId)];
          const dbSeenAtStr = readMap.get(String(chatId));
          const seenAt = Math.max(
            localSeenAtStr ? new Date(localSeenAtStr).getTime() : 0,
            dbSeenAtStr ? new Date(dbSeenAtStr).getTime() : 0
          );

          if (!latestAtMs || latestAtMs <= seenAt) continue;

          totalUnread += 1;

          const prev = byArticulo[String(artId)]?.unreadChats || 0;
          addArticulo(artId, { unreadChats: prev + 1 });

          const art = articleById[String(artId)];
          const artTitle = art?.title || art?.titulo || "Artículo";

          dropdownItems.push({
            id: `chat-${String(chatId)}`,
            type: "chat",
            chat_id: chatRow?.id,
            articulo_id: artId,
            buyer_id: chatRow?.buyer_id,
            created_at: chatRow?.last_message_at || chatRow?.created_at || new Date().toISOString(),
            title: "Mensaje nuevo",
            subtitle: `Mensaje nuevo en: ${artTitle}. Toca para abrir.`,
            thumb: buildArticleThumb(art),
          });
        }
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
  }, [getActiveUid, lsKeyChats, lsKeyPosts, products]);

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
    [getActiveUid, markChatSeen, loadNotifications]
  );

  // ✅ helper: abrir chat por articulo para el usuario actual (buyer o seller)
  const openChatFromArticle = useCallback(
    async (article) => {
      const uid = getActiveUid();
      const articuloId = getArticuloId(article);
      if (!uid) return alert("Debes iniciar sesión.");
      if (!articuloId) return alert("Este artículo no tiene ID válido.");

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

        let merged = { ...verifiedUser };
        const { data, error } = await supabase
          .from("usuarios")
          .select("id,nombre,movil,ciudad,localidad,direccion,foto_url")
          .eq("id", verifiedUser.id)
          .single();
        if (!error && data) merged = { ...verifiedUser, ...data };

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

  const normalizeArticles = useCallback((rows = []) => {
    return (Array.isArray(rows) ? rows : []).map((it) => {
      const imgsRel = Array.isArray(it.articulo_imagenes) ? it.articulo_imagenes : [];
      const imgsRelUrls = imgsRel.map((x) => x?.url).filter(Boolean);
      const imgsDb = Array.isArray(it.imagenes) ? it.imagenes.filter(Boolean) : [];

      return {
        ...it,
        articulo_imagenes: imgsRel,
        imagenes_db: imgsDb,
        imagenes: imgsRelUrls.length ? imgsRelUrls : imgsDb,
        owner_name_from_user_table: it?.owner_name || "",
        owner_photo: it?.owner_photo || "",
        interested_count: Number(it?.interested_count || 0),
      };
    });
  }, []);

  const fetchArticlePage = useCallback(
    async ({ offset = 0, pageSize = HOME_PAGE_SIZE } = {}) => {
      if (!isSupabaseConfigured) {
        return { items: [], hasMore: false, error: null };
      }

      const remaining = Math.max(0, MAX_HOME_ARTICLES - offset);
      if (remaining <= 0) return { items: [], hasMore: false, error: null };
      const cappedPageSize = Math.max(1, Math.min(pageSize, remaining));

      const { data, error } = await supabase
        .from("articulos")
        .select(ARTICLE_LIST_SELECT)
        .order("created_at", { ascending: false })
        .order("position", { foreignTable: "articulo_imagenes", ascending: true })
        .range(offset, offset + cappedPageSize);

      if (error) return { items: [], hasMore: false, error };

      const rows = Array.isArray(data) ? data : [];
      return {
        items: normalizeArticles(rows.slice(0, cappedPageSize)),
        hasMore: rows.length > cappedPageSize && offset + cappedPageSize < MAX_HOME_ARTICLES,
        error: null,
      };
    },
    [normalizeArticles]
  );

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setProducts([]);
      setHasMoreProducts(false);
      return;
    }

    const { items, hasMore, error } = await fetchArticlePage({ offset: 0, pageSize: HOME_PAGE_SIZE });

    if (error) {
      console.error("Error cargando articulos:", error);
      return;
    }

    setProducts(items);
    setHasMoreProducts(hasMore);

    setSelectedProduct((prev) => {
      if (!prev?.id) return prev;
      const updated = items.find((x) => x.id === prev.id);
      return updated ? { ...prev, ...updated } : prev;
    });
  }, [fetchArticlePage]);

  const loadMoreProducts = useCallback(async () => {
    if (isLoadingMore || !hasMoreProducts) return;

    setIsLoadingMore(true);
    try {
      const { items, hasMore, error } = await fetchArticlePage({
        offset: products.length,
        pageSize: HOME_PAGE_SIZE,
      });

      if (error) {
        console.error("Error cargando más articulos:", error);
        return;
      }

      setProducts((prev) => {
        const seen = new Set(prev.map((item) => String(getArticuloId(item))));
        const nextItems = items.filter((item) => {
          const id = getArticuloId(item);
          if (!id || seen.has(String(id))) return false;
          seen.add(String(id));
          return true;
        });
        return [...prev, ...nextItems];
      });
      setHasMoreProducts(hasMore);
    } finally {
      setIsLoadingMore(false);
    }
  }, [fetchArticlePage, hasMoreProducts, isLoadingMore, products.length]);

  // ✅ Bajo consumo: carga inicial y refresco por foco/visibilidad, sin polling constante.
  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!currentUser?.id) return;
    loadNotifications();
  }, [currentUser?.id, products, loadNotifications]);

  useEffect(() => {
    let lastRefresh = 0;

    const refreshIfDue = () => {
      const now = Date.now();
      if (now - lastRefresh < NOTIFICATIONS_REFRESH_MS) return;
      lastRefresh = now;
      load();
      if (currentUser?.id) loadNotifications();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshIfDue();
    };

    window.addEventListener("focus", refreshIfDue);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("focus", refreshIfDue);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [currentUser?.id, load, loadNotifications]);

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

      const { error } = await supabase.from("postulaciones").insert({
        articulo_id: productId,
        usuario_id: uid,
        justificacion: message || "",
      });

      if (error) throw error;

      alert("¡Solicitud enviada! El vendedor decidirá a quién entregárselo.");
      await load();
      await loadNotifications();
    } catch (err) {
      console.error("Error enviando postulación:", err);
      alert("Error enviando la solicitud. Intenta de nuevo.");
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

      if (quickTipo !== "todo") {
        if (tipo !== quickTipo) return false;
      }

      const title = (item.title || item.titulo || "").toLowerCase();
      const categoryText = String(item.category || item.categoria || "").toLowerCase();
      const subcategoryText = String(item.subcategory || item.subcategoria || "").toLowerCase();

      const matchesSearch = !term || title.includes(term) || categoryText.includes(term) || subcategoryText.includes(term);

      const matchesCategory =
        selectedCategory === "Todo" || String(item.category || item.categoria || "") === String(selectedCategory);

      const matchesSub =
        !selectedSubcategory || String(item.subcategory || item.subcategoria || "") === String(selectedSubcategory);

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

  const myProducts = useMemo(() => {
    const uid = getActiveUid();
    if (!uid) return [];
    return products.filter((p) => p.owner_id === uid || p.usuario_id === uid);
  }, [products, getActiveUid]);

  if (loading) {
    return <div className="h-screen flex items-center justify-center font-black uppercase">Cargando MiBatute...</div>;
  }

  return (
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
        notifications={notifications}
        onNotificationClick={async (item) => {
          const uid = getActiveUid();
          if (!uid) {
            setIsAuthOpen(true);
            return;
          }

          if (item?.type === "chat") {
            const art = products.find((p) => String(getArticuloId(p)) === String(item?.articulo_id)) || null;
            if (!art) {
              setCurrentView("profile");
              return;
            }
            await openChatByArticleAndBuyer({ article: art, buyerId: item?.buyer_id || uid });
            return;
          }

          if (item?.type === "postulacion") {
            await openManageFromNotif(item?.articulo_id);
            return;
          }

          if (item?.type === "venta") {
            await openManageFromNotif(item?.articulo_id);
            const art = products.find((p) => String(getArticuloId(p)) === String(item?.articulo_id)) || null;
            if (art && item?.buyer_id) {
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

      <Suspense fallback={null}>
      <main className="max-w-7xl mx-auto px-4 py-8">
        {currentView === "home" && (
          <div className="animate-in fade-in duration-500">
            <HeroBanner onLearnMore={() => setCurrentView("how-it-works")} />

            <div className="flex flex-col lg:flex-row gap-8">
              <aside className="lg:w-1/4 space-y-6">
                {/* Categorías */}
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-black text-gray-800 uppercase text-xs">Categorías</h3>

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
                            <div className="mt-2 ml-2 space-y-1">
                              <button
                                type="button"
                                onClick={() => setSelectedSubcategory("")}
                                className={`w-full text-left text-[13px] py-2 px-3 rounded-2xl transition border ${
                                  !selectedSubcategory
                                    ? "bg-forest-green text-white font-bold border-forest-green"
                                    : "bg-white text-gray-600 border-gray-200 hover:border-forest-green"
                                }`}
                              >
                                Todas
                              </button>

                              {cat.subs.map((sub) => (
                                <button
                                  key={sub}
                                  type="button"
                                  onClick={() => setSelectedSubcategory(sub)}
                                  className={`w-full text-left text-[13px] py-2 px-3 rounded-2xl transition border ${
                                    selectedSubcategory === sub
                                      ? "bg-forest-green text-white font-bold border-forest-green"
                                      : "bg-white text-gray-600 border-gray-200 hover:border-forest-green"
                                  }`}
                                >
                                  {sub}
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
                  <h3 className="font-black text-gray-800 uppercase text-xs mb-4">Localidades en {selectedCity}</h3>

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
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Solo activas</p>
                        <p className="text-[11px] text-gray-500 font-bold">Oculta las reservadas (para el público)</p>
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
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Orden</p>
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
                  <span className="text-xs font-bold text-gray-400">{filteredProducts.length} tesoros encontrados</span>
                </div>

                {filteredProducts.length > 0 ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                      {filteredProducts.map((item) => {
                        const resolvedImage =
                          item.image_url ||
                          item.imagen_url_principal ||
                          (Array.isArray(item.imagenes) ? item.imagenes : item.imagenes_db) ||
                          "";

                        const resolvedLocation = `${item.city || item.ciudad || ""}${
                          item.locality || item.localidad_es ? `, ${item.locality || item.localidad_es}` : ""
                        }`;

                        const artId = getArticuloId(item);
                        const notif = artId ? notifByArticulo[String(artId)] : null;

                        // ✅ interesados desde load() (postulaciones)
                        const interestedCount = Number(item?.interested_count || 0) || 0;
                        const interestedMax = resolveInterestedMax(item);

                        return (
                          <div key={item.id} onClick={() => setSelectedProduct(item)} className="cursor-pointer">
                            <ProductCard
                              title={item.title || item.titulo || "Sin título"}
                              location={resolvedLocation}
                              mode={normTipo(item.mode || item.tipo || "donacion")}
                              price={item.price || 0}
                              image={resolvedImage}
                              isFeatured={item.isFeatured || false}
                              status={item.estado || item.status || "disponible"}
                              // ✅ interesados (ARREGLO)
                              interestedCount={interestedCount}
                              interestedMax={interestedMax}
                              // ✅ props opcionales (no rompen si ProductCard no los usa)
                              notifTotal={notif?.total || 0}
                              notifChats={notif?.unreadChats || 0}
                              notifSolicitudes={notif?.newSolicitudes || 0}
                              notifVentas={notif?.pendingVentas || 0}
                            />
                          </div>
                        );
                      })}
                    </div>

                    {hasMoreProducts ? (
                      <div className="mt-8 flex justify-center">
                        <button
                          type="button"
                          onClick={loadMoreProducts}
                          disabled={isLoadingMore}
                          className="px-5 py-3 rounded-2xl bg-gray-900 text-white text-xs font-black uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed hover:bg-forest-green transition"
                        >
                          {isLoadingMore ? "Cargando..." : "Cargar más"}
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="text-center py-20">
                    <p className="text-gray-400 font-bold">No encontramos nada con ese filtro. ¡Sé el primero en publicarlo!</p>
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
          />
        )}

        {currentView === "how-it-works" && <HowItWorks onBack={() => setCurrentView("home")} />}
      </main>

      {isAuthOpen ? (
        <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} onLogin={() => setIsAuthOpen(false)} />
      ) : null}

      {isPublishOpen ? (
        <PublishModal
          isOpen={isPublishOpen}
          onClose={() => setIsPublishOpen(false)}
          onPublish={handleAddProduct}
          currentCity={selectedCity}
          user={currentUser}
          categories={CATEGORY_TREE}
        />
      ) : null}

      {selectedProduct ? (
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
            await openChatFromArticle(item);
          }}
        />
      ) : null}

      {isManageOpen ? (
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
            await openChatByArticleAndBuyer({ article, buyerId });
          }}
        />
      ) : null}

      {isEditOpen ? (
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
      ) : null}

      {chatOpen ? (
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
      ) : null}
      </Suspense>
    </div>
  );
}
