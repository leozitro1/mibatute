// src/components/Navbar.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, MapPin, User, Recycle, ChevronDown, LogOut, MessageCircle } from "lucide-react";
import { COLOMBIA_DATA } from "../data/locations";

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

function NotificationsDropdown({
  isOpen,
  anchorRef,
  onClose,
  items = [],
  onItemClick,
  emptyText = "No tienes notificaciones",
}) {
  const panelRef = useRef(null);

  // close on outside click
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

  // ✅ opcionales: filtros de categoría/subcategoría
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

  // ✅ (legacy) contadores
  notifProfileCount = 0,
  notifChatCount = 0,
  onMessagesClick,

  // ✅ NUEVO: lista dropdown + handlers
  notifications = [], // [{id,type:'chat'|'postulacion', title, subtitle, created_at, articuloId, buyerId, ...}]
  onNotificationClick, // (item) => abrir chat o postulacion (App.jsx)
  onNotificationSeen, // (item) => marcar como leído/borrado (App.jsx)
}) {
  const displayName = user?.nombre?.trim() || user?.displayName?.trim() || user?.email?.trim() || "";
  const avatarLetter = (displayName?.[0] || "U").toUpperCase();

  const handleLogoClick = () => {
    // ✅ NO recargar por defecto (evita perder estado/Chat/modales)
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

  // dropdown state
  const msgBtnRef = useRef(null);
  const [openNotifs, setOpenNotifs] = useState(false);

  // optimistic hide in dropdown when clicked
  const [hiddenNotifIds, setHiddenNotifIds] = useState(() => new Set());

  useEffect(() => {
    // si el usuario cambia (logout/login), resetea
    setOpenNotifs(false);
    setHiddenNotifIds(new Set());
  }, [user?.id]);

  const visibleNotifs = useMemo(() => {
    const list = Array.isArray(notifications) ? notifications : [];
    if (!hiddenNotifIds.size) return list;
    return list.filter((n) => !hiddenNotifIds.has(String(n?.id || "")));
  }, [notifications, hiddenNotifIds]);

  const dropdownCount = useMemo(() => {
    // si hay lista, usa eso; si no, cae al contador legacy
    if (Array.isArray(notifications) && notifications.length) return visibleNotifs.length;
    return Number(notifChatCount || 0);
  }, [notifications, visibleNotifs.length, notifChatCount]);

  const handleMessagesButton = () => {
    // si tienes lista de notificaciones, mostramos dropdown; si no, usa onMessagesClick como antes
    const hasList = Array.isArray(notifications);
    if (!hasList) {
      onMessagesClick?.();
      return;
    }
    setOpenNotifs((v) => !v);
  };

  const handleNotifClick = async (item) => {
    // 1) cerrar dropdown
    setOpenNotifs(false);

    // 2) ocultar optimista (estilo "se borra")
    const id = String(item?.id || "");
    if (id) {
      setHiddenNotifIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
    }

    // 3) abrir destino
    try {
      await onNotificationClick?.(item);
    } catch {}

    // 4) marcar como vista/leída en backend
    try {
      await onNotificationSeen?.(item);
    } catch {}
  };

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        {/* Logo */}
        <button
          type="button"
          className="flex items-center gap-2 cursor-pointer"
          onClick={handleLogoClick}
          aria-label="Ir al inicio"
          title="Ir al inicio"
        >
          <div className="bg-forest-green p-2 rounded-lg">
            <Recycle className="text-white" size={24} />
          </div>
          <span className="text-xl font-bold text-gray-800 hidden md:block">
            Mi<span className="text-forest-green">Batute</span>
          </span>
        </button>

        {/* Search + Filters */}
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

            {/* City */}
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

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onPublishClick}
            className="bg-forest-green text-white px-5 py-2 rounded-xl text-sm font-black hover:bg-opacity-90 transition shadow-md"
          >
            Publicar
          </button>

          {/* ✅ Mensajes (dropdown estilo FB) */}
          {user ? (
            <div className="relative">
              <button
                ref={msgBtnRef}
                type="button"
                onClick={handleMessagesButton}
                className="relative p-2 rounded-xl bg-gray-100 hover:bg-gray-200 transition"
                title="Mensajes"
                aria-label="Mensajes"
              >
                <MessageCircle size={18} className="text-gray-700" />
                <Badge count={dropdownCount} />
              </button>

              <NotificationsDropdown
                isOpen={openNotifs}
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
              {/* ✅ Perfil SIN globos en el nombre */}
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
                  {/* ❌ removido: <Badge count={notifProfileCount} /> */}
                </div>

                <span className="text-xs font-bold text-gray-700 hidden sm:block max-w-[140px] truncate">
                  {displayName}
                </span>
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onLogout?.();
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
  );
}
