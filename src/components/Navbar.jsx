// src/components/Navbar.jsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Search, MapPin, User, ChevronDown, LogOut, Bell, X, Plus, Coins } from "lucide-react";
import { ACTIVE_COLOMBIA_DATA } from "../data/locations";
import { supabase } from "../supabase/supabaseClient";
import { NOTIFICATION_HISTORY_LIMIT } from './notificationHistory.js';

const logoMiBatute = "/logo.png";
const MODERATION_REFRESH_MS = 10 * 60 * 1000;
const ENABLE_NAVBAR_MODERATION_REALTIME = false;

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
      className="fixed right-3 top-16 sm:absolute sm:right-0 sm:top-[44px] w-[360px] max-w-[calc(100vw-24px)] bg-white border border-gray-200 shadow-xl rounded-lg overflow-hidden z-[80]"
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
              const fallbackLetter = safeText(n?.letter, "•").slice(0, 1).toUpperCase();

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
                  <div className="shrink-0">
                    {thumb ? (
                      <img
                        src={thumb}
                        alt=""
                        className="w-10 h-10 rounded-2xl object-cover border border-gray-100"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-2xl bg-gray-100 border border-gray-100 flex items-center justify-center font-black text-gray-500">
                        {fallbackLetter}
                      </div>
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
  searchMode = "related",
  onSearchModeChange,
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
  onNotificationsOpen,
  isProfile = false,
}) {
  const displayName = user?.nombre?.trim() || user?.displayName?.trim() || user?.email?.trim() || "";
  const avatarLetter = (displayName?.[0] || "U").toUpperCase();

  const [localSearchValue, setSearchValue] = useState("");
  const searchValue = searchTerm ?? localSearchValue;
  const searchInputRef = useRef(null);
  const [credits, setCredits] = useState({ uid: null, saldo: null });

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    const refresh = async () => {
      const { data, error } = await supabase.from("cupos").select("saldo")
        .eq("usuario_id", user.id).maybeSingle();
      if (active) setCredits({ uid: user.id, saldo: error ? null : Number(data?.saldo ?? 0) });
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    refresh();
    const timer = setInterval(onVisible, 30000);
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user?.id, notifications]);
  const creditBalance = credits.uid === user?.id ? credits.saldo : null;

  const [banUntil, setBanUntil] = useState(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [remainingMs, setRemainingMs] = useState(0);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const isBanned = useMemo(() => {
    if (!banUntil) return false;
    const t = new Date(banUntil).getTime();
    return Number.isFinite(t) && t > Date.now();
  }, [banUntil]);

  const loadModerationState = useCallback(async () => {
    if (!user?.id) {
      setBanUntil(null);
      setIsBlocked(false);
      setRemainingMs(0);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("usuarios")
        .select("ban_until,is_blocked")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        console.log("Error leyendo usuarios(ban_until/is_blocked):", error);
        return;
      }

      const bu = data?.ban_until || null;
      setBanUntil(bu);
      setIsBlocked(!!data?.is_blocked);

      const t = bu ? new Date(bu).getTime() : 0;
      setRemainingMs(Math.max(0, t - Date.now()));
    } catch (e) {
      console.log("Error inesperado leyendo usuarios:", e);
    }
  }, [user?.id]);

  useEffect(() => {
    loadModerationState();
  }, [loadModerationState]);

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

  useEffect(() => {
    if (!ENABLE_NAVBAR_MODERATION_REALTIME) return;
    if (!user?.id) return;

    const channel = supabase
      .channel(`usuarios-moderation-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "usuarios",
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          const next = payload?.new || {};
          const bu = next?.ban_until || null;
          setBanUntil(bu);
          setIsBlocked(!!next?.is_blocked);

          const t = bu ? new Date(bu).getTime() : 0;
          setRemainingMs(Math.max(0, t - Date.now()));
        }
      )
      .subscribe(() => {});

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const id = setInterval(() => {
      loadModerationState();
    }, MODERATION_REFRESH_MS);
    return () => clearInterval(id);
  }, [user?.id, loadModerationState]);

  useEffect(() => {
    if (!user?.id) return;
    const handleVisibility = () => {
      if (document.visibilityState === "visible") loadModerationState();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [user?.id, loadModerationState]);

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
  const subOptions = selectedCatObj?.subs || [];

  const subcategoriesNormalized = useMemo(() => {
    return (subOptions || []).map((s) => (typeof s === "string" ? s : s?.key || s?.label || "")).filter(Boolean);
  }, [subOptions]);

  const msgBtnRef = useRef(null);
  const [openNotifs, setOpenNotifs] = useState(false);

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
    ? "Publicar"
    : isBlocked
    ? "Cuenta bloqueada"
    : isBanned
    ? `Sancionado. Puedes publicar en ${formatRemaining(remainingMs)}`
    : "Publicar";

  return (
    <>
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 flex flex-wrap xl:flex-nowrap items-center justify-between gap-2 sm:gap-4">
          <button
            type="button"
            className="flex shrink-0 items-center gap-2 sm:gap-3 cursor-pointer"
            onClick={handleLogoClick}
            aria-label="Ir al inicio"
            title="Ir al inicio"
          >
            <img
              src={logoMiBatute}
              alt="MiBatute"
              className="h-9 w-9 sm:h-11 sm:w-11 md:h-10 md:w-10 rounded-xl object-contain"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />

            <div className="flex flex-col leading-none">
              <span className="text-[20px] sm:text-[22px] md:text-[28px] font-extrabold text-gray-900">
                Mi<span className="text-forest-green">Batute</span>
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
            <div className="relative w-full">
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
                className="w-full bg-gray-100 border border-gray-200 rounded-lg py-2.5 pl-10 pr-12 focus:ring-2 focus:ring-forest-green outline-none text-sm"
                aria-label="Buscar"
              />

              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                size={18}
              />

              {searchValue?.trim()?.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchValue("");
                    onSearch?.("");
                    requestAnimationFrame(() => searchInputRef.current?.focus());
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-8 w-8 rounded-full bg-white/90 border border-gray-200 text-gray-500 hover:text-gray-800 hover:border-forest-green transition z-10"
                  aria-label="Borrar búsqueda"
                  title="Borrar"
                >
                  <X size={16} />
                </button>
              ) : null}

            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="inline-flex shrink-0 rounded-lg border border-gray-200 p-0.5" role="group" aria-label="Modo de búsqueda">
                {[['related', 'Relacionados'], ['specific', 'Específica']].map(([value, label]) => (
                  <button key={value} type="button" aria-pressed={searchMode === value}
                    onClick={() => onSearchModeChange?.(value)}
                    className={`px-2 py-1 text-[11px] font-semibold rounded-md ${searchMode === value ? 'bg-forest-green text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                    {label}
                  </button>
                ))}
              </div>
              {categoriesNormalized.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
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

              <div
                className="relative flex items-center gap-1 bg-white border border-gray-200 rounded-full px-3 py-1 hover:border-forest-green transition-colors cursor-pointer group"
              >
                <MapPin size={14} className="hidden sm:block text-forest-green" />
                <select
                  value={currentCity}
                  onChange={(e) => onCityChange?.(e.target.value)}
                  className="bg-transparent text-[11px] font-bold text-gray-600 outline-none appearance-none cursor-pointer pr-6"
                  aria-label="Seleccionar ciudad"
                >
                  {ACTIVE_COLOMBIA_DATA.map((c) => (
                    <option key={c.city} value={c.city}>
                      {c.city}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={12}
                  className="absolute right-2 text-gray-400 group-hover:text-forest-green pointer-events-none"
                />
              </div>
            </div>

          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-3">
            <button
              type="button"
              onClick={handlePublish}
              disabled={publishDisabled}
              title={publishTitle}
              aria-label={publishTitle}
              className={`inline-flex items-center justify-center h-9 w-9 sm:h-auto sm:w-auto sm:px-5 sm:py-2 rounded-lg text-sm font-black transition shadow-md ${
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
                : "Publicar"}</span>
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
                    title={creditBalance === null ? "Saldo no disponible" : `${creditBalance} créditos disponibles`}
                    aria-label={creditBalance === null ? "Saldo no disponible" : `${creditBalance} créditos disponibles`}>
                    <Coins size={16} className="shrink-0 text-amber-600" aria-hidden="true" />
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
        <div className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden animate-in zoom-in duration-150">
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
