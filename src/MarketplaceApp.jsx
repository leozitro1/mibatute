// src/App.jsx
import { lazy, Suspense, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Routes, Route } from "react-router-dom";
import { Eye, EyeOff, ChevronLeft, ChevronRight, ChevronDown, LayoutGrid, MapPin, SlidersHorizontal, Gift, Tag, Star, BadgeCheck } from "lucide-react";
import { sharedArticleId } from "./components/articleShare.js";
import Navbar from "./components/Navbar";
import Footer from './components/Footer.jsx';
import LegalConsentDialog from './components/LegalConsentDialog.jsx';
import { notifyCreditBalance } from './components/creditBalance.js';
import FilterSection from "./components/FilterSection";
import ProductCard from "./components/ProductCard";
import usePublicationClock from './components/usePublicationClock.js';
import useDetailScroll from './components/useDetailScroll.js';
import { createListingCache } from './components/listingCache.js';
import { readNotificationHistory, writeNotificationHistory, mergeNotificationHistory,
  markNotificationHistoryRead, markNotificationBellRead, NOTIFICATION_STATE_LIMIT } from './components/notificationHistory.js';
import { profileNotificationBadges,profileInboxBadges,mergeInboxNotifications,updateInboxNotification,mergeActivitySnapshot } from './components/profileNotificationBadges.js';
import { subscribeStaffInbox } from './components/staffInboxSignals.js';
import { catalogTopic, dispatchMarketSignal, noticeFromSignal, notificationCounts } from './components/marketSignals.js';
import { isPublicationExpired } from './components/articleLifetime.js';
import { fetchActivityNotifications, publicationExpiryNotifications, activityDestination, CONVERSATION_NOTIFICATION_TYPES } from './components/activityNotifications.js';
import HeroBanner from "./components/HeroBanner";
import FeaturedTicker from "./components/FeaturedTicker";
import SponsorCarousel from "./components/SponsorCarousel";
import SocialBar from './components/SocialBar';
import './components/HomeCatalog.css';
import './components/DesignProposal.css';
import './components/ProfileDesignProposal.css';
import './components/MarketplaceSurfaces.css';
import CategoryIcon from './components/CategoryIcon';
import { deleteArticleImages, getArticleWithImages } from "./supabase/articleService";
import { transitionSale } from "./supabase/saleTransaction";
import { readArticleContext, readNotificationChatContext, resolveChatBuyerId, validateTransactionChat } from "./supabase/articleContext";
import { saleDeletionBlocked, isSaleApproved } from './components/articleState.js';
import { queryArticlesWithCondition } from "./supabase/articleQuery";

import { CATEGORY_TREE } from "./data/categories.js";
import useLocations from "./data/useLocations.js";
import { supabase } from "./supabase/supabaseClient";
import { searchMetric } from './analytics/metrics.js';
import { recordMarketMetric } from './analytics/publicMetrics.js';


import { crearPostulacionConLimite } from "./supabase/solicitudesService";

const WompiReturnDialog = lazy(()=>import('./components/WompiTopupDialog.jsx'));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Terms = lazy(() => import("./pages/Terms"));
const PublishModal = lazy(() => import("./components/PublishModal"));
const AuthModal = lazy(() => import("./components/AuthModal"));
const UserProfile = lazy(() => import("./components/UserProfile"));
const ProductDetail = lazy(() => import("./components/ProductDetail"));
const HowItWorks = lazy(() => import("./components/HowItWorks"));
const ManageArticleModal = lazy(() => import("./components/ManageArticleModal"));
const EditArticleModal = lazy(() => import("./components/EditArticleModal"));
const ChatMessenger = lazy(() => import("./components/ChatMessenger"));

function DeferredPanel({ active, children }) {
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    if (active) setOpened(true);
  }, [active]);
  // Keep mounted after first use to preserve drafts and existing close behavior.
  if (!active && !opened) return null;
  return (
    <Suspense fallback={<div role="status" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40"><span className="rounded-lg bg-white px-6 py-4 text-sm font-semibold">Cargando...</span></div>}>
      {children}
    </Suspense>
  );
}

const HOME_QUERY_LIMIT = 100;
const NOTIFICATION_POST_LIMIT = 80;
const NOTIFICATION_MESSAGE_LIMIT = 100;
const NOTIFICATION_REFRESH_MS = 60 * 1000;
const HOME_REFRESH_MS = 10 * 60 * 1000;
const PUBLICATION_TYPES = [
  { key: "todo", label: "Todas", icon: <LayoutGrid size={16} aria-hidden="true" /> },
  { key: "donacion", label: "Donaciones", icon: <Gift size={16} aria-hidden="true" /> },
  { key: "venta", label: "Ventas", icon: <Tag size={16} aria-hidden="true" /> },
  { key: "destacado", label: "Destacadas", icon: <Star size={16} aria-hidden="true" /> },
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
    raw === "en_revision" ||
    raw === "under_review"
  );
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

export default function MarketplaceApp() {
  const { ACTIVE_COLOMBIA_DATA: COLOMBIA_DATA } = useLocations();
  // Production uses the approved design; local development keeps the comparison.
  const [designPreview, setDesignPreview] = useState(() => !import.meta.env.DEV || new URLSearchParams(window.location.search).get('design') !== 'actual');
  const changeDesign = (value) => {
    setDesignPreview(value);
    const url = new URL(window.location.href);
    url.searchParams.set('design', value ? 'propuesta' : 'actual');
    window.history.replaceState(window.history.state, '', url);
  };
  const publicationNow = usePublicationClock();
  const [products, setProducts] = useState([]);

  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const [isPublishOpen, setIsPublishOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  const [currentView, setCurrentView] = useState("home"); // home | profile | how-it-works
  const [selectedProduct, setSelectedProduct] = useState(null);
  const sharedArticleRef = useRef(sharedArticleId(window.location.href));
  const [sharedArticleError, setSharedArticleError] = useState("");
  const viewedArticleId = selectedProduct && currentUser?.id !== (selectedProduct.owner_id || selectedProduct.usuario_id) ? selectedProduct.id : null;
  useEffect(() => {
    if (!viewedArticleId || document.visibilityState !== 'visible') return;
    const timer = setTimeout(() => {
      if (document.visibilityState === 'visible') recordMarketMetric({ kind:'view',id:viewedArticleId });
    }, 1000);
    return () => clearTimeout(timer);
  }, [viewedArticleId]);
  useDetailScroll(!!selectedProduct);

  const [searchTerm, setSearchTerm] = useState("");
  const [searchMode, setSearchMode] = useState("related");
  const [selectedCategory, setSelectedCategory] = useState("Todo");
  const [selectedSubcategory, setSelectedSubcategory] = useState("");
  const [expandedCategory, setExpandedCategory] = useState(null);

  const [selectedCity, setSelectedCity] = useState("Bogotá");
  const [selectedLocality, setSelectedLocality] = useState("Todas");

  const [quickTipo, setQuickTipo] = useState("todo"); // todo | donacion | venta | destacado
  const [onlyActive, setOnlyActive] = useState(false);
  const [minCondition, setMinCondition] = useState(0);
  const [conditionDraft, setConditionDraft] = useState(0);
  const [hiddenAdsOwnerId, setHiddenAdsOwnerId] = useState(null);
  const [sortOrder, setSortOrder] = useState("random"); // random | newest | oldest
  const [mobileCatalog, setMobileCatalog] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => setMobileCatalog(media.matches);
    media.addEventListener('change', update);
    update();
    return () => media.removeEventListener('change', update);
  }, []);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [featuredSeed] = useState(() => String(Math.random()));
  const [pageSelection, setPageSelection] = useState({ key: "", page: 1 });
  const [homePage, setHomePage] = useState({ ids: [], featuredIds: [], total: 0, page: 1 });
  const [homeBusy, setHomeBusy] = useState(true);
  const [homeError, setHomeError] = useState("");
  const [catalogChanged, setCatalogChanged] = useState(false);
  const catalogVersionRef = useRef(0);
  const realtimeReadyRef = useRef(false);
  const [realtimeStatus, setRealtimeStatus] = useState("CONNECTING");
  const [realtimeRevision, setRealtimeRevision] = useState(0);
  const reconnectTimerRef = useRef(null);
  const homeRequestRef = useRef(0);
  const listingCacheRef = useRef(null);
  if (!listingCacheRef.current) listingCacheRef.current = createListingCache();
  const personalArticlesRef = useRef({ uid: null, rows: null });
  const listingRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const homeFilters = useMemo(() => ({
    search: debouncedSearch, searchMode, category: selectedCategory, subcategory: selectedSubcategory,
    city: selectedCity, locality: selectedLocality, kind: quickTipo, onlyActive, minCondition,
    hideOwn: !!currentUser?.id && hiddenAdsOwnerId === currentUser.id, sort: sortOrder, featuredSeed,
    layout: mobileCatalog ? 'mobile' : 'desktop', desktopPageSize: 12,
  }), [debouncedSearch, searchMode, selectedCategory, selectedSubcategory, selectedCity, selectedLocality,
    quickTipo, onlyActive, minCondition, hiddenAdsOwnerId, sortOrder, featuredSeed, currentUser?.id, mobileCatalog]);
  const homeFilterKey = JSON.stringify([homeFilters, currentUser?.id]);
  useEffect(() => {
    if (homeBusy || homeError || searchTerm !== debouncedSearch || currentView !== 'home' || document.visibilityState !== 'visible') return;
    const timer = setTimeout(() => {
      if (document.visibilityState === 'visible') recordMarketMetric(searchMetric(homeFilters, homePage.total));
    }, 1200);
    return () => clearTimeout(timer);
  }, [homeFilters, homePage.total, homeBusy, homeError, searchTerm, debouncedSearch, currentView]);
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
  const [wompiReturn,setWompiReturn]=useState(()=>{
    const query=new URLSearchParams(window.location.search);
    return query.get('wompi_return')==='1'?{reference:query.get('reference'),transactionId:query.get('id')}:null;
  });
  // chatOpen = { article, chat, otherUserId, role, errorMessage? }

  // ✅ Notificaciones
  const [notifChatCount, setNotifChatCount] = useState(0);
  const [notifProfileCount, setNotifProfileCount] = useState(0);
  // notifByArticulo[id] = { unreadChats, newSolicitudes, pendingVentas, total }
  const [notifByArticulo, setNotifByArticulo] = useState({});
  // ✅ lista para dropdown (Navbar)
  const [notifications, setNotifications] = useState([]);
  const notificationsRef = useRef([]);
  const historyUidRef = useRef(null);
  const notificationUidRef = useRef(null);
  notificationUidRef.current = currentUser?.id || null;
  const notificationRefreshRef = useRef({ uid: null, at: 0, pending: null });
  const activityRefreshRef = useRef({ uid: null, at: 0, pending: null, items: [] });
  const [profileNotificationTarget, setProfileNotificationTarget] = useState(null);
  const [inboxRevision,setInboxRevision]=useState(0);

  const saveNotificationHistory = useCallback((items, uid) => {
    if (!uid || uid !== notificationUidRef.current) return;
    const next = mergeNotificationHistory([], items, NOTIFICATION_STATE_LIMIT);
    notificationsRef.current = next;
    historyUidRef.current = uid;
    writeNotificationHistory(localStorage, uid, next);
    setNotifications(next);
    const counts = notificationCounts(next);
    setNotifChatCount(counts.chats);
    setNotifProfileCount(counts.profile);
    setNotifByArticulo(counts.byArticle);
  }, []);

  const syncInboxNotifications = useCallback((uid, messages) => {
    if (uid !== notificationUidRef.current) return;
    saveNotificationHistory(mergeInboxNotifications(historyUidRef.current === uid ? notificationsRef.current : [], messages), uid);
  }, [saveNotificationHistory]);
  const removedSupportRef=useRef({uid:null,ids:new Set()});
  const syncInboxReceipt = useCallback((uid, receiptId, action, kind, throughAt=null) => {
    if (uid !== notificationUidRef.current || historyUidRef.current !== uid) return;
    if(kind==='support'&&action==='delete'){
      if(removedSupportRef.current.uid!==uid)removedSupportRef.current={uid,ids:new Set()};
      removedSupportRef.current.ids.add(String(receiptId));
    }
    saveNotificationHistory(updateInboxNotification(notificationsRef.current, receiptId, action, kind, throughAt), uid);
  }, [saveNotificationHistory]);

  const markRecentNotificationsRead = useCallback(criteria => {
    const uid = notificationUidRef.current;
    if (!uid) return;
    const previous = notificationsRef.current;
    const next = markNotificationHistoryRead(previous, criteria, NOTIFICATION_STATE_LIMIT);
    saveNotificationHistory(next, uid);
  }, [saveNotificationHistory]);

  const getActiveUid = useCallback(() => currentUser?.id || null, [currentUser?.id]);
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

  const markAllNotificationsRead=async()=>{
    const uid=getActiveUid();
    if(!uid||historyUidRef.current!==uid)return;
    const snapshot=notificationsRef.current.filter(item=>!item.read&&!item.bellRead&&item.unreadCount>0);
    if(!snapshot.length)return;
    saveNotificationHistory(markNotificationBellRead(notificationsRef.current,snapshot),uid);
  };

  const markChatSeen = useCallback(
    (chatId, through = new Date().toISOString()) => {
      const uid = getActiveUid();
      if (!uid || !chatId) return;
      const key = lsKeyChats(uid);
      const map = readSeenMap(key);
      map[String(chatId)] = through;
      writeSeenMap(key, map);
      markRecentNotificationsRead({ chatId, through });
    },
    [getActiveUid, lsKeyChats, markRecentNotificationsRead]
  );

  const markSolicitudesSeenForArticulo = useCallback(
    (articuloId) => {
      const uid = getActiveUid();
      if (!uid || !articuloId) return;
      const key = lsKeyPosts(uid);
      const map = readSeenMap(key);
      map[String(articuloId)] = new Date().toISOString();
      writeSeenMap(key, map);
      markRecentNotificationsRead({ articleId: articuloId, through: map[String(articuloId)] });
    },
    [getActiveUid, lsKeyPosts, markRecentNotificationsRead]
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
      .or(`buyer_id.eq.${uid},seller_id.eq.${uid}`)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }).limit(50);

    if (res?.error?.message && /Could not find the 'seller_id' column/i.test(res.error.message)) {
      res = await supabase
        .from("chats")
        .select("id, articulo_id, buyer_id, owner_id, status, created_at, last_message_at")
        .or(`buyer_id.eq.${uid},owner_id.eq.${uid}`)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false }).limit(50);
    }

    if (res?.error?.message && /Could not find the 'owner_id' column/i.test(res.error.message)) {
      res = await supabase
        .from("chats")
        .select("id, articulo_id, buyer_id, usuario_id, status, created_at, last_message_at")
        .or(`buyer_id.eq.${uid},usuario_id.eq.${uid}`)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false }).limit(50);
    }

    return { data: Array.isArray(res?.data) ? res.data : [], error: res?.error || null };
  }, []);

  // ✅ Ref espejo de products — loadNotifications lo lee sin crear dependencia circular
  const productsRef = useRef([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { productsRef.current = products; }, [products]);

  const loadActivityNotifications = useCallback(async function loadActivity({ force = false } = {}) {
    const uid = getActiveUid();
    if (!uid) return [];
    const cache = activityRefreshRef.current;
    if (cache.uid === uid && cache.pending) {
      if (force) cache.dirty = true;
      return cache.pending;
    }
    if (!force && cache.uid === uid && Date.now() - cache.at < NOTIFICATION_REFRESH_MS) return cache.items;
    const pending = (async () => {
      try {
        const snapshotStartedAt=Date.now();
        const snapshot = await fetchActivityNotifications(supabase, uid);
        const incoming=snapshot.filter(item=>item.receipt_kind!=='support'||removedSupportRef.current.uid!==uid||!removedSupportRef.current.ids.has(String(item.receipt_id)));
        if (notificationUidRef.current !== uid) return [];
        const latestReads = readSeenMap(lsKeyChats(uid));
        const items = incoming.map(item => CONVERSATION_NOTIFICATION_TYPES.has(item.type)
          && Date.parse(latestReads[String(item.chat_id)] || '') >= Date.parse(item.created_at)
          ? { ...item, read: true, unreadCount: 0 } : item);
        if(items.some(item=>item.receipt_kind==='staff'&&!notificationsRef.current.some(previous=>previous.receipt_kind==='staff'&&previous.receipt_id===item.receipt_id)))setInboxRevision(value=>value+1);
        saveNotificationHistory(mergeActivitySnapshot(notificationsRef.current,items,snapshotStartedAt), uid);
        return items;
      } catch (error) {
        console.error('No se pudo actualizar la actividad de notificaciones:', error);
        return cache.uid === uid ? cache.items : [];
      }
    })();
    activityRefreshRef.current = { uid, at: 0, pending, items: cache.uid === uid ? cache.items : [] };
    const items = await pending;
    if (activityRefreshRef.current.pending === pending && notificationUidRef.current === uid) {
      const changedDuringRead = activityRefreshRef.current.dirty;
      activityRefreshRef.current = { uid, at: Date.now(), pending: null, items };
      if (changedDuringRead) return loadActivity({ force: true });
    }
    return items;
  }, [getActiveUid, saveNotificationHistory, lsKeyChats]);

  const loadNotifications = useCallback(async ({ reuseCached = false } = {}) => {
    const uid = getActiveUid();
    if (!uid) {
      setNotifChatCount(0);
      setNotifProfileCount(0);
      setNotifByArticulo({});
      setNotifications([]);
      return;
    }
    const refresh = notificationRefreshRef.current;
    if (refresh.uid === uid && refresh.pending) return refresh.pending;
    if (reuseCached && refresh.uid === uid && Date.now() - refresh.at < NOTIFICATION_REFRESH_MS) return;
    const pending = (async () => {

    // ✅ Usa ref en vez de closure sobre products — rompe la dependencia circular
    const currentProducts = productsRef.current;

    // Para títulos/imagenes rápidos
    const articleById = Object.fromEntries((currentProducts || []).map((p) => [String(getArticuloId(p) || ""), p]));

    const activityItems = await loadActivityNotifications({ force: !reuseCached });
    const dropdownItems = [...activityItems, ...publicationExpiryNotifications(currentProducts, uid)];

    // 1) Ventas pendientes (desde products ya cargados)
    try {
      const mine = (currentProducts || []).filter((p) => String(p?.owner_id || p?.usuario_id || "") === String(uid));
      for (const it of mine) {
        const estado = normEstado(it?.estado || it?.status || "");
        const tipo = normTipo(it?.mode || it?.tipo || "");
        const buyerId = it?.buyer_id || it?.buyerId || null;
        const artId = getArticuloId(it);

        if (tipo === "venta" && estado === "reservado" && buyerId) {
          const approved = isSaleApproved(it);


          dropdownItems.push({
            id: `venta-${String(artId)}`,
            type: "venta",
            articulo_id: artId,
            buyer_id: buyerId,
            created_at: it?.reserved_at || it?.updated_at || it?.created_at || new Date().toISOString(),
            title: approved ? 'Venta en curso' : "Venta pendiente",
            subtitle: `${it?.title || it?.titulo || "Artículo"} · ${approved ? 'Compra aprobada.' : 'Solicitud de compra recibida.'}`,
            thumb: buildArticleThumb(it),
            read: approved,
            unreadCount: approved ? 0 : 1,
          });
        }
      }
    } catch {}

    // 2) Solicitudes nuevas (postulaciones) para MIS artículos
    const solicitudesAgg = {}; // { [artId]: { count, latestAt } }
    try {
      const myArticuloIds = Array.from(
        new Set(
          (currentProducts || [])
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
            solicitudesAgg[String(artId)] = solicitudesAgg[String(artId)] || { count: 0, unread: 0, latestAt: 0 };
            solicitudesAgg[String(artId)].count += 1;
            solicitudesAgg[String(artId)].latestAt = Math.max(solicitudesAgg[String(artId)].latestAt, createdAtMs);

            if (createdAtMs && createdAtMs > seenAtMs) {
              solicitudesAgg[String(artId)].unread += 1;
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
          title: "Solicitudes recibidas",
          subtitle: `${agg.count} solicitud(es) en: ${title}.`,
          thumb: buildArticleThumb(art),
          read: agg.unread === 0,
          unreadCount: agg.unread,
        });
      }
    } catch {}

    // 3) Mensajes no vistos (chat_messages) usando seenMap por chatId
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
          .neq('sender_id', uid)
          .order("created_at", { ascending: false })
          .limit(NOTIFICATION_MESSAGE_LIMIT);

        if (!msgErr && Array.isArray(msgs)) {
          const chatById = Object.fromEntries(chats.map((c) => [String(c.id), c]));

          for (const m of msgs) {
            const chatId = m?.chat_id;
            const senderId = m?.sender_id;
            if (!chatId) continue;
            if (String(senderId) === String(uid)) continue;

            const createdAt = m?.created_at ? new Date(m.created_at).getTime() : 0;
            const seenAtStr = seenMap[String(chatId)];
            const seenAt = seenAtStr ? new Date(seenAtStr).getTime() : 0;
            unreadChatAgg[String(chatId)] = unreadChatAgg[String(chatId)] || {
              count: 0, unread: 0, latestAt: 0, chatRow: chatById[String(chatId)] || null,
            };
            unreadChatAgg[String(chatId)].count += 1;
            unreadChatAgg[String(chatId)].latestAt = Math.max(unreadChatAgg[String(chatId)].latestAt, createdAt);

            if (createdAt && createdAt > seenAt) {
              unreadChatAgg[String(chatId)].unread += 1;
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
            title: "Mensajes recibidos",
            subtitle: `${agg.count} mensaje(s) en: ${artTitle}.`,
            thumb: buildArticleThumb(art),
            read: agg.unread === 0,
            unreadCount: agg.unread,
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
        if ([...activityItems, ...notificationsRef.current].some(item => item.type === 'donation_accepted'
          && String(item.articulo_id) === String(artId))) continue;
        const updatedAt = p?.reserved_at || p?.updated_at || p?.created_at || new Date().toISOString();
        const updatedMs = new Date(updatedAt).getTime();
        const seenMs = seenGanador[String(artId)] ? new Date(seenGanador[String(artId)]).getTime() : 0;
        dropdownItems.push({
          id: `ganador-${String(artId)}`,
          type: "ganador",
          articulo_id: artId,
          created_at: updatedAt,
          title: "¡Fuiste elegido! 🎉",
          subtitle: `${p?.titulo || p?.title || "Artículo"} — Abre el chat para coordinar la entrega.`,
          thumb: buildArticleThumb(p),
          read: updatedMs <= seenMs,
          unreadCount: updatedMs > seenMs ? 1 : 0,
        });
      }
    } catch {}

    const sortedDropdown = [...dropdownItems].sort((a, b) => {
      const ta = a?.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b?.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });

    if (notificationUidRef.current !== uid) return;
    const latestChatReads = readSeenMap(lsKeyChats(uid));
    const latestPostReads = readSeenMap(lsKeyPosts(uid));
    for (const item of sortedDropdown) {
      const seen = item.type === 'chat' ? latestChatReads[String(item.chat_id)]
        : item.type === 'postulacion' ? latestPostReads[String(item.articulo_id)] : null;
      if (!seen || Date.parse(seen) < Date.parse(item.created_at) || item.read) continue;
      item.read = true;
      item.unreadCount = 0;
    }
    const history = mergeNotificationHistory(notificationsRef.current, sortedDropdown, NOTIFICATION_STATE_LIMIT);
    saveNotificationHistory(history, uid);
    })();
    notificationRefreshRef.current = { uid, at: refresh.uid === uid ? refresh.at : 0, pending };
    try { await pending; }
    finally {
      if (notificationRefreshRef.current.pending === pending) {
        notificationRefreshRef.current = { uid, at: Date.now(), pending: null };
      }
    }
  }, [getActiveUid, lsKeyChats, lsKeyPosts, fetchChatsForUid, saveNotificationHistory, loadActivityNotifications]);

  // =========================================================
  // ✅ helper: abrir chat por articulo + buyerId
  // =========================================================

  const openChatByArticleAndBuyer = useCallback(
    async ({ article: requestedArticle, buyerId: requestedBuyerId, expectedChatId = null, fromInbox = false }) => {
      const uid = getActiveUid();
      const articuloId = getArticuloId(requestedArticle);
      if (!uid) return alert("Debes iniciar sesión.");
      if (!articuloId) return alert("Este artículo no tiene ID válido.");
      if (isUserBlocked) return alert("Tu cuenta está bloqueada. No puedes acceder a chats.");
      try {
        const article = expectedChatId
          ? await readNotificationChatContext(supabase, { chatId: expectedChatId, articleId: articuloId, userId: uid })
          : await readArticleContext(supabase, articuloId);
        const historicalChat = expectedChatId && article.transaction_chat?.status === 'closed';
        const inboxChat = fromInbox && expectedChatId && article.transaction_chat;
        if (isInReview(article)) return alert("Este artículo está en revisión. El chat está deshabilitado temporalmente.");
        const isSale = normTipo(article.mode || article.tipo) === "venta";
        const buyerId = resolveChatBuyerId({ article, chat: expectedChatId ? article.transaction_chat : null, userId: uid, otherUserId: requestedBuyerId });
        if (!historicalChat && !inboxChat && isSale && (!article.buyer_id || !["reservado", "entregado"].includes(normEstado(article.estado || article.status)))) {
          return alert("Esta venta no tiene una reserva activa. Actualiza tus publicaciones.");
        }
        let finalChat = historicalChat || inboxChat ? article.transaction_chat : validateTransactionChat(article, uid);
        if (!inboxChat && isSale && finalChat?.status === "pending") {
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
        if (!historicalChat) {
          setProducts(previous => previous.map(item => String(item.id) === String(article.id) ? { ...item, ...article } : item));
          setManageArticle(previous => previous?.id === article.id ? { ...previous, ...article } : previous);
        }
        setChatOpen({
          article, chat: finalChat, otherUserId,
          otherUserProfile: String(otherUserId) === String(article.owner_id) ? article.owner_public : article.buyer_public,
          role: String(uid) === String(finalChat.buyer_id) ? "buyer" : "seller",
          errorMessage: null,
        });
        markChatSeen(finalChat.id);
      } catch (error) {
        console.error("Error abriendo chat:", error);
        if (expectedChatId) {
          alert(error.message || 'No se pudo abrir la conversación. Intenta nuevamente.');
          return;
        }
        alert(error.message || "No se pudo abrir el chat. Intenta nuevamente.");
      }
    },
    [getActiveUid, markChatSeen, isUserBlocked]
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
      return art;

    },
    [currentUser, markSolicitudesSeenForArticulo]
  );

  // =========================================================
  // ✅ Sesión Supabase + merge con tabla usuarios
  // =========================================================

  useEffect(() => {
    let alive = true;
    let requestedUid;
    let hydrationVersion = 0;

    const hydrateUser = async (session, force = false) => {
      const sbUser = session?.user || null;
      const uid = sbUser?.id || null;
      if (!force && requestedUid === uid) return;
      requestedUid = uid;
      const version = ++hydrationVersion;
      try {
        if (!alive || version !== hydrationVersion) return;

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
        if (!alive || version !== hydrationVersion) return;
        const verifiedUser = verified?.user || null;

        if (verifyError || !verifiedUser || verifiedUser.id !== sbUser.id) {
          await supabase.auth.signOut();
          if (!alive || version !== hydrationVersion) return;
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
  .select("id,nombre,movil,ciudad,localidad,direccion,foto_url,is_blocked,bloqueado,ban_until,blocked,estado,status,rol,role")
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

        if (!alive || version !== hydrationVersion) return;
        setCurrentUser(merged);
        setLoading(false);
      } catch (e) {
        console.error("Error cargando sesión/perfil:", e);
        if (!alive || version !== hydrationVersion) return;
        setCurrentUser(null);
        setLoading(false);
      }
    };

    supabase.auth.getSession().then(({ data }) => { if (!hydrationVersion) hydrateUser(data?.session); });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED') return;
      hydrateUser(session, event === 'USER_UPDATED');
    });

    return () => {
      alive = false;
      listener?.subscription?.unsubscribe?.();
    };
  }, []);

  // =========================================================
  // ✅ Loader artículos + owner_name/photo + ✅ interested_count
  // =========================================================

  const load = useCallback(async ({ refreshPersonal = false, reuseCached = false } = {}) => {
    const request = ++homeRequestRef.current;
    const catalogVersion = catalogVersionRef.current;
    const cacheKey = JSON.stringify([homeFilters, requestedPage, currentUser?.id || null]);
    if (!reuseCached || refreshPersonal) listingCacheRef.current.clear();
    const cached = reuseCached && !refreshPersonal ? listingCacheRef.current.get(cacheKey) : null;
    if (cached) {
      setHomePage(cached.page);
      productsRef.current = cached.products;
      setProducts(cached.products);
      setHomeError("");
      setHomeBusy(false);
      return;
    }
    setHomeBusy(true);
    setHomeError("");
    try {
    const { data: pageData, error: pageError } = await supabase.rpc("home_article_page", {
      p_filters: homeFilters, p_page: requestedPage,
    });
    if (pageError) throw pageError;
    const sharedId = sharedArticleRef.current;
    // Resolve a shared link in the existing catalog request, even on another page/city.
    const pageIds = [...new Set([...pageData.ids, ...pageData.featuredIds, ...(sharedId ? [sharedId] : [])])];
    // ✅ Solo columnas necesarias para el listado — sin select("*")
    const columns = `article_view_totals(view_count),id, titulo, title, mode, tipo, estado, status,
         city, locality, description,
         price, interested_count, usuario_id, owner_id, buyer_id,
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
    const normalized = raw.map((it) => {
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
        interested_count: Number(it.interested_count || 0),
      };
    });

    // The database already maintains interested_count; no applicants read is needed.
    if (request !== homeRequestRef.current) return;
    listingCacheRef.current.set(cacheKey, { page: pageData, products: normalized });
    if (catalogVersion === catalogVersionRef.current) setCatalogChanged(false);
    setHomePage(pageData);
    productsRef.current = normalized;
    setProducts(normalized);

    if (sharedId && sharedArticleRef.current === sharedId) {
      sharedArticleRef.current = null;
      const shared = normalized.find(article => String(article.id) === sharedId);
      const visible = shared && ['disponible', 'reservado', 'entregado', 'available', 'reserved', 'delivered'].includes(shared.estado || shared.status)
        && ![shared.review_status, shared.approval_status, shared.moderation_status, shared.revision_status].some(value => ['pending', 'en_revision', 'rejected', 'rechazado'].includes(value));
      if (isUserBlocked) setSharedArticleError("Tu cuenta está bloqueada. No puedes abrir publicaciones.");
      else if (visible) setSelectedProduct(shared);
      else setSharedArticleError("Esta publicación ya no está disponible o no se puede consultar.");
      const url = new URL(window.location.href);
      url.searchParams.delete('articulo');
      window.history.replaceState(window.history.state, '', url);
    }

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
  }, [homeFilters, requestedPage, currentUser?.id, isUserBlocked]);

  // ✅ Carga inicial única — sin polling agresivo
  // Se recarga solo cuando el usuario vuelve a la pestaña (visibilitychange)
  // y solo si pasó suficiente tiempo para ahorrar lecturas
  const lastLoadRef = useRef(0);

  useEffect(() => {
    let alive = true;

    const run = async (refreshPersonal = false) => {
      if (!alive) return;
      await load({ refreshPersonal, reuseCached: !refreshPersonal });
      if (!alive) return;
      lastLoadRef.current = Date.now();
      if (getActiveUid()) await loadNotifications({ reuseCached: !refreshPersonal });
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

  // One receive-only private user topic serves bell, profile, balance and chat state.
  // Keep callbacks current without tearing down a channel on every UI update.
  const liveHandlersRef = useRef({});
  liveHandlersRef.current = {
    market: signal => {
      const uid = notificationUidRef.current;
      if (!uid) return;
      if (signal.kind === 'balance') notifyCreditBalance(uid, Number(signal.saldo));
      if (signal.notice) {
        let notice = signal.notice;
        if (['chat', 'postulacion'].includes(notice.type)) {
          const key = notice.type === 'chat' ? lsKeyChats(uid) : lsKeyPosts(uid);
          const seenAt = readSeenMap(key)[String(notice.chat_id || notice.articulo_id)];
          notice = noticeFromSignal(signal, notificationsRef.current.find(item => item.id === notice.id), seenAt);
        } else {
          const seenAt = readSeenMap(lsKeyChats(uid))[String(notice.chat_id)];
          if (CONVERSATION_NOTIFICATION_TYPES.has(notice.type) && Date.parse(seenAt || '') >= Date.parse(notice.created_at))
            notice = { ...notice, read: true, unreadCount: 0 };
        }
        saveNotificationHistory(mergeNotificationHistory(notificationsRef.current, [notice], NOTIFICATION_STATE_LIMIT), uid);
        if (notice.type === 'system_notice') setInboxRevision(value => value + 1);
      }
      if (signal.kind === 'application' && Number.isInteger(signal.interested_count)) {
        const update = rows => rows.map(article => String(article.id) === String(signal.articulo_id)
          ? { ...article, interested_count: signal.interested_count } : article);
        productsRef.current = update(productsRef.current);
        setProducts(productsRef.current);
        if (personalArticlesRef.current.rows) personalArticlesRef.current.rows = update(personalArticlesRef.current.rows);
        listingCacheRef.current.clear();
        if (signal.action === 'DELETE') {
          saveNotificationHistory(notificationsRef.current.map(item => {
            if (item.id !== `post-${signal.articulo_id}`) return item;
            const unreadCount = Math.min(item.unreadCount || 0, signal.interested_count);
            return { ...item, unreadCount, read: unreadCount === 0 };
          }), uid);
        }
      }
      if (signal.kind === 'article' && signal.article?.id) {
        const article = signal.article;
        const update = rows => signal.action === 'DELETE' ? rows.filter(row => row.id !== article.id)
          : rows.some(row => row.id === article.id)
            ? rows.map(row => row.id === article.id ? { ...row, ...article, isFeatured: !!article.is_featured } : row)
            : article.owner_id === uid ? [...rows, { ...article, isFeatured: !!article.is_featured }] : rows;
        productsRef.current = update(productsRef.current);
        setProducts(productsRef.current);
        if (personalArticlesRef.current.rows) personalArticlesRef.current.rows = update(personalArticlesRef.current.rows);
        listingCacheRef.current.clear();
        const patch = row => row?.id === article.id ? (signal.action === 'DELETE' ? null : { ...row, ...article }) : row;
        setSelectedProduct(patch);
        setManageArticle(patch);
        setChatOpen(previous => previous?.article?.id === article.id
          ? (signal.action === 'DELETE' ? null : { ...previous, article: { ...previous.article, ...article } }) : previous);
        if (article.owner_id === uid && article.mode === 'venta') {
          if (signal.action !== 'DELETE' && article.status === 'reservado' && article.buyer_id) {
            const existing = notificationsRef.current.find(item => item.id === `venta-${article.id}`);
            const notice = { id: `venta-${article.id}`, type: 'venta', articulo_id: article.id, buyer_id: article.buyer_id,
              created_at: article.reserved_at || article.updated_at, title: 'Venta pendiente',
              subtitle: `${article.title || 'Artículo'} · Solicitud de compra recibida.`,
              thumb: buildArticleThumb(article), read: existing?.read === true, unreadCount: existing?.read ? 0 : 1 };
            saveNotificationHistory(mergeNotificationHistory(notificationsRef.current, [notice], NOTIFICATION_STATE_LIMIT), uid);
          } else {
            saveNotificationHistory(notificationsRef.current.map(item => item.id === `venta-${article.id}`
              ? { ...item, read: true, unreadCount: 0 } : item), uid);
          }
        }
      }
      if (signal.kind === 'chat' && signal.chat?.status === 'open') {
        saveNotificationHistory(notificationsRef.current.map(item => item.id === `venta-${signal.chat.articulo_id}`
          ? { ...item, title: 'Venta en curso', read: true, unreadCount: 0 } : item), uid);
      }
      dispatchMarketSignal({ ...signal, uid });
    },
    reconnect: () => {
      // Coalesce socket flaps. Recover missed personal state, then notifications;
      // this runs only after rejoining, never on a repeating interval.
      clearTimeout(reconnectTimerRef.current);
      const uid = notificationUidRef.current;
      reconnectTimerRef.current = setTimeout(async () => {
        if (!uid || notificationUidRef.current !== uid) return;
        setRealtimeStatus('RECOVERING');
        try {
          const [account, balance] = await Promise.all([
            supabase.from('usuarios').select('id,is_blocked,bloqueado,ban_until').eq('id', uid).maybeSingle(),
            supabase.from('cupos').select('saldo').eq('usuario_id', uid).maybeSingle(),
          ]);
          if (notificationUidRef.current !== uid) return;
          if (!account.error && account.data) setCurrentUser(previous => previous?.id === uid ? { ...previous, ...account.data } : previous);
          if (!balance.error) notifyCreditBalance(uid, Number(balance.data?.saldo || 0));
          await load({ refreshPersonal: true });
          if (notificationUidRef.current !== uid) return;
          await loadNotifications();
          dispatchMarketSignal({ kind: 'reconnect', uid });
          setRealtimeRevision(value => value + 1);
          setRealtimeStatus(realtimeReadyRef.current ? 'SUBSCRIBED' : 'CHANNEL_ERROR');
        } catch (error) {
          if (notificationUidRef.current === uid) setRealtimeStatus('CHANNEL_ERROR');
          console.error('No se pudieron sincronizar los avisos:', error);
        }
      }, 400);
    },
  };

  useEffect(() => {
    realtimeReadyRef.current = false;
    let firstJoin = true;
    const stop = subscribeStaffInbox(supabase, { id: currentUser?.id, created_at: currentUser?.created_at }, notice => {
      const uid = notificationUidRef.current;
      if (!uid) return;
      if (notice.receipt_kind!=='support'&&!notificationsRef.current.some(item => item.receipt_kind === 'staff' && item.receipt_id === notice.receipt_id)) setInboxRevision(value => value + 1);
      saveNotificationHistory(mergeNotificationHistory(notificationsRef.current, [notice], NOTIFICATION_STATE_LIMIT), uid);
    }, profile => {
      const uid = notificationUidRef.current;
      setCurrentUser(previous => previous?.id === uid ? { ...previous, ...profile } : previous);
      if (profile.is_blocked || profile.bloqueado) { setIsPublishOpen(false); setChatOpen(null); setSelectedProduct(null); }
    }, {
      onSupportRemoved: threadId=>syncInboxReceipt(notificationUidRef.current,threadId,'delete','support'),
      onMarketSignal: signal => liveHandlersRef.current.market(signal),
      onReconnect: () => liveHandlersRef.current.reconnect(),
      onStatus: status => {
        realtimeReadyRef.current = status === 'SUBSCRIBED'; setRealtimeStatus(status);
        if (status === 'SUBSCRIBED') {
          // A slow first join may happen after the initial HTTP snapshot.
          if (firstJoin && notificationRefreshRef.current.at > 0) liveHandlersRef.current.reconnect();
          firstJoin = false;
        }
      },
    });
    return () => { clearTimeout(reconnectTimerRef.current); stop(); };
  }, [currentUser?.id, currentUser?.created_at, saveNotificationHistory,syncInboxReceipt]);

  useEffect(() => {
    if (currentView !== 'home') return;
    let active = true, joined = false;
    const channel = supabase.channel(catalogTopic(selectedCity, selectedCategory))
      .on('broadcast', { event: 'catalog_changed' }, ({ payload }) => {
        // Public broadcasts are advisory only. Authoritative data is read on click.
        if (!active || !payload?.id || !['INSERT', 'UPDATE', 'DELETE'].includes(payload.action)) return;
        catalogVersionRef.current++;
        listingCacheRef.current.clear();
        setCatalogChanged(true);
      }).subscribe(status => {
        if (active && status === 'SUBSCRIBED') {
          if (joined) { listingCacheRef.current.clear(); setCatalogChanged(true); }
          joined = true;
        }
      });
    return () => { active = false; supabase.removeChannel(channel); };
  }, [currentView, selectedCity, selectedCategory]);

  useEffect(() => {
    notificationRefreshRef.current = { uid: null, at: 0, pending: null };
    activityRefreshRef.current = { uid: null, at: 0, pending: null, items: [] };
    if (currentUser?.id) {
      saveNotificationHistory(readNotificationHistory(localStorage, currentUser.id), currentUser.id);
    } else {
      setNotifChatCount(0);
      setNotifProfileCount(0);
      setNotifByArticulo({});
      setNotifications([]);
      notificationsRef.current = [];
      historyUidRef.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  const currentCityData = useMemo(() => {
    return COLOMBIA_DATA.find((c) => c.city === selectedCity);
  }, [selectedCity, COLOMBIA_DATA]);

  const handlePublishClick = () => {
    if (!currentUser) setIsAuthOpen(true);
    else if (isUserBlocked) return;
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
  const handleApply = async (productId, message, useCredit = false) => {
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
      const res = await crearPostulacionConLimite({ articuloId: productId, usuarioId: uid, justificacion: message || "", useCredit });
      if (res && res.success === false) {
        if (res.code) return res;
        throw new Error(res.error || "No se pudo enviar tu solicitud.");
      }

      alert("¡Solicitud enviada! El vendedor decidirá a quién entregárselo.");
      notifyCreditBalance(uid, res.balance);
      // ✅ Actualización local del contador — sin recargar todo
      setProducts((prev) =>
        prev.map((it) =>
          String(getArticuloId(it)) === String(productId) && !res.alreadyExists
            ? { ...it, interested_count: (Number(it.interested_count) || 0) + 1 }
            : it
        )
      );
      return res;
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

  const handleBuy = async (productId, useCredit = false) => {
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
      const { article, balance } = await transitionSale(supabase, productId, "reserve", useCredit);
      if (Number.isInteger(balance)) notifyCreditBalance(uid, balance);
      applyArticleUpdate(article);
      setSelectedProduct(null);
      alert("Solicitud de compra enviada. Para hablar con el vendedor, él debe aprobar la compra y abrir el chat.");
      loadNotifications().catch(error => console.error("Error actualizando notificaciones:", error));
      return { success: true, data: article };
    } catch (error) {
      if (!['SALE_CREDIT_REQUIRED', 'SALE_LIMIT_REACHED', 'INSUFFICIENT_CREDITS'].includes(error.code)) console.error("Error reservando venta:", error);
      return { success: false, error: error.message || "No se pudo reservar el articulo.", code: error.code, quote: error.quote };
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
    const uid = getActiveUid();

    const base = products.filter((item) => {
      if (!homePage.ids.includes(item.id)) return false;
      if (isPublicationExpired(item, publicationNow)) return false;
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

      const matchesCategory =
        selectedCategory === "Todo" || normStr(getCategoria(item)) === normStr(selectedCategory);

      const matchesSub =
        !selectedSubcategory || normStr(getSubcategoria(item)) === normStr(selectedSubcategory);

      const matchesCity = (item.city || item.ciudad) === selectedCity;
      const matchesLocality = selectedLocality === "Todas" || (item.locality || item.localidad_es) === selectedLocality;

      return matchesCategory && matchesSub && matchesCity && matchesLocality;
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
    publicationNow,
  ]);

  // ✅ Artículos destacados (filtrados por búsqueda/categoría/ciudad igual que la lista principal)
  const featuredProducts = useMemo(() => {
    return products.filter(p => homePage.featuredIds.includes(p.id) && p.isFeatured
      && !isPublicationExpired(p, publicationNow)
      && normEstado(p.estado || p.status || "") !== "entregado");
  }, [products, homePage.featuredIds, publicationNow]);

  const totalPages = homePage.pageCount ?? Math.max(1, Math.ceil(homePage.total / 12));
  const changeHomePage = page => {
    setPageSelection({ key: homeFilterKey, page });
    listingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };


  const myProducts = useMemo(() => {
    const uid = getActiveUid();
    if (!uid) return [];
    return products.filter((p) => p.owner_id === uid || p.usuario_id === uid);
  }, [products, getActiveUid]);
  const profileBadges = useMemo(() => profileNotificationBadges(
    historyUidRef.current === currentUser?.id ? notifications : [], currentUser?.id, myProducts
  ), [notifications, currentUser?.id, myProducts]);

  const inboxCategoryCounts=useMemo(()=>profileInboxBadges(historyUidRef.current===currentUser?.id?notifications:[],currentUser?.id),[notifications,currentUser?.id]);

  if (loading) {
    return <div className="h-screen flex items-center justify-center font-black uppercase">Cargando MiBatute...</div>;
  }

  return (
    <Suspense fallback={<div role="status" className="min-h-screen flex items-center justify-center">Cargando...</div>}>
    <Routes>
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route
        path="/"
        element={
          <div className={`min-h-screen bg-[#F5F5F5]${designPreview ? ' mb-design-preview' : ''}`} data-realtime-state={realtimeStatus} data-realtime-revision={realtimeRevision}>
            {import.meta.env.DEV && <div className="design-comparison" role="group" aria-label="Comparar diseño local">
              <span>Vista local</span>
              <button type="button" aria-pressed={!designPreview} onClick={() => changeDesign(false)}>Actual</button>
              <button type="button" aria-pressed={designPreview} onClick={() => changeDesign(true)}>Propuesta</button>
            </div>}
            <Navbar
              onSearch={setSearchTerm}
              searchTerm={searchTerm}
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
              notifications={historyUidRef.current === currentUser?.id ? notifications.map(item=>({...item,read:item.read||!!item.bellRead})) : []}
              onNotificationsOpen={() => { if (!realtimeReadyRef.current) loadNotifications({ reuseCached: true }); }}
              realtimeStatus={realtimeStatus}
              onMarkAllNotificationsRead={markAllNotificationsRead}
              onNotificationClick={async (item) => {
                const uid = getActiveUid();
                if (!uid) {
                  setIsAuthOpen(true);
                  return;
                }

                if (!['chat', 'postulacion', 'ganador', 'venta'].includes(item?.type)) {
                  const destination = activityDestination(item?.type);
                  if (destination === 'chat' && item?.articulo_id) {
                    await openChatByArticleAndBuyer({ article: { id: item.articulo_id }, buyerId: item.buyer_id || uid, expectedChatId: item.chat_id });
                  } else {
                    const owned = products.some(p => String(p.id) === String(item.articulo_id) && String(p.owner_id) === String(uid));
                    setProfileNotificationTarget({ id: item.id, articleId: item.articulo_id, receiptId: item.receipt_id, receiptKind:item.receipt_kind,
                      tab: owned ? 'publicaciones' : destination });
                    setCurrentView('profile');
                  }
                  return;
                }

                if (item?.type === "chat") {
                  await openChatByArticleAndBuyer({ article: { id: item.articulo_id }, buyerId: item?.buyer_id || uid, expectedChatId: item.chat_id });
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
                  await openChatByArticleAndBuyer({ article: { id: item.articulo_id }, buyerId: uid });
                  return;
                }

                if (item?.type === "venta") {
                  const art = await openManageFromNotif(item?.articulo_id);

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
                markRecentNotificationsRead({ id: item.id, through: item.created_at });
                if (item?.type === "chat" && item?.chat_id) {
                  markChatSeen(item.chat_id);
                  return;
                }
                if (item?.type === "postulacion" && item?.articulo_id) {
                  markSolicitudesSeenForArticulo(item.articulo_id);
                  return;
                }
              }}
              onMessagesClick={() => {
                if (!currentUser) return setIsAuthOpen(true);
                setCurrentView("profile");
              }}
            />

            <main className="max-w-7xl mx-auto px-4 py-8">
              <Suspense fallback={<div role="status" className="py-12 text-center">Cargando...</div>}>
              {currentView === "home" && (
                <div className="animate-in fade-in duration-500">
                  {/* Mostrar banner solo cuando NO hay búsqueda (evita que se atraviese entre la barra y resultados) */}
                  {searchTerm.trim() === "" && (
                    <div className="rounded-3xl">
                      <HeroBanner sponsorFilters={{city:selectedCity,locality:selectedLocality,category:selectedCategory}} onLearnMore={() => setCurrentView("how-it-works")} />

                    </div>
                  )}

                  <div className={`home-catalog flex flex-col lg:flex-row gap-4 lg:gap-8${filteredProducts.length === 12 && !homeBusy && !homeError ? ' home-catalog--full' : ''}${totalPages > 1 && !homeError ? ' home-catalog--paginated' : ''}`}>
                    <aside className="contents lg:block lg:w-1/4 shrink-0 min-w-0" aria-label="Filtros del catálogo">
                      <div className="order-1 min-w-0">
                      {/* Categorías */}
                      <FilterSection id="category-filters" title="Categorías" icon={<LayoutGrid size={18} className="shrink-0 text-forest-green" aria-hidden="true" />}
                        summary={selectedCategory === "Todo" ? "Todas las categorías" : [selectedCategory, selectedSubcategory].filter(Boolean).join(' / ')}
                        action={(selectedCategory !== "Todo" || selectedSubcategory) && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedCategory("Todo");
                                setSelectedSubcategory("");
                                setExpandedCategory(null);
                              }}
                              className="text-[10px] font-black uppercase text-gray-500 hover:text-forest-green"
                            >
                              Limpiar
                            </button>
                          )}>

                        <div className="space-y-1">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCategory("Todo");
                              setSelectedSubcategory("");
                              setExpandedCategory(null);
                            }}
                            className={`w-full text-left text-sm min-h-11 py-2 px-3 rounded-md transition border ${
                              selectedCategory === "Todo"
                                ? "bg-forest-green text-white font-bold border-forest-green"
                                : "bg-white text-gray-600 border-gray-200 hover:border-forest-green"
                            }`}
                          >
                            Todo
                          </button>

                          {CATEGORY_TREE.map((cat) => {
                            const isActive = selectedCategory === cat.key;
                            const isExpanded = expandedCategory === cat.key;
                            const panelId = `category-subs-${CATEGORY_TREE.indexOf(cat)}`;
                            return (
                              <div key={cat.key} className="pt-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setExpandedCategory(isExpanded ? null : cat.key);
                                    if (!isActive) {
                                      setSelectedCategory(cat.key);
                                      setSelectedSubcategory("");
                                    }
                                  }}
                                  aria-expanded={isExpanded}
                                  aria-controls={panelId}
                                  aria-pressed={isActive}
                                  className={`w-full flex items-center gap-2 text-left text-sm min-h-11 py-2 px-3 rounded-md transition border ${
                                    isActive
                                      ? "bg-gray-900 text-white font-bold border-gray-900"
                                      : "bg-white text-gray-600 border-gray-200 hover:border-forest-green"
                                  }`}
                                >
                                  {designPreview && <CategoryIcon category={cat.key} />}
                                  <span className="min-w-0 flex-1 break-words">{designPreview ? cat.key : cat.label}</span>
                                  <ChevronDown size={16} className={`shrink-0 transition-transform motion-reduce:transition-none ${isExpanded ? 'rotate-180' : ''}`} aria-hidden="true" />
                                </button>

                                  <div id={panelId} className={`${isExpanded ? 'block' : 'hidden'} mt-2 ml-3 space-y-1 pl-2 border-l-2 border-gray-200`}>
                                    <button
                                      type="button"
                                      onClick={() => setSelectedSubcategory("")}
                                      aria-pressed={!selectedSubcategory && isActive}
                                      className={`w-full text-left text-[13px] min-h-11 py-2 px-3 rounded-md transition border flex items-center gap-2 ${
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
                                        aria-pressed={selectedSubcategory === sub && isActive}
                                        className={`w-full text-left text-[13px] min-h-11 py-2 px-3 rounded-md transition border flex items-center gap-2 ${
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
                              </div>
                            );
                          })}
                        </div>
                      </FilterSection>

                      {/* Localidades */}
                      <FilterSection id="locality-filters" title={`Localidades en ${selectedCity}`} icon={<MapPin size={18} className="shrink-0 text-forest-green" aria-hidden="true" />}
                        summary={selectedLocality === "Todas" ? "Todas las localidades" : selectedLocality}>

                        <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                          <button
                            type="button"
                            aria-pressed={selectedLocality === "Todas"}
                            onClick={() => setSelectedLocality("Todas")}
                            className={`w-full text-left text-sm min-h-11 py-2 px-3 rounded-md transition ${
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
                              type="button"
                              aria-pressed={selectedLocality === loc}
                              onClick={() => setSelectedLocality(loc)}
                              className={`w-full text-left text-sm min-h-11 py-2 px-3 rounded-md transition ${
                                selectedLocality === loc
                                  ? "bg-forest-green text-white font-bold"
                                  : "text-gray-500 hover:bg-gray-100"
                              }`}
                            >
                              {loc}
                            </button>
                          ))}
                        </div>

                      </FilterSection>

                      <FilterSection id="publication-filters" title="Tipo de publicación"
                        icon={<SlidersHorizontal size={18} className="shrink-0 text-forest-green" aria-hidden="true" />}
                        summary={`${PUBLICATION_TYPES.find(type => type.key === quickTipo)?.label} / ${onlyActive ? 'Solo activas' : 'Incluye reservadas'}`}>
                        <div className="space-y-4">
                          <div role="radiogroup" aria-label="Tipo de publicación" className="grid grid-cols-2 gap-2">
                            {PUBLICATION_TYPES.map(type => (
                              <label key={type.key} className="relative cursor-pointer min-w-0">
                                <input type="radio" name="publication-type" value={type.key}
                                  checked={quickTipo === type.key} onChange={() => setQuickTipo(type.key)}
                                  className="peer sr-only" />
                                <span className="flex min-h-11 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-600 transition hover:border-forest-green peer-checked:border-forest-green peer-checked:bg-forest-green peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-forest-green">
                                  <span className="shrink-0">{type.icon}</span>
                                  <span className="min-w-0 break-words">{type.label}</span>
                                </span>
                              </label>
                            ))}
                          </div>
                          <label className="flex min-h-11 items-center justify-between gap-3 border-t border-gray-200 pt-3 cursor-pointer">
                            <span className="text-sm font-semibold text-gray-700">Solo activas</span>
                            <span className="relative inline-flex shrink-0">
                              <input type="checkbox" role="switch" checked={onlyActive}
                                onChange={event => setOnlyActive(event.target.checked)}
                                className="peer sr-only" />
                              <span aria-hidden="true" className="h-6 w-11 rounded-full bg-gray-300 transition peer-checked:bg-forest-green peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-forest-green" />
                              <span aria-hidden="true" className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5 motion-reduce:transition-none" />
                            </span>
                          </label>
                          <label className="flex items-center justify-between gap-3">
                            <span className="text-sm font-semibold text-gray-700">Orden</span>
                            <select aria-label="Orden de publicaciones" value={sortOrder} onChange={event => setSortOrder(event.target.value)}
                              className="min-w-0 min-h-11 max-w-[70%] rounded-md border border-gray-200 bg-white px-2 py-2 text-sm text-gray-700 focus-visible:outline-2 focus-visible:outline-forest-green">
                              <option value="random">Aleatorias</option>
                              <option value="newest">Más recientes</option>
                              <option value="oldest">Más antiguas</option>
                            </select>
                          </label>
                        </div>
                      </FilterSection>
                      <FilterSection id="condition-filters" title="Estado del artículo"
                        icon={<BadgeCheck size={18} className="shrink-0 text-forest-green" aria-hidden="true" />}
                        summary={minCondition === 0 ? "Todos los estados" : `Desde ${minCondition}/10`}
                        action={minCondition > 0 && <button type="button" onClick={() => {
                          setConditionDraft(0);
                          setMinCondition(0);
                        }} className="min-h-11 text-xs font-semibold text-gray-500 hover:text-forest-green">Limpiar</button>}>
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <label htmlFor="condition-minimum" className="font-semibold text-gray-700">Estado mínimo</label>
                          <output htmlFor="condition-minimum" className="font-bold tabular-nums text-forest-green">{conditionDraft === 0 ? 'Todos' : `${conditionDraft}/10`}</output>
                        </div>
                        <input id="condition-minimum" type="range" min="0" max="10" step="1" value={conditionDraft}
                          aria-valuetext={conditionDraft === 0 ? 'Todos los estados' : `Desde ${conditionDraft} de 10`}
                          onChange={event => setConditionDraft(Number(event.target.value))}
                          onPointerUp={event => setMinCondition(Number(event.currentTarget.value))}
                          onKeyUp={event => setMinCondition(Number(event.currentTarget.value))}
                          onBlur={event => setMinCondition(Number(event.currentTarget.value))}
                          className="mt-2 block h-11 w-full cursor-pointer accent-forest-green" />
                        <div className="flex justify-between text-xs text-gray-500"><span>0 · Todos</span><span>10 · Casi nuevo</span></div>
                      </FilterSection>
                      </div>
                      <div className="home-catalog-sponsors order-3 min-w-0 lg:mt-6">
                        <SponsorCarousel sponsorFilters={{city:selectedCity,locality:selectedLocality,category:selectedCategory}} />
                        {designPreview && <SocialBar />}
                      </div>
                    </aside>

                    <div className="home-catalog-results order-2 min-w-0 lg:w-3/4">
                      <FeaturedTicker
                        key={JSON.stringify([searchTerm.trim().toLowerCase(), selectedCategory, selectedSubcategory, selectedCity, selectedLocality, quickTipo, onlyActive, hiddenAdsOwnerId, currentUser?.id])}
                        items={featuredProducts}
                        category={selectedCategory}
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

                      {searchTerm.trim() && <div role="group" aria-label="Modo de búsqueda" className="mb-4 inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-gray-200 bg-white p-1">
                        {[['related', 'Relacionados'], ['specific', 'Específica']].map(([value, label]) => (
                          <button key={value} type="button" aria-pressed={searchMode === value}
                            onClick={() => setSearchMode(value)}
                            className={`min-h-11 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${searchMode === value ? 'bg-forest-green text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                            {label}
                          </button>
                        ))}
                      </div>}

                      {catalogChanged && <div role="status" className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-forest-green">
                        <span>Hay novedades en las publicaciones.</span>
                        <button type="button" disabled={homeBusy} onClick={() => load()} className="shrink-0 font-bold underline disabled:opacity-50">Actualizar</button>
                      </div>}
                      {sharedArticleError && <p role="status" className="mb-4 rounded-xl border border-green-100 bg-green-50 p-3 text-sm text-forest-green">{sharedArticleError}</p>}
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
  <div key={item.id} className={`home-listing ${item.isFeatured ? 'home-listing--featured' : ''} ${isUserBlocked ? "cursor-not-allowed" : "cursor-pointer"}`}>
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
                      {!homeError && totalPages > 1 && (
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
                  notificationTarget={profileNotificationTarget}
                  user={currentUser}
                  myProducts={myProducts}
                  notifByArticulo={notifByArticulo}
                  notificationBadges={profileBadges}
                  inboxCategoryCounts={inboxCategoryCounts}
                  onInboxNotifications={syncInboxNotifications}
                  onInboxReceiptChange={syncInboxReceipt}
                  inboxRevision={inboxRevision}
                  onArticuloSeen={(articuloId) => {
                    if (articuloId) markSolicitudesSeenForArticulo(articuloId);
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
                  onOpenChat={async ({ article, buyerId, chatId, fromInbox }) => {
                    if(chatId){await openChatByArticleAndBuyer({article,buyerId,expectedChatId:chatId,fromInbox});return;}
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
              </Suspense>
            </main>
            <Footer onHowItWorks={() => {
              setCurrentView("how-it-works");
              window.scrollTo(0, 0);
            }} />

            <DeferredPanel active={isAuthOpen}>
            <AuthModal
              isOpen={isAuthOpen}
              onClose={() => setIsAuthOpen(false)}
              onLogin={() => setIsAuthOpen(false)}
            />
            </DeferredPanel>

            <DeferredPanel active={isPublishOpen}>
            <PublishModal
              isOpen={isPublishOpen}
              onClose={() => setIsPublishOpen(false)}
              onPublish={handleAddProduct}
              currentCity={selectedCity}
              user={currentUser}
              categories={CATEGORY_TREE}
            />
            </DeferredPanel>

            <DeferredPanel active={!!selectedProduct}>
            <ProductDetail
              item={selectedProduct}
              isOpen={!!selectedProduct}
              onClose={() => setSelectedProduct(null)}
              user={currentUser}
              onSolicitar={async (item, message, useCredit = false) => {
                const id = getArticuloId(item);
                if (!id) return alert("Este artículo no tiene id válido.");

                const isVenta = normTipo(item?.mode || item?.tipo) === "venta";

                if (isVenta) {
                  return handleBuy(id, useCredit);
                } else {
                  const applyRes = await handleApply(id, message, useCredit);
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
            </DeferredPanel>

            <DeferredPanel active={isManageOpen}>
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
            </DeferredPanel>

            <DeferredPanel active={isEditOpen}>
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
            </DeferredPanel>

            {/* ✅ CHAT GLOBAL */}
            <DeferredPanel active={!!chatOpen}>
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
              onSeenChange={markChatSeen}
            />
            </DeferredPanel>
          </div>
        }
      />

      {['/terminos','/privacidad','/pagos','/cookies','/datos-personales','/normas'].map(path=><Route key={path} path={path} element={<Terms key={path} path={path}/>} />)}
      </Routes>
      {wompiReturn&&<WompiReturnDialog reference={wompiReturn.reference} transactionId={wompiReturn.transactionId}
        onConfirmed={balance=>notifyCreditBalance(currentUser?.id,balance)} onClose={()=>{
          const url=new URL(window.location.href);for(const key of ['wompi_return','reference','id'])url.searchParams.delete(key);
          window.history.replaceState(null,'',url.pathname+url.search+url.hash);setWompiReturn(null);
        }}/>}
      <LegalConsentDialog key={currentUser?.id||'anonymous'} userId={currentUser?.id} onLogout={handleLogout}/>
    </Suspense>
  );
}
