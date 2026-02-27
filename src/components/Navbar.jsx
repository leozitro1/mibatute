// src/components/Navbar.jsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Search, MapPin, User, ChevronDown, LogOut, MessageCircle } from "lucide-react";
import { COLOMBIA_DATA } from "../data/locations";
import { supabase } from "../supabase/supabaseClient";

const logoMiBatute = "/mi%20batute%20logo.svg";

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
      className="absolute right-0 top-[44px] w-[360px] max-w-[90vw] bg-white border border-gray-100 shadow-xl rounded-3xl overflow-hidden z-[80]"
      role="menu"
      aria-label="Notificaciones"
    >
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <p className="text-sm font-black text-gray-900">Notificaciones</p>
        <button
          type="button"
          onClick={onClose}
          className="text-[11px] font-black uppercase text-gray-400 hover:text-gray-600"
        >
          Cerrar
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

              const type = safeText(n?.type, "");
              const isChat = type === "chat";
              const pillText = isChat ? "Mensaje" : type === "postulacion" ? "Solicitud" : type ? type : "Info";

              const thumb = safeText(n?.thumb || n?.image || n?.foto_url, "");
              const fallbackLetter = safeText(n?.letter, "•").slice(0, 1).toUpperCase();

              return (
                <button
                  key={safeText(n?.id, Math.random().toString(36))}
                  type="button"
                  role="menuitem"
                  onClick={() => onItemClick?.(n)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 transition flex items-start gap-3"
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
                      <p className="text-sm font-black text-gray-900 truncate">{title}</p>
                      {time ? (
                        <span className="text-[10px] font-black uppercase text-gray-400 whitespace-nowrap">{time}</span>
                      ) : null}
                    </div>

                    {subtitle ? (
                      <p className="mt-1 text-[12px] text-gray-600 font-medium line-clamp-2">{subtitle}</p>
                    ) : null}

                    <div className="mt-2">
                      <span className="inline-flex items-center px-2 py-1 rounded-full bg-forest-green/10 text-forest-green text-[10px] font-black uppercase">
                        {pillText}
                      </span>
                    </div>
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
}) {
  const displayName = user?.nombre?.trim() || user?.displayName?.trim() || user?.email?.trim() || "";
  const avatarLetter = (displayName?.[0] || "U").toUpperCase();

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

  // 1) carga inicial
  useEffect(() => {
    loadModerationState();
  }, [loadModerationState]);

  // 2) contador en vivo
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

  // 3) ✅ Realtime: se actualiza INMEDIATO cuando el admin cambia usuarios
  useEffect(() => {
    if (!user?.id) return;

    // Creamos un canal único por usuario para evitar duplicados
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
      .subscribe((status) => {
        // Si no está habilitado realtime/replication, esto no va a “live”, por eso dejamos polling abajo.
        // status puede ser 'SUBSCRIBED', 'CHANNEL_ERROR', etc.
        // console.log("Realtime usuarios status:", status);
      });

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  }, [user?.id]);

  // 4) ✅ Polling backup (por si Realtime no está habilitado): cada 5s
  useEffect(() => {
    if (!user?.id) return;
    const id = setInterval(() => {
      loadModerationState();
    }, 5000);
    return () => clearInterval(id);
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

  const msgBtnRef = useRef(null);
  const [openNotifs, setOpenNotifs] = useState(false);
  const [hiddenNotifIds, setHiddenNotifIds] = useState(() => new Set());

  useEffect(() => {
    setOpenNotifs(false);
    setHiddenNotifIds(new Set());
  }, [user?.id]);

  const visibleNotifs = useMemo(() => {
    const list = Array.isArray(notifications) ? notifications : [];
    if (!hiddenNotifIds.size) return list;
    return list.filter((n) => !hiddenNotifIds.has(String(n?.id || "")));
  }, [notifications, hiddenNotifIds]);

  const dropdownCount = useMemo(() => {
    if (Array.isArray(notifications) && notifications.length) return visibleNotifs.length;
    return Number(notifChatCount || 0);
  }, [notifications, visibleNotifs.length, notifChatCount]);

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
  };

  const handleNotifClick = async (item) => {
    setOpenNotifs(false);

    const id = String(item?.id || "");
    if (id) {
      setHiddenNotifIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
    }

    try {
      await onNotificationClick?.(item);
    } catch {}
    try {
      await onNotificationSeen?.(item);
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
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <button
          type="button"
          className="flex items-center gap-3 cursor-pointer"
          onClick={handleLogoClick}
          aria-label="Ir al inicio"
          title="Ir al inicio"
        >
          <img
            src={logoMiBatute}
            alt="MiBatute"
            className="h-14 w-14 md:h-16 md:w-16 rounded-xl object-contain"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />

          <div className="flex flex-col leading-none">
            <span className="text-[22px] md:text-[28px] font-extrabold tracking-tight text-gray-900">
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

        <div className="flex-1 max-w-3xl relative flex items-center">
          <div className="relative w-full">
            <input
              type="text"
              onChange={(e) => onSearch?.(e.target.value)}
              placeholder="Busca artículos, materiales, repuestos..."
              className="w-full bg-gray-100 border-none rounded-full py-2.5 px-10 focus:ring-2 focus:ring-forest-green outline-none text-sm"
              aria-label="Buscar"
            />
            <Search className="absolute left-3 top-3 text-gray-400" size={18} />

            {categoriesNormalized.length > 0 ? (
              <div className="hidden lg:flex absolute right-[150px] top-1.5 items-center gap-2">
                <div className="relative flex items-center gap-1 bg-white border border-gray-200 rounded-full px-3 py-1 shadow-sm hover:border-forest-green transition-colors cursor-pointer group">
                  <span className="text-[10px] font-black uppercase text-gray-400">Cat</span>
                  <select
                    value={selectedCategory || ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      onCategoryChange?.(v);
                      if (onSubcategoryChange) onSubcategoryChange("");
                    }}
                    className="bg-transparent text-[11px] font-bold text-gray-600 outline-none appearance-none cursor-pointer pr-6"
                    aria-label="Seleccionar categoría"
                    title="Categoría"
                  >
                    <option value="">Todas</option>
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

                <div
                  className={`relative flex items-center gap-1 bg-white border rounded-full px-3 py-1 shadow-sm transition-colors ${
                    selectedCategory && subOptions.length
                      ? "border-gray-200 hover:border-forest-green cursor-pointer group"
                      : "border-gray-100 opacity-60"
                  }`}
                  title={selectedCategory ? "Subcategoría" : "Elige una categoría"}
                >
                  <span className="text-[10px] font-black uppercase text-gray-400">Sub</span>
                  <select
                    value={selectedSubcategory || ""}
                    onChange={(e) => onSubcategoryChange?.(e.target.value)}
                    className="bg-transparent text-[11px] font-bold text-gray-600 outline-none appearance-none cursor-pointer pr-6 disabled:cursor-not-allowed"
                    aria-label="Seleccionar subcategoría"
                    disabled={!selectedCategory || subOptions.length === 0}
                  >
                    <option value="">Todas</option>
                    {subOptions.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>

                  <ChevronDown
                    size={12}
                    className={`absolute right-2 pointer-events-none ${
                      selectedCategory && subOptions.length
                        ? "text-gray-400 group-hover:text-forest-green"
                        : "text-gray-300"
                    }`}
                  />
                </div>
              </div>
            ) : null}

            <div className="absolute right-3 top-1.5 flex items-center gap-1 bg-white border border-gray-200 rounded-full px-3 py-1 shadow-sm hover:border-forest-green transition-colors cursor-pointer group">
              <MapPin size={14} className="text-forest-green" />
              <select
                value={currentCity}
                onChange={(e) => onCityChange?.(e.target.value)}
                className="bg-transparent text-[11px] font-bold text-gray-600 outline-none appearance-none cursor-pointer pr-6"
                aria-label="Seleccionar ciudad"
              >
                {COLOMBIA_DATA.map((c) => (
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

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handlePublish}
            disabled={publishDisabled}
            title={publishTitle}
            className={`px-5 py-2 rounded-xl text-sm font-black transition shadow-md ${
              publishDisabled
                ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                : "bg-forest-green text-white hover:bg-opacity-90"
            }`}
          >
            {user && isBlocked
              ? "Publicar (bloqueado)"
              : user && isBanned
              ? `Publicar (${formatRemaining(remainingMs)})`
              : "Publicar"}
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
                title={isBlocked ? "Bloqueado: no puedes usar chats" : "Mensajes"}
                aria-label="Mensajes"
              >
                <MessageCircle size={18} className={isBlocked ? "text-gray-400" : "text-gray-700"} />
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
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onProfileClick}
                className="relative flex items-center gap-2 cursor-pointer bg-gray-50 p-1 rounded-full pr-3 border border-gray-100 hover:border-forest-green transition"
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
            <button
              type="button"
              onClick={onLoginClick}
              className="p-2 rounded-xl hover:bg-gray-100 transition"
              aria-label="Ingresar"
              title="Ingresar"
            >
              <User className="text-gray-400 hover:text-forest-green transition" />
            </button>
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
