// src/components/ProductCard.jsx
import { MapPin, Lock, Users } from "lucide-react";

const FALLBACK_SVG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="600" height="400">
    <rect width="100%" height="100%" fill="#f3f4f6"/>
    <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
      fill="#6b7280" font-family="Arial" font-size="24">
      Imagen no disponible
    </text>
  </svg>
`);

function normMode(mode) {
  const s = String(mode || "").trim().toLowerCase();
  if (s.includes("venta")) return "venta";
  if (s.includes("don")) return "donacion";
  if (s.includes("regal")) return "donacion"; // ✅ unificado
  return s || "donacion";
}

function modeLabel(modeNorm) {
  if (modeNorm === "venta") return "Venta";
  return "Donación / Regalo";
}

function normStatus(status) {
  const s = String(status || "").trim().toLowerCase();
  if (s === "available") return "disponible";
  if (s === "reserved") return "reservado";
  if (s === "delivered") return "entregado";
  return s || "disponible";
}


// ===================== Estado del producto (1–10) =====================
function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  const v = Math.round(x);
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

function conditionMeta(score10) {
  const s = clampInt(score10, 1, 10);
  if (s === null) return null;

  // Rangos: 1–3 rojo, 4–6 amarillo, 7–8 verde, 9–10 verde fuerte
  if (s <= 3) return { score: s, label: "Muy deteriorado", cls: "bg-red-100 text-red-800 border border-red-200" };
  if (s <= 6) return { score: s, label: "Uso medio", cls: "bg-yellow-100 text-yellow-900 border border-yellow-200" };
  if (s <= 8) return { score: s, label: "Buen estado", cls: "bg-green-100 text-green-800 border border-green-200" };
  return { score: s, label: "Casi nuevo", cls: "bg-emerald-100 text-emerald-800 border border-emerald-200" };
}


function pickImageSrc(image) {
  if (typeof image === "string" && image.trim() !== "") return image.trim();

  if (Array.isArray(image) && image.length) {
    const first = image[0];

    if (typeof first === "string" && first.trim() !== "") return first.trim();

    if (first && typeof first === "object" && typeof first.url === "string" && first.url.trim() !== "")
      return first.url.trim();
  }

  return FALLBACK_SVG;
}

function formatPrice(modeNorm, price) {
  if (modeNorm !== "venta") return "GRATIS";
  const n = Number(price || 0);
  try {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(isNaN(n) ? 0 : n);
  } catch {
    return `$${isNaN(n) ? 0 : n}`;
  }
}

function toIntSafe(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/**
 * ✅ FIX: count robusto
 * Acepta:
 * - number / string ("3")
 * - array (length)
 * - object {count} | {current} | {total}
 */
function toCountRobust(v) {
  if (v == null) return 0;

  if (typeof v === "number") return toIntSafe(v);
  if (typeof v === "string") return toIntSafe(parseInt(v, 10));

  if (Array.isArray(v)) return toIntSafe(v.length);

  if (typeof v === "object") {
    if (Object.prototype.hasOwnProperty.call(v, "count")) return toIntSafe(v.count);
    if (Object.prototype.hasOwnProperty.call(v, "current")) return toIntSafe(v.current);
    if (Object.prototype.hasOwnProperty.call(v, "total")) return toIntSafe(v.total);
    if (Object.prototype.hasOwnProperty.call(v, "value")) return toIntSafe(v.value);
  }

  return 0;
}

export default function ProductCard({
  title,
  location,
  category,
  mode,
  price,
  // ✅ NUEVO: estado del producto (1–10)
  conditionScore,
  condition,
  estadoProducto,

  image, // string | string[] | [{url}]
  isFeatured,
  status = "disponible",

  // ✅ nuevos (para mostrar interesados)
  interestedCount = 0,
  interestedMax = 10,
  interestedRemaining,

  // ✅ NUEVO: interacción (lista abre detalle/chat)
  onClick, // function
  isUserBlocked = false, // si true: no deja abrir ni detalle/chat
  onBlockedClick, // opcional: callback para mostrar toast/modal
}) {
  const modeNorm = normMode(mode);

  const modeStyles = {
    donacion: "bg-blue-100 text-blue-700",
    venta: "bg-gray-800 text-white",
  };

  const statusNorm = normStatus(status);

  const isReserved = statusNorm === "reservado";
  const isDelivered = statusNorm === "entregado";
  const isLocked = isReserved || isDelivered;

  // ✅ bloqueo total del card (por sanción “bloqueado”)
  const isDisabled = isLocked || !!isUserBlocked;

  const imageSrc = pickImageSrc(image);

  // ✅ estado del producto (1–10) para badge en card
  const conditionInfo = conditionMeta(
    conditionScore ?? condition ?? estadoProducto
  );
  const showCondition = !!conditionInfo;

  const formattedPrice = formatPrice(modeNorm, price);

  const lockLabel = isDelivered ? "Entregado" : isReserved ? "Reservado" : "";

  // ✅ interesados (solo donación/regalo) — robusto
  const count = toCountRobust(interestedCount);
  const max = Math.max(1, toCountRobust(interestedMax) || 10);

  const remaining =
    typeof interestedRemaining === "number"
      ? Math.max(0, Math.floor(interestedRemaining))
      : Math.max(0, max - count);

  const showInterested = modeNorm === "donacion";
  const isFull = showInterested && count >= max;

  const interestedTooltip = isFull
    ? `Este artículo ya llegó al máximo de ${max} solicitudes.`
    : `${count} interesados • ${remaining} cupos disponibles`;

  // ✅ etiqueta compacta para el badge (clara)
  const badgeText = `${count} ${count === 1 ? "solicitud" : "solicitudes"}`;

  const blockedMsg =
    "🚫 Tu cuenta está BLOQUEADA. No puedes abrir artículos ni acceder a chats por el momento.";

  const handleBlocked = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (typeof onBlockedClick === "function") return onBlockedClick();
    alert(blockedMsg);
  };

  const handleCardClick = (e) => {
    if (!onClick) return;
    if (isUserBlocked) return handleBlocked(e);
    if (isLocked) return; // reservado/entregado: no abre
    onClick();
  };

  const handleWantClick = (e) => {
    // el botón también abre (si lo usas así)
    if (isUserBlocked) return handleBlocked(e);
    if (isLocked) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // ✅ si el card tiene onClick, reutilizamos
    if (onClick) {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    }
  };

  return (
    <div
      onClick={handleCardClick}
      className={`relative flex h-[376px] flex-col bg-white rounded-lg overflow-hidden border-2 ${
        isFeatured ? "border-treasure-gold border-2 shadow-md" : "border-gray-200 shadow-sm"
      } hover:shadow-lg transition ${isDisabled ? "cursor-not-allowed" : "cursor-pointer"}`}
      aria-disabled={isDisabled}
      title={isUserBlocked ? "Cuenta bloqueada" : isLocked ? "No disponible" : ""}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (!onClick) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleCardClick(e);
        }
      }}
    >
      <div className="relative h-48 shrink-0">
        <img
          src={imageSrc}
          alt={title || "Artículo"}
          className={`w-full h-full object-cover ${isDisabled ? "opacity-90" : ""}`}
          loading="lazy"
          onError={(e) => {
            if (e.currentTarget.dataset.fallbackApplied) return;
            e.currentTarget.dataset.fallbackApplied = "1";
            e.currentTarget.src = FALLBACK_SVG;
          }}
        />

        <span
          className={`absolute top-2 left-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
            modeStyles[modeNorm] || "bg-gray-100 text-gray-700"
          }`}
        >
          {modeLabel(modeNorm)}
        </span>

        {isFeatured && (
          <span className="absolute top-2 right-2 bg-treasure-gold text-black px-2 py-1 rounded text-[10px] font-bold uppercase">
            Destacado
          </span>
        )}


        {/* ✅ Estado del producto (1–10) */}
        {showCondition && (
          <div
            className={`absolute ${isFeatured ? "top-10" : "top-2"} right-2 z-20`}
            title={`Estado ${conditionInfo.score}/10 · ${conditionInfo.label}`}
            aria-label={`Estado ${conditionInfo.score} de 10, ${conditionInfo.label}`}
          >
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shadow ${conditionInfo.cls}`}>
              <span aria-hidden>★</span>
              {conditionInfo.score}/10
            </span>
          </div>
        )}

{/* ✅ Badge “interesados” (solo donación/regalo) */}
        {showInterested && (
          <div className="absolute bottom-2 right-2 z-20" title={interestedTooltip} aria-label={interestedTooltip}>
            <span
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/95 px-2 py-1 text-[11px] font-bold text-gray-800 shadow-sm"
            >
              <Users size={14} aria-hidden="true" />
              {badgeText}
            </span>
          </div>
        )}

        {/* ✅ overlay por reservado/entregado */}
        {isLocked && (
          <div className="absolute inset-0 bg-white/65 backdrop-blur-[2px] flex items-center justify-center z-10">
            <span className="bg-gray-900 text-white px-4 py-2 rounded-full font-black text-xs uppercase shadow-lg flex items-center gap-2">
              <Lock size={14} />
              {lockLabel}
            </span>
          </div>
        )}

        {/* ✅ overlay por bloqueado */}
        {isUserBlocked && (
          <div className="absolute inset-0 bg-white/70 backdrop-blur-[2px] flex items-center justify-center z-10">
            <span className="bg-red-600 text-white px-4 py-2 rounded-full font-black text-xs uppercase shadow-lg flex items-center gap-2">
              <Lock size={14} />
              Bloqueado
            </span>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-4">
        <h3 className="font-bold text-gray-800 truncate">{title || "Sin título"}</h3>
        <p className="mt-1 h-4 truncate text-[11px] text-gray-400" title={category || undefined}>
          {category || ''}
        </p>

        <p className="flex min-w-0 items-center text-xs text-gray-500 mt-1">
          <MapPin size={12} className="mr-1 shrink-0" /> <span className="truncate">{location || "Ubicación"}</span>
        </p>

        {/* ✅ texto auxiliar debajo (solo donación) */}
        <p className="mt-2 h-4 truncate text-[10px] font-bold uppercase text-gray-500">
          {showInterested ? (isFull ? "Cupo lleno" : `${count} interesados • ${remaining} cupos`) : ''}
        </p>

        <div className="mt-auto flex items-center justify-between gap-2">
          <span className="text-lg font-black text-forest-green">{formattedPrice}</span>

          <button
            type="button"
            disabled={isDisabled}
            onClick={handleWantClick}
            className={`px-3 py-1 rounded-md text-xs font-bold transition ${
              isDisabled
                ? "bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed"
                : "text-forest-green border border-forest-green hover:bg-forest-green hover:text-white"
            }`}
            title={
              isUserBlocked
                ? "Cuenta bloqueada"
                : isDelivered
                ? "Este artículo ya fue entregado"
                : isReserved
                ? "Este artículo está reservado"
                : "Lo quiero"
            }
          >
            {isUserBlocked ? "Bloqueado" : isDelivered ? "Finalizado" : isReserved ? "En proceso" : "Lo quiero"}
          </button>
        </div>

        {(isReserved || isDelivered) && (
          <p className="mt-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Estado: {statusNorm}</p>
        )}
      </div>
    </div>
  );
}
