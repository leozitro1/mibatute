// src/components/Navbar.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, MapPin, User, ChevronDown, LogOut, Bell, X, Plus, Coins, LockKeyhole, CheckCheck, Loader2 } from "lucide-react";
import useLocations from "../data/useLocations.js";
import { supabase } from "../supabase/supabaseClient";
import { NOTIFICATION_HISTORY_LIMIT } from './notificationHistory.js';
import { CREDIT_BALANCE_CHANGED } from './creditBalance.js';

const logoMiBatute = "/logo.png";

function Badge({ count = 0 }) {
  const n = Number(count || 0);
  if (!n) return null;

  const label = n > 99 ? "99+" : String(n);

  return (
    <span
      className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-black flex items-center justify-center ring-2 ring-white"
      aria-label={`${label} notificaciones`}
      title={`${label} notificaciones`}
    >
      {label}
    </span>
  );
}

function formatAgo(value) {
  try {
    if (!value) return "";
    const d = new Date(value);
    if (isNaN(d.getTime())) return "";

    const now = Date.now();
    const diff = Math.max(0, now - d.getTime());
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "ahora";
    if (mins < 60) return `${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} h`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days} d`;
    return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
  } catch {
    return "";
  }
}

function safeText(v, fallback = "") {
  const s = String(v ?? "").trim();
  return s || fallback;
}

function formatRemaining(ms) {
  const total = Math.max(0, Number(ms || 0));
  const sec = Math.ceil(total / 1000);

  const days = Math.floor(sec / 86400);
  const hrs = Math.floor((sec % 86400) / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const secs = sec % 60;

  const parts = [];
  if (days) parts.push(`${days} día${days === 1 ? "" : "s"}`);
  if (hrs) parts.push(`${hrs} h`);
  if (mins) parts.push(`${mins} min`);
  if (!days && !hrs && !mins) parts.push(`${secs} s`);

  return parts.join(" ");
}

function NotificationsDropdown({
  isOpen,
  anchorRef,
  onClose,
  items = [],
  onItemClick,
  onMarkAllRead,
  hasUnread,
  marking,
  markError,
  emptyText = "No tienes notificaciones",
}) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    const onDocDown = (e) => {
      const panel = panelRef.current;
      const anchor = anchorRef?.current;
      if (!panel) return;

      const target = e.target;
      const insidePanel = panel.contains(target);
      const insideAnchor = anchor ? anchor.contains(target) : false;

      if (!insidePanel && !insideAnchor) onClose?.();
    };

    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };

    document.addEventListener("mousedown", onDocDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDocDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [isOpen, onClose, anchorRef]);

  if (!isOpen) return null;

  return (
    <div
      ref={panelRef}
      className="marketplace-surface marketplace-notifications fixed right-3 top-16 sm:absolute sm:right-0 sm:top-[44px] w-[360px] max-w-[calc(100vw-24px)] bg-white border border-gray-200 shadow-xl rounded-lg overflow-hidden z-[80]"
      role="menu"
      aria-label="Notificaciones"
    >
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <p className="text-sm font-black text-gray-900">Notificaciones</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar notificaciones"
          title="Cerrar notificaciones"
          className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
        >
          <X size={18} />
        </button>
      </div>

      {onMarkAllRead && <div className="px-4 py-2 border-b border-gray-100">
        <button type="button" onClick={onMarkAllRead} disabled={marking||!hasUnread}
          aria-label="Marcar todas como leídas" title="Marcar todas como leídas"
          className="inline-flex min-h-9 items-center gap-2 text-xs font-semibold text-forest-green disabled:text-gray-400 disabled:cursor-default">
          {marking?<Loader2 size={16} className="animate-spin" aria-hidden="true" />:<CheckCheck size={16} aria-hidden="true" />}
          {marking?'Marcando...':'Marcar todas como leídas'}
        </button>
        {markError&&<p role="alert" className="mt-1 text-xs text-red-700">{markError}</p>}
      </div>}

      <div className="max-h-[60vh] overflow-auto">
        {!items?.length ? (
          <div className="p-6 text-center">
            <p className="text-sm text-gray-500 font-bold">{emptyText}</p>
          </div>
        ) : (
          <div className="py-2">
            {items.map((n) => {
              const title = safeText(n?.title || n?.titulo || n?.text, "Notificación");
              const subtitle = safeText(n?.subtitle || n?.subtitulo || n?.message, "");
              const time = formatAgo(n?.created_at || n?.createdAt || n?.time);

              const thumb = safeText(n?.thumb || n?.image || n?.foto_url, "");

              return (
                <button
                  key={n.id}
                  type="button"
                  role="menuitem"
                  data-notification-id={n.id}
                  data-read={n.read ? 'true' : 'false'}
                  onClick={() => onItemClick?.(n)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-100 transition flex items-start gap-3 ${n.read ? 'bg-white' : 'bg-green-50/60'}`}
                >
                  <div className="notification-thumbnail relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-100 bg-[#f1f5ec]">
                    <img src={logoMiBatute} alt="" aria-hidden="true" className="notification-brand-icon h-7 w-7 object-contain opacity-50 saturate-50" />
                    {thumb && (
                      <img
                        src={thumb}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm text-gray-900 truncate ${n.read ? 'font-semibold' : 'font-bold'}`}>{title}</p>
                      {time ? (
                        <span className="text-[10px] font-black uppercase text-gray-400 whitespace-nowrap">{time}</span>
                      ) : null}
                    </div>

                    {subtitle ? (
                      <p className="mt-1 text-[12px] text-gray-600 font-medium line-clamp-2">{subtitle}</p>
                    ) : null}


                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Navbar({
  onSearch,
  searchTerm,
  currentCity,
  onCityChange,

  categories = [],
  selectedCategory = "",
  onCategoryChange,
  selectedSubcategory = "",
  onSubcategoryChange,

  onPublishClick,
  user,
  onProfileClick,
  onLoginClick,
  onLogout,
  onGoHome,

  notifProfileCount = 0, // eslint-disable-line no-unused-vars
  notifChatCount = 0,
  onMessagesClick,

  notifications = [],
  onNotificationClick,
  onNotificationSeen,
  onMarkAllNotificationsRead,
  onNotificationsOpen,
  isProfile = false,
  realtimeStatus = "CONNECTING",
}) {
  const { ACTIVE_COLOMBIA_DATA } = useLocations();
  useEffect(() => {
    if (ACTIVE_COLOMBIA_DATA.length && !ACTIVE_COLOMBIA_DATA.some(item => item.city === currentCity)) {
      onCityChange(ACTIVE_COLOMBIA_DATA[0].city);
    }
  }, [ACTIVE_COLOMBIA_DATA, currentCity, onCityChange]);
  const displayName = user?.nombre?.trim() || user?.displayName?.trim() || user?.email?.trim() || "";
  const avatarLetter = (displayName?.[0] || "U").toUpperCase();

  const [localSearchValue, setSearchValue] = useState("");
  const searchValue = searchTerm ?? localSearchValue;
  const searchInputRef = useRef(null);
  const [credits, setCredits] = useState({ uid: null, saldo: null });
  const liveStatusRef = useRef(realtimeStatus);
  liveStatusRef.current = realtimeStatus;

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    let pending = false;
    let lastRefresh = 0;
    let version = 0;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      const requestVersion = version;
      try {
        const { data, error } = await supabase.from("cupos").select("saldo")
          .eq("usuario_id", user.id).maybeSingle();
        if (active && requestVersion === version) {
          lastRefresh = Date.now();
          setCredits({ uid: user.id, saldo: error ? null : Number(data?.saldo ?? 0) });
        }
      } finally { pending = false; }
    };
    const onVisible = () => {
      if (liveStatusRef.current !== "SUBSCRIBED" && document.visibilityState === "visible" && Date.now() - lastRefresh >= 60000) refresh();
    };
    const onBalanceChanged = ({ detail }) => {
      if (detail?.uid !== user.id || !Number.isFinite(detail.saldo) || detail.saldo < 0) return;
      version++;
      lastRefresh = Date.now();
      setCredits({ uid: user.id, saldo: detail.saldo });
    };
    refresh();
    window.addEventListener(CREDIT_BALANCE_CHANGED, onBalanceChanged);
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      window.removeEventListener(CREDIT_BALANCE_CHANGED, onBalanceChanged);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user?.id]);
  const creditBalance = credits.uid === user?.id ? credits.saldo : null;

  const [banUntil, setBanUntil] = useState(user?.ban_until || null);
  useEffect(() => { setBanUntil(user?.ban_until || null); }, [user?.id, user?.ban_until]);
  const [isBlocked, setIsBlocked] = useState(false);
  useEffect(()=>{setIsBlocked(!!(user?.is_blocked||user?.bloqueado));},[user?.id,user?.is_blocked,user?.bloqueado]);
  const [remainingMs, setRemainingMs] = useState(0);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const isBanned = useMemo(() => {
    if (!banUntil) return false;
    const t = new Date(banUntil).getTime();
    return Number.isFinite(t) && t > Date.now();
  }, [banUntil]);

  useEffect(() => {
    if (!banUntil) {
      setRemainingMs(0);
      return;
    }

    const tick = () => {
      const t = new Date(banUntil).getTime();
      const ms = Math.max(0, t - Date.now());
      setRemainingMs(ms);
      if (ms <= 0) setBanUntil(null);
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [banUntil]);



  const handleLogoClick = () => {
    if (typeof onGoHome === "function") return onGoHome();
  };

  const categoriesNormalized = Array.isArray(categories)
    ? categories
        .map((c) => {
          if (typeof c === "string") return { key: c, label: c, subs: [] };
          if (c && typeof c === "object") {
            const key = c.key || c.label || "";
            const label = c.label || c.key || "";
            const subs = Array.isArray(c.subs)
              ? c.subs.map((s) => ({
                  key: s.key || s.label || s,
                  label: s.label || s.key || s,
                }))
              : [];
            return { key, label, subs };
          }
          return null;
        })
        .filter(Boolean)
    : [];

  const selectedCatObj = categoriesNormalized.find((c) => String(c.key) === String(selectedCategory)) || null;
  const subcategoriesNormalized = useMemo(() => {
    return (selectedCatObj?.subs || []).map((s) => (typeof s === "string" ? s : s?.key || s?.label || "")).filter(Boolean);
  }, [selectedCatObj]);

  const msgBtnRef = useRef(null);
  const [openNotifs, setOpenNotifs] = useState(false);
  const [markingNotifications,setMarkingNotifications]=useState(false);
  const [notificationMarkError,setNotificationMarkError]=useState('');
  const markingRef=useRef(false);
  const markAllNotifications=async()=>{
    if(markingRef.current)return;markingRef.current=true;setMarkingNotifications(true);setNotificationMarkError('');
    try{await onMarkAllNotificationsRead?.();}
    catch{setNotificationMarkError('No se pudieron marcar. Inténtalo de nuevo.');}
    finally{markingRef.current=false;setMarkingNotifications(false);}
  };

  useEffect(() => {
    setOpenNotifs(false);
  }, [user?.id]);

  // Read state is independent of whether an item remains in the recent history.
  const visibleNotifs = useMemo(() => {
    const list = Array.isArray(notifications) ? notifications : [];
    return [...list]
      .sort((a, b) => new Date(b?.created_at || 0) - new Date(a?.created_at || 0))
      .slice(0, NOTIFICATION_HISTORY_LIMIT);
  }, [notifications]);

  const dropdownCount = useMemo(() => {
    if (Array.isArray(notifications)) {
      return visibleNotifs.filter(n => !n.read).length;
    }
    return Number(notifChatCount || 0);
  }, [notifications, visibleNotifs, notifChatCount]);

  const handleMessagesButton = () => {
    if (user && isBlocked) {
      alert("🚫 Tu cuenta está BLOQUEADA.\n\nNo puedes usar chats.");
      return;
    }

    const hasList = Array.isArray(notifications);
    if (!hasList) {
      onMessagesClick?.();
      return;
    }
    setOpenNotifs((v) => !v);
    if (!openNotifs) {
      onNotificationsOpen?.();
    }
  };

  const handleNotifClick = async (item) => {
    setOpenNotifs(false);

    try {
      await onNotificationSeen?.(item);
    } catch {}
    try {
      await onNotificationClick?.(item);
    } catch {}
  };

  const handlePublish = () => {
    if (!user) {
      onLoginClick?.();
      return;
    }

    if (isBlocked) {
      alert("🚫 Tu cuenta está BLOQUEADA.\n\nNo puedes publicar ni usar chats.");
      return;
    }

    if (isBanned) {
      alert(`🚫 Estás sancionado.\n\nPuedes publicar en: ${formatRemaining(remainingMs)}`);
      return;
    }

    onPublishClick?.();
  };

  const publishDisabled = !!user && (isBlocked || isBanned);
  const publishTitle = !user
    ? "Publica gratis"
    : isBlocked
    ? "Cuenta bloqueada"
    : isBanned
    ? `Sancionado. Puedes publicar en ${formatRemaining(remainingMs)}`
    : "Publica gratis";

  return (
    <>
      {user && !['CONNECTING', 'SUBSCRIBED'].includes(realtimeStatus) && <p role="status" className="bg-amber-50 px-4 py-2 text-center text-xs text-amber-800">
        {realtimeStatus === 'RECOVERING' ? 'Actualizando tus avisos…' : 'Reconectando tus notificaciones…'}
      </p>}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 flex flex-wrap xl:flex-nowrap items-center justify-between gap-2 sm:gap-4">
          <button
            type="button"
            className="flex shrink-0 items-center gap-2 sm:gap-3 cursor-pointer"
            onClick={handleLogoClick}
            aria-label="MiBatute BETA, ir al inicio"
            title="Ir al inicio"
          >
            <img
              src={logoMiBatute}
              alt="MiBatute"
              className="hidden md:block h-10 w-10 rounded-xl object-contain"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />

            <div className="flex flex-col leading-none">
              <span className="flex items-center gap-2">
                <span className="text-[20px] sm:text-[22px] md:text-[28px] font-extrabold text-gray-900">
                  Mi<span className="text-forest-green">Batute</span>
                </span>
                <span className="rounded border border-[#dce5d5] bg-[#f0f4eb] px-1.5 py-1 text-[9px] font-semibold leading-none tracking-wider text-[#526747]" title="Versión en desarrollo">BETA</span>
              </span>
              <span className="text-[12px] md:text-[13px] font-semibold text-gray-500 mt-1">
                mi basura, tu tesoro
              </span>

              {user && isBlocked ? (
                <span className="mt-1 text-[11px] font-black text-red-700">Cuenta BLOQUEADA</span>
              ) : null}
              {user && !isBlocked && isBanned ? (
                <span className="mt-1 text-[11px] font-black text-orange-700">
                  Sanción: {formatRemaining(remainingMs)}
                </span>
              ) : null}
            </div>
          </button>

          <div className={`order-3 basis-full xl:order-none xl:basis-auto flex-1 min-w-0 relative${isProfile ? " opacity-40 pointer-events-none select-none" : ""}`}>
            <div className="navbar-search-field flex min-w-0 items-center rounded-xl border border-gray-200 bg-gray-100 focus-within:ring-2 focus-within:ring-forest-green">
              <div className="relative min-w-0 flex-1">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchValue}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSearchValue(v);
                    onSearch?.(v);
                  }}
                  placeholder="Busca artículos, materiales, repuestos..."
                  className="navbar-search-input w-full min-w-0 bg-transparent py-3 pl-10 pr-11 outline-none text-sm"
                  aria-label="Buscar"
                />
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} aria-hidden="true" />
                {searchValue?.trim()?.length > 0 ? (
                  <button type="button"
                    onClick={() => {
                      setSearchValue("");
                      onSearch?.("");
                      requestAnimationFrame(() => searchInputRef.current?.focus());
                    }}
                    className="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-11 w-11 rounded-lg text-gray-500 hover:text-forest-green transition"
                    aria-label="Borrar búsqueda" title="Borrar búsqueda">
                    <X size={16} />
                  </button>
                ) : null}
              </div>
              <div className="navbar-search-city relative flex min-h-11 shrink-0 items-center gap-1.5 border-l border-gray-200 pl-2 pr-2 sm:pl-3">
                <MapPin size={15} className="shrink-0 text-forest-green" aria-hidden="true" />
                <select value={currentCity} onChange={(e) => onCityChange?.(e.target.value)}
                  className="min-h-11 min-w-0 max-w-28 bg-transparent pr-4 text-xs font-medium text-gray-700 outline-none appearance-none cursor-pointer focus-visible:outline-2 focus-visible:outline-forest-green"
                  aria-label="Seleccionar ciudad">
                  {ACTIVE_COLOMBIA_DATA.map((c) => <option key={c.city} value={c.city}>{c.city}</option>)}
                </select>
                <ChevronDown size={12} className="pointer-events-none absolute right-2 text-gray-500" aria-hidden="true" />
              </div>
            </div>
            {categoriesNormalized.length > 0 ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <div className="relative flex items-center gap-1 bg-white border border-gray-200 rounded-full px-3 py-1 shadow-sm hover:border-forest-green transition-colors cursor-pointer group">
                    <span className="text-[10px] font-black uppercase text-gray-400">Cat</span>
                    <select
                      value={selectedCategory || ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        onCategoryChange?.(v);
                      }}
                      className="bg-transparent text-[11px] font-bold text-gray-600 outline-none appearance-none cursor-pointer pr-6"
                      aria-label="Filtrar por categoría"
                    >
                      <option value="Todo">Todas</option>
                      {categoriesNormalized.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={12}
                      className="absolute right-2 text-gray-400 group-hover:text-forest-green pointer-events-none"
                    />
                  </div>

                  {subcategoriesNormalized.length > 0 ? (
                    <div className="relative flex items-center gap-1 bg-white border border-gray-200 rounded-full px-3 py-1 shadow-sm hover:border-forest-green transition-colors cursor-pointer group">
                      <span className="text-[10px] font-black uppercase text-gray-400">Sub</span>
                      <select
                        value={selectedSubcategory || ""}
                        onChange={(e) => onSubcategoryChange?.(e.target.value)}
                        className="bg-transparent text-[11px] font-bold text-gray-600 outline-none appearance-none cursor-pointer pr-6"
                        aria-label="Filtrar por subcategoría"
                      >
                        <option value="">Todas</option>
                        {subcategoriesNormalized.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        size={12}
                        className="absolute right-2 text-gray-400 group-hover:text-forest-green pointer-events-none"
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-3">
            <button
              type="button"
              onClick={handlePublish}
              disabled={publishDisabled}
              title={publishTitle}
              aria-label={publishTitle}
              className={`inline-flex items-center justify-center h-9 w-9 sm:h-auto sm:w-auto sm:px-5 sm:py-2 rounded-lg text-xs sm:text-sm font-black transition shadow-md ${
                publishDisabled
                  ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                  : "bg-forest-green text-white hover:bg-opacity-90"
              }`}
            >
              <Plus size={19} className="sm:hidden" aria-hidden="true" />
              <span className="hidden sm:inline">{user && isBlocked
                ? "Publicar (bloqueado)"
                : user && isBanned
                ? `Publicar (${formatRemaining(remainingMs)})`
                : "Publica gratis"}</span>
            </button>

            {user ? (
              <div className="relative">
                <button
                  ref={msgBtnRef}
                  type="button"
                  onClick={handleMessagesButton}
                  disabled={isBlocked}
                  className={`relative p-2 rounded-xl transition ${
                    isBlocked ? "bg-gray-200 cursor-not-allowed" : "bg-gray-100 hover:bg-gray-200"
                  }`}
                  title={isBlocked ? "Cuenta bloqueada" : "Notificaciones"}
                  aria-label="Notificaciones"
                  aria-expanded={openNotifs}
                  aria-haspopup="menu"
                >
                  <Bell size={18} className={isBlocked ? "text-gray-400" : "text-gray-700"} />
                  {!isBlocked ? <Badge count={dropdownCount} /> : null}
                </button>

                <NotificationsDropdown
                  isOpen={openNotifs && !isBlocked}
                  anchorRef={msgBtnRef}
                  onClose={() => setOpenNotifs(false)}
                  items={visibleNotifs}
                  onItemClick={handleNotifClick}
                  onMarkAllRead={onMarkAllNotificationsRead?markAllNotifications:undefined}
                  hasUnread={notifications.some(item=>!item.read&&item.unreadCount>0)}
                  marking={markingNotifications}
                  markError={notificationMarkError}
                  emptyText="No tienes notificaciones"
                />
              </div>
            ) : null}

            {user ? (
              <div className="flex items-center gap-1 sm:gap-2">
                <button
                  type="button"
                  onClick={onProfileClick}
                  className="relative flex items-center gap-2 cursor-pointer bg-gray-50 p-1 rounded-full sm:pr-3 border border-gray-100 hover:border-forest-green transition"
                  title="Ver perfil"
                  aria-label="Ver perfil"
                >
                  <div className="relative w-8 h-8">
                    <div className="w-8 h-8 bg-forest-green text-white rounded-full flex items-center justify-center font-black text-xs">
                      {avatarLetter}
                    </div>
                  </div>

                  <span className="text-xs font-bold text-gray-700 hidden sm:block max-w-[140px] truncate">
                    {displayName}
                  </span>
                  <span className="inline-flex items-center gap-1 pr-1 text-xs font-bold tabular-nums text-gray-700"
                    title={isBlocked ? `${creditBalance ?? '...'} créditos bloqueados` : creditBalance === null ? "Saldo no disponible" : `${creditBalance} créditos disponibles`}
                    aria-label={isBlocked ? `${creditBalance ?? '...'} créditos bloqueados` : creditBalance === null ? "Saldo no disponible" : `${creditBalance} créditos disponibles`}>
                    {isBlocked ? <LockKeyhole size={16} className="shrink-0 text-gray-400" aria-hidden="true" /> : <Coins size={16} className="shrink-0 text-amber-600" aria-hidden="true" />}
                    {creditBalance === null ? '...' : creditBalance.toLocaleString('es-CO')}
                  </span>
                </button>

            <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowLogoutConfirm(true);
                  }}
                  className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 transition"
                  title="Salir"
                  aria-label="Salir"
                >
                  <LogOut size={16} className="text-gray-600" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1 sm:gap-2">
            {/* ✅ TyC siempre visible (abre en nueva pestaña) */}


                <button
                  type="button"
                  onClick={onLoginClick}
                  className="p-2 rounded-xl hover:bg-gray-100 transition"
                  aria-label="Ingresar"
                  title="Ingresar"
                >
                  <User className="text-gray-400 hover:text-forest-green transition" />
                </button>
                 <a
              href="/terminos"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 transition inline-flex items-center justify-center"
              title="Términos y condiciones"
              aria-label="Términos y condiciones"
            >
              <span className="text-[11px] font-black text-gray-400 leading-none">TC</span>
            </a>
              </div>
            )}
          </div>
        </div>
      </nav>

      {showLogoutConfirm && (
        <div className="marketplace-overlay fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div role="dialog" aria-modal="true" aria-label="Confirmar salida" className="marketplace-surface marketplace-modal w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden animate-in zoom-in duration-150">
            <div className="p-5 border-b">
              <div className="font-black text-gray-800 uppercase tracking-widest text-sm">Confirmar salida</div>
              <div className="text-sm text-gray-600 mt-1">¿Seguro que quieres salir?</div>
            </div>

            <div className="p-5 flex gap-3">
              <button
                type="button"
                className="flex-1 py-3 rounded-2xl font-black uppercase tracking-widest border-2 border-gray-200 text-gray-700 hover:bg-gray-50 transition"
                onClick={() => setShowLogoutConfirm(false)}
              >
                Cancelar
              </button>

              <button
                type="button"
                className="flex-1 py-3 rounded-2xl font-black uppercase tracking-widest bg-forest-green text-white hover:opacity-90 transition"
                onClick={() => {
                  setShowLogoutConfirm(false);
                  onLogout?.();
                }}
              >
                Salir
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
