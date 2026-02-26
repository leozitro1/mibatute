// src/components/ProductDetail.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { X, MapPin, ShieldCheck, Lock, Flag } from "lucide-react";
import { supabase } from "../supabase/supabaseClient";

const FALLBACK_IMAGE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
  <svg xmlns='http://www.w3.org/2000/svg' width='800' height='600'>
    <rect width='100%' height='100%' fill='#f3f4f6'/>
    <text x='50%' y='50%' text-anchor='middle' fill='#9ca3af' font-size='28' font-family='Arial' font-weight='700'>
      Sin imagen
    </text>
  </svg>
`);

// ✅ NUEVO: Formatear nombre público (Primer nombre + inicial del apellido)
function formatPublicName(fullName) {
  if (!fullName) return "Usuario";
  const parts = String(fullName).trim().split(/\s+/);
  const firstName = parts[0] || "Usuario";
  if (parts.length === 1) return firstName;
  const lastInitial = (parts[1] || "").slice(0, 1).toUpperCase();
  return lastInitial ? `${firstName} ${lastInitial}.` : firstName;
}

function buildImages(item) {
  const out = [];

  if (typeof item?.imagen_url_principal === "string" && item.imagen_url_principal.trim())
    out.push(item.imagen_url_principal.trim());
  if (typeof item?.image_url === "string" && item.image_url.trim()) out.push(item.image_url.trim());
  if (typeof item?.imagen_url === "string" && item.imagen_url.trim()) out.push(item.imagen_url.trim());

  if (Array.isArray(item?.imagenes)) {
    for (const u of item.imagenes) {
      if (typeof u === "string" && u.trim()) out.push(u.trim());
    }
  }

  if (Array.isArray(item?.articulo_imagenes)) {
    const sorted = [...item.articulo_imagenes].sort((a, b) => (a?.position ?? 0) - (b?.position ?? 0));
    for (const it of sorted) {
      const u = it?.url;
      if (typeof u === "string" && u.trim()) out.push(u.trim());
    }
  }

  const unique = Array.from(new Set(out));
  return unique.length ? unique : [FALLBACK_IMAGE];
}

function getArticuloId(item) {
  return item?.id || item?.articulo_id || item?.uuid || item?.product_id || null;
}

function isHttpUrl(v) {
  const s = String(v || "").trim();
  return s.startsWith("http://") || s.startsWith("https://") || s.startsWith("data:");
}

async function resolvePhotoUrlMaybe(storageValue) {
  const raw = String(storageValue || "").trim();
  if (!raw) return "";

  if (isHttpUrl(raw)) return raw;

  const parts = raw.split("/").filter(Boolean);
  if (parts.length < 2) return "";

  const bucket = parts[0];
  const path = parts.slice(1).join("/");

  try {
    const pub = supabase.storage.from(bucket).getPublicUrl(path);
    const pubUrl = pub?.data?.publicUrl || "";
    if (pubUrl) return pubUrl;
  } catch {}

  try {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
    if (error) return "";
    return data?.signedUrl || "";
  } catch {
    return "";
  }
}

function normalizeTipo(v) {
  const s = String(v || "").toLowerCase().trim();
  if (!s) return "donacion";
  if (s.includes("venta")) return "venta";
  if (s.includes("don")) return "donacion";
  if (s.includes("regal")) return "donacion";
  return s;
}

function normalizeEstado(v) {
  const s = String(v || "").toLowerCase().trim();

  if (s === "available") return "disponible";
  if (s === "reserved") return "reservado";
  if (s === "delivered") return "entregado";

  // ✅ NUEVO: estados de moderación
  if (s === "reviewing" || s === "en_revision" || s === "en revisión") return "en_revision";

  // normal
  return s || "disponible";
}

function getCategory(item) {
  return String(item?.category ?? item?.categoria ?? "").trim();
}
function getSubcategory(item) {
  return String(item?.subcategory ?? item?.subcategoria ?? "").trim();
}
function formatCOP(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  try {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    // fallback si el navegador no soporta Intl
    return `$ ${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
  }
}

function clampInt(v, min, max) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

function getConditionScore(item) {
  // soporta varias formas por compatibilidad
  const raw =
    item?.estado_producto ??
    item?.estadoProducto ??
    item?.conditionScore ??
    item?.condition_score ??
    item?.estado_condicion ??
    item?.estado; // ⚠️ ojo: en tu DB "estado" suele ser status (disponible/reservado); úsalo solo si lo reutilizas
  const n = clampInt(raw, 1, 10);
  return n;
}

function conditionMeta(score) {
  const s = clampInt(score, 1, 10);
  if (!s) return null;

  // 1–3 rojo, 4–6 amarillo, 7–8 verde, 9–10 verde fuerte
  if (s <= 3)
    return {
      label: "Muy deteriorado",
      cls: "bg-red-100 text-red-800 border-red-200",
    };
  if (s <= 6)
    return {
      label: "Uso medio",
      cls: "bg-yellow-100 text-yellow-900 border-yellow-200",
    };
  if (s <= 8)
    return {
      label: "Buen estado",
      cls: "bg-emerald-100 text-emerald-900 border-emerald-200",
    };
  return {
    label: "Casi nuevo",
    cls: "bg-green-100 text-green-900 border-green-200",
  };
}

export default function ProductDetail({
  item,
  isOpen,
  onClose,
  onSolicitar,
  user,
  onCategoryClick,
  onSubcategoryClick,
}) {
  const publicName = formatPublicName(item?.owner_name || item?.owner?.name || item?.anunciante || item?.usuario_nombre);

  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeImg, setActiveImg] = useState(0);

  const [checkingApplied, setCheckingApplied] = useState(false);
  const [hasApplied, setHasApplied] = useState(false);

  const [ownerNameResolved, setOwnerNameResolved] = useState("");
  const [ownerPhotoResolved, setOwnerPhotoResolved] = useState("");

  
  const [stableOwnerPhoto, setStableOwnerPhoto] = useState("");
// Report modal
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("Contenido prohibido");
  const [reportDetails, setReportDetails] = useState("");
  const [reportSending, setReportSending] = useState(false);

  const submitLock = useRef(false);

  const ownerId = item?.usuario_id || item?.owner_id || item?.ownerId || null;

  const ownerNameRaw =
    item?.owner_name ||
    item?.ownerName ||
    item?.owner_nombre ||
    item?.ownerNombre ||
    item?.owner_name_from_user_table ||
    item?.vendedor?.nombre ||
    item?.usuarios?.nombre ||
    "";

  const ownerPhotoRaw = item?.owner_photo || item?.vendedor?.foto_url || item?.usuarios?.foto_url || "";

  const tipoNorm = normalizeTipo(item?.tipo ?? item?.mode ?? "donacion");
  const estadoNorm = normalizeEstado(item?.estado ?? item?.status ?? "disponible");
  const priceRaw = item?.price ?? item?.precio ?? item?.valor ?? 0;
const priceCOP = formatCOP(priceRaw);
const showPrice = tipoNorm === "venta" && Number(priceRaw) > 0;

  const isUnderReview = estadoNorm === "en_revision";

  const ciudad = item?.ciudad ?? item?.city ?? "";
  const localidad = item?.localidad_es ?? item?.locality ?? "";
  const locationText =
    item?.location || (localidad && ciudad ? `${localidad}, ${ciudad}` : localidad || ciudad || "Ubicación");

  const isAvailable = estadoNorm === "disponible";
  const isGift = tipoNorm !== "venta";

  const articuloId = getArticuloId(item);

  const isOwner = useMemo(() => {
    if (!user?.id || !ownerId) return false;
    return user.id === ownerId;
  }, [user?.id, ownerId]);

  const buyerId = item?.buyer_id || item?.buyerId || null;
  const winnerId = item?.ganador_id || item?.winner_id || item?.winnerUid || null;

  const isWinner = !!user?.id && !!winnerId && user.id === winnerId;
  const isBuyer = !!user?.id && !!buyerId && user.id === buyerId;

  const canSeeChat =
    (estadoNorm === "reservado" || estadoNorm === "entregado") && (isOwner || (isGift ? isWinner : isBuyer));

  const images = useMemo(() => buildImages(item), [item]);
  const mainImage = images[activeImg] || images[0] || FALLBACK_IMAGE;

  useEffect(() => {
    setMessage("");
    setIsSubmitting(false);
    setActiveImg(0);
    submitLock.current = false;

    setHasApplied(false);
    setCheckingApplied(true);

    setOwnerNameResolved("");

    // ✅ Reset de foto por cambio de publicación (evita que quede la del vendedor anterior)
    setOwnerPhotoResolved("");
    setStableOwnerPhoto("");
    // ✅ Evita parpadeo del avatar: no limpies a vacío antes de resolver
    // setOwnerPhotoResolved("");

    setReportOpen(false);
    setReportReason("Contenido prohibido");
    setReportDetails("");
    setReportSending(false);
  }, [isOpen, item?.id]);

  useEffect(() => {
    if (!isOpen) return;
    if (!item) return;

    let alive = true;

    (async () => {
      const nameFromItem = String(ownerNameRaw || "").trim();
      const photoFromItem = String(ownerPhotoRaw || "").trim();

      const photoResolvedFromItem = await resolvePhotoUrlMaybe(photoFromItem);
      if (!alive) return;

      if (nameFromItem || photoResolvedFromItem) {
        setOwnerNameResolved(nameFromItem);
        setOwnerPhotoResolved(photoResolvedFromItem);
        if (photoResolvedFromItem) setStableOwnerPhoto(photoResolvedFromItem);
      }

      if (!ownerId) return;
      if (nameFromItem && photoResolvedFromItem) return;

      try {
        const { data, error } = await supabase
          .from("usuarios")
          .select("id, nombre, foto_url")
          .eq("id", ownerId)
          .maybeSingle();

        if (!alive) return;
        if (error) return;

        const nombreDb = String(data?.nombre || "").trim();
        const fotoDb = String(data?.foto_url || "").trim();
        const fotoDbResolved = await resolvePhotoUrlMaybe(fotoDb);

        if (!alive) return;

        setOwnerNameResolved((prev) => prev || nombreDb);
        setOwnerPhotoResolved((prev) => prev || fotoDbResolved);
        if (fotoDbResolved) setStableOwnerPhoto(fotoDbResolved);
      } catch {}
    })();

    return () => {
      alive = false;
    };
  }, [isOpen, item, ownerId, ownerNameRaw, ownerPhotoRaw]);

  useEffect(() => {
    if (!isOpen) return;
    if (!item) return;

    // ✅ si está en revisión, no hacemos verificación de solicitud, porque NO se puede solicitar
    if (isUnderReview) {
      setCheckingApplied(false);
      setHasApplied(false);
      return;
    }

    if (!articuloId || !isGift || !isAvailable || !user?.id || user.id === ownerId) {
      setCheckingApplied(false);
      setHasApplied(false);
      return;
    }

    let alive = true;

    (async () => {
      try {
        setCheckingApplied(true);

        const { data, error } = await supabase
          .from("postulaciones")
          .select("id")
          .eq("articulo_id", articuloId)
          .eq("usuario_id", user.id)
          .limit(1);

        if (!alive) return;

        if (error) {
          setHasApplied(false);
          return;
        }

        setHasApplied(Array.isArray(data) && data.length > 0);
      } catch {
        if (!alive) return;
        setHasApplied(false);
      } finally {
        if (!alive) return;
        setCheckingApplied(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [isOpen, item?.id, user?.id, ownerId, isGift, isAvailable, articuloId, isUnderReview]);

  if (!isOpen || !item) return null;

  const safeClose = () => {
    if (isSubmitting || reportSending) return;
    onClose?.();
  };

  const handleSendRequest = async () => {
    if (submitLock.current) return;
    submitLock.current = true;

    const text = message.trim();

    if (!user?.id) {
      alert("Debes iniciar sesión para solicitar este artículo.");
      submitLock.current = false;
      return;
    }

    if (isOwner) {
      alert("Esta es tu publicación. No puedes postularte a tu propio artículo.");
      submitLock.current = false;
      return;
    }

    if (isUnderReview) {
      alert("Este artículo está EN REVISIÓN por moderación. Por ahora no se puede solicitar.");
      submitLock.current = false;
      return;
    }

    if (checkingApplied) {
      alert("Espera un momento… estamos verificando tu solicitud.");
      submitLock.current = false;
      return;
    }

    if (hasApplied) {
      alert("Ya hiciste una solicitud. Puedes ver el estado en Mis Rescates.");
      submitLock.current = false;
      return;
    }

    if (text.length < 10) {
      submitLock.current = false;
      return;
    }

    try {
      setIsSubmitting(true);
      await onSolicitar?.(item, text);

      setHasApplied(true);
      setMessage("");
      safeClose();
    } catch (error) {
      console.error("Error al postular:", error);
      alert("No se pudo enviar tu solicitud. Intenta de nuevo.");
    } finally {
      setIsSubmitting(false);
      submitLock.current = false;
    }
  };

  const handleReserve = async () => {
    if (submitLock.current) return;
    submitLock.current = true;

    if (!user?.id) {
      alert("Debes iniciar sesión para reservar este artículo.");
      submitLock.current = false;
      return;
    }

    if (isOwner) {
      alert("Esta es tu publicación. No puedes reservar tu propio artículo.");
      submitLock.current = false;
      return;
    }

    if (isUnderReview) {
      alert("Este artículo está EN REVISIÓN por moderación. Por ahora no se puede reservar.");
      submitLock.current = false;
      return;
    }

    if (!isAvailable) {
      submitLock.current = false;
      return;
    }

    try {
      setIsSubmitting(true);
      await onSolicitar?.(item, "");
    } catch (e) {
      console.error("Error reservando:", e);
      alert("No se pudo reservar. Intenta de nuevo.");
    } finally {
      setIsSubmitting(false);
      submitLock.current = false;
    }
  };

  const handleSubmitReport = async () => {
    if (reportSending) return;

    if (!user?.id) {
      alert("Debes iniciar sesión para reportar.");
      return;
    }
    if (!articuloId) {
      alert("No se pudo identificar el artículo para reportar.");
      return;
    }
    if (isOwner) {
      alert("No puedes reportar tu propia publicación.");
      return;
    }

    const reason = String(reportReason || "").trim();
    if (!reason) {
      alert("Selecciona un motivo.");
      return;
    }

    try {
      setReportSending(true);

      // ✅ NUEVO: asegura que exista usuarios.id = user.id (evita FK 23503)
      // Requiere en Supabase: public.ensure_usuario_row(p_uid uuid)
      const { error: ensureErr } = await supabase.rpc("ensure_usuario_row", { p_uid: user.id });
      if (ensureErr) {
        console.error("ensure_usuario_row error:", ensureErr);
        alert("No se pudo preparar tu usuario para reportar. Intenta de nuevo.");
        return;
      }

      const payload = {
        reporter_user_id: user.id,
        target_type: "articulo",
        target_id: articuloId,
        reason,
        details: String(reportDetails || "").trim() || null,
      };

      const { error } = await supabase.from("reports").insert([payload]);
      if (error) throw error;

      alert("✅ Gracias. Recibimos tu reporte y lo revisaremos.");
      setReportOpen(false);
      setReportDetails("");
      setReportReason("Contenido prohibido");
    } catch (e) {
      console.error("Error creando reporte:", e);
      alert(e?.message || "No se pudo enviar el reporte. Intenta de nuevo.");
    } finally {
      setReportSending(false);
    }
  };

  const titulo = item?.titulo ?? item?.title ?? "Sin título";
  const descripcion = item?.descripcion ?? item?.description ?? "";

  const conditionScore = getConditionScore(item);
  const condition = conditionMeta(conditionScore);

  const ownerName = ownerNameResolved ? formatPublicName(ownerNameResolved) : "Vendedor";
  const ownerPhoto = stableOwnerPhoto || ownerPhotoResolved || "";

  const tipoBadgeStyles = tipoNorm === "donacion" ? "bg-blue-100 text-blue-700" : "bg-gray-800 text-white";

  const cat = getCategory(item);
  const sub = getSubcategory(item);
  const hasCatTrail = !!(cat || sub);

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[120] flex items-center justify-center p-4"
      onClick={safeClose}
    >
      <div
        className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col md:flex-row animate-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* IZQUIERDA */}
        <div className="md:w-1/2 bg-gray-100 relative flex flex-col">
          <div className="relative flex-1 min-h-[260px]">
            <img
              src={mainImage}
              alt={titulo}
              className="w-full h-full object-cover"
              onError={(e) => {
                if (e.currentTarget.dataset.fallbackApplied) return;
                e.currentTarget.dataset.fallbackApplied = "1";
                e.currentTarget.src = FALLBACK_IMAGE;
              }}
            />

            <button
              onClick={safeClose}
              className="md:hidden absolute top-4 right-4 bg-white/80 p-2 rounded-full shadow-lg"
              type="button"
            >
              <X size={20} />
            </button>

            {/* overlay si no disponible o si en revisión */}
            {(!isAvailable || isUnderReview) && (
              <div className="absolute inset-0 bg-black/45 flex items-center justify-center p-4">
                <div className="bg-white/95 rounded-2xl px-4 py-3 flex items-center gap-2 font-black text-gray-800 text-center">
                  <Lock size={18} className="text-forest-green" />
                  {isUnderReview ? "Este artículo está EN REVISIÓN" : `Este artículo está ${estadoNorm}`}
                </div>
              </div>
            )}
          </div>

          {images.length > 1 && (
            <div className="p-3 bg-white border-t">
              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                {images.map((src, idx) => (
                  <button
                    key={`${src}-${idx}`}
                    type="button"
                    onClick={() => setActiveImg(idx)}
                    className={`shrink-0 w-16 h-16 rounded-xl overflow-hidden border transition ${
                      idx === activeImg ? "border-forest-green" : "border-gray-200"
                    }`}
                  >
                    <img
                      src={src}
                      alt={`thumb-${idx + 1}`}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        if (e.currentTarget.dataset.fallbackApplied) return;
                        e.currentTarget.dataset.fallbackApplied = "1";
                        e.currentTarget.src = FALLBACK_IMAGE;
                      }}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* DERECHA */}
        <div className="md:w-1/2 p-8 flex flex-col overflow-y-auto">
          <div className="flex justify-between items-start mb-4">
            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${tipoBadgeStyles}`}>
              {tipoNorm === "donacion" ? "donacion" : "venta"}
            </span>

            <button onClick={safeClose} className="hidden md:block p-1 hover:bg-gray-100 rounded-full" type="button">
              <X size={24} className="text-gray-400" />
            </button>
          </div>

          {/* ✅ AVISO EN REVISION */}
          {isUnderReview && (
            <div className="mb-4 bg-yellow-50 border border-yellow-100 rounded-2xl p-4">
              <p className="text-sm font-black text-yellow-900">🚧 Publicación en revisión</p>
              <p className="text-xs text-yellow-900/80 font-bold mt-1">
                Moderación está revisando este anuncio. Por ahora no se puede solicitar ni reservar.
              </p>
              <button onClick={safeClose} className="mt-3 w-full bg-gray-900 text-white py-3 rounded-2xl font-black" type="button">
                CERRAR
              </button>
            </div>
          )}

          {/* CATEGORÍA / SUBCATEGORÍA CLICKEABLE */}
          {hasCatTrail && (
            <div className="mb-2">
              <div className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl bg-gray-50 border border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    if (!cat) return;
                    onCategoryClick?.(cat);
                  }}
                  className={`text-[10px] font-black uppercase tracking-widest ${cat ? "text-forest-green hover:underline" : "text-gray-500"}`}
                  title={cat ? `Ver ${cat}` : "Sin categoría"}
                >
                  {cat || "Sin categoría"}
                </button>

                {sub ? (
                  <>
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">›</span>
                    <button
                      type="button"
                      onClick={() => {
                        onSubcategoryClick?.(cat || "", sub);
                      }}
                      className="text-[10px] font-black uppercase tracking-widest text-forest-green hover:underline"
                      title={`Ver ${cat ? `${cat} / ` : ""}${sub}`}
                    >
                      {sub}
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          )}

          <h1 className="text-2xl font-black text-gray-800 mb-2 leading-tight">{titulo}</h1>

          {condition ? (
            <div className="mb-3">
              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${condition.cls}`}>
                <span className="text-xs font-black">⭐</span>
                <span className="text-xs font-black">{conditionScore}/10</span>
                <span className="text-[10px] font-black uppercase tracking-widest">
                  {condition.label}
                </span>
              </div>
            </div>
          ) : null}

          <div className="flex items-center gap-2 text-gray-500 text-sm mb-6">
            <MapPin size={16} className="text-forest-green" />
            <span className="font-bold">{locationText}</span>
          </div>
{showPrice && (
  <div className="mb-6">
    <div className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl bg-forest-green/10 border border-forest-green/20">
      <span className="text-[10px] font-black uppercase tracking-widest text-forest-green">
        Precio
      </span>
      <span className="text-lg font-black text-gray-900">
        {priceCOP}
      </span>
    </div>
    <p className="mt-2 text-[10px] text-gray-400 font-bold uppercase tracking-widest">
      Pago se coordina con el vendedor
    </p>
  </div>
)}
          <div className="bg-smoke-white p-4 rounded-2xl mb-6">
            <h3 className="text-xs font-black text-gray-400 uppercase mb-2">Descripción del tesoro</h3>
            <p className="text-gray-600 text-sm leading-relaxed italic">
              {String(descripcion || "").trim()
                ? `"${String(descripcion).trim()}"`
                : `"Es un artículo que puede servir para reutilizar, reparar o recuperar piezas. Si te interesa, cuéntale al vendedor cómo lo vas a aprovechar."`}
            </p>
          </div>

          {/* VENDEDOR */}
          <div className="flex items-center gap-4 mb-2 p-4 border border-gray-100 rounded-2xl">
            <div className="w-12 h-12 rounded-full overflow-hidden bg-treasure-gold/20 flex items-center justify-center font-black text-treasure-gold shrink-0">
              {ownerPhoto ? (
                <img
                  src={ownerPhoto}
                  alt={ownerName}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              ) : (
                <span>{(ownerName?.[0] || "V").toUpperCase()}</span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-gray-800 truncate">{ownerName}</p>
              <div className="flex items-center gap-1 text-[10px] text-gray-500 font-bold uppercase">
                <ShieldCheck size={12} className="text-forest-green" />
                Vendedor verificado
              </div>
            </div>

            {!isOwner && (
              <button
                type="button"
                onClick={() => setReportOpen(true)}
                className="shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-2xl border border-gray-200 text-gray-700 font-black text-[10px] uppercase tracking-widest hover:bg-gray-50"
                title="Reportar publicación"
              >
                <Flag size={14} />
                Reportar
              </button>
            )}
          </div>

          {isOwner && (
            <div className="mt-4 bg-orange-50 border border-orange-100 p-4 rounded-2xl">
              <p className="text-orange-600 text-xs font-bold text-center italic">
                Esta es tu publicación. Puedes editarla desde tu perfil.
              </p>
            </div>
          )}

          {/* Si no disponible (incluye reservado/entregado), mostramos bloque */}
          {!isAvailable && !isUnderReview && (
            <div className="mt-4 bg-gray-50 border border-gray-100 rounded-2xl p-4">
              <p className="text-sm text-gray-600 font-bold">
                Este artículo está <span className="uppercase">{estadoNorm}</span>.
              </p>
              <p className="text-xs text-gray-500 mt-1">Ya no se aceptan nuevas solicitudes / reservas por ahora.</p>

              <button onClick={safeClose} className="mt-3 w-full bg-gray-900 text-white py-3 rounded-2xl font-black" type="button">
                CERRAR
              </button>
            </div>
          )}

          {/* DONACIÓN / SOLICITUD (bloqueado si en revisión) */}
          {isGift && isAvailable && !isOwner && !isUnderReview && (
            <div className="mt-6 space-y-4 border-t pt-6">
              {checkingApplied ? (
                <div className="bg-gray-50 border border-gray-100 p-4 rounded-2xl">
                  <p className="text-xs font-black text-gray-600 uppercase">Verificando tu solicitud…</p>
                </div>
              ) : hasApplied ? (
                <div className="bg-forest-green/10 border border-forest-green/20 p-4 rounded-2xl">
                  <p className="text-sm font-black text-gray-800">✅ Ya hiciste una solicitud.</p>
                  <p className="text-xs text-gray-600 mt-1 font-bold">
                    Puedes ver el estado en <span className="uppercase">Mis Rescates</span>.
                  </p>

                  <button onClick={safeClose} className="mt-3 w-full bg-gray-900 text-white py-3 rounded-2xl font-black" type="button">
                    CERRAR
                  </button>
                </div>
              ) : (
                <>
                  <label className="block text-xs font-black text-gray-400 uppercase">
                    ¿Por qué te gustaría recibir este elemento?
                  </label>

                  <textarea
                    maxLength={140}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Ej: Soy artesano y me sirve para una escultura..."
                    className="w-full border-2 border-gray-100 rounded-2xl p-4 text-sm outline-none focus:border-forest-green h-24 resize-none"
                    disabled={isSubmitting}
                  />

                  <div className="flex justify-between items-center text-[10px] font-bold text-gray-400">
                    <span>Mínimo 10 caracteres</span>
                    <span>{message.length}/140</span>
                  </div>

                  <button
                    disabled={isSubmitting || message.trim().length < 10}
                    onClick={handleSendRequest}
                    className="w-full bg-forest-green text-white py-4 rounded-2xl font-black disabled:opacity-50 disabled:cursor-not-allowed"
                    type="button"
                  >
                    {isSubmitting ? "ENVIANDO..." : "ENVIAR SOLICITUD"}
                  </button>

                  <p className="text-[10px] text-center text-gray-400 font-bold uppercase tracking-tighter">
                    Recuerda: El vendedor elegirá a quién entregárselo.
                  </p>
                </>
              )}
            </div>
          )}

          {/* VENTA / RESERVA (bloqueado si en revisión) */}
          {!isGift && isAvailable && !isOwner && !isUnderReview && (
            <div className="mt-auto space-y-3 pt-6 border-t">
              <button
                onClick={handleReserve}
                disabled={isSubmitting}
                className="w-full bg-forest-green text-white py-4 rounded-2xl font-black text-lg hover:shadow-xl hover:-translate-y-1 transition-all disabled:opacity-50"
                type="button"
              >
                {isSubmitting ? "RESERVANDO..." : "RESERVAR"}
              </button>

              <p className="text-[10px] text-center text-gray-400 font-bold uppercase tracking-widest">
                Reserva primero y coordina el pago con el vendedor.
              </p>
            </div>
          )}

          {canSeeChat && (
            <div className="mt-8 animate-in slide-in-from-bottom-4">
              <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
                <p className="text-sm font-bold text-gray-700">Chat privado habilitado ✅</p>
                <p className="text-xs text-gray-500 mt-1">Solo tú y la otra parte pueden ver este chat.</p>
              </div>
            </div>
          )}
        </div>

        {/* MODAL REPORTAR */}
        {reportOpen && (
          <div
            className="absolute inset-0 z-[130] bg-black/60 flex items-center justify-center p-4"
            onClick={() => {
              if (reportSending) return;
              setReportOpen(false);
            }}
          >
            <div
              className="w-full max-w-lg bg-white rounded-3xl shadow-2xl p-6 animate-in zoom-in duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Reportar publicación</p>
                  <h3 className="text-lg font-black text-gray-900 mt-1 leading-tight">¿Qué problema encontraste?</h3>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (reportSending) return;
                    setReportOpen(false);
                  }}
                  className="p-2 rounded-full hover:bg-gray-100"
                  title="Cerrar"
                >
                  <X size={18} className="text-gray-500" />
                </button>
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">
                    Motivo
                  </label>
                  <select
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value)}
                    className="w-full border-2 border-gray-100 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-forest-green bg-white"
                    disabled={reportSending}
                  >
                    <option>Contenido prohibido</option>
                    <option>Fraude / estafa</option>
                    <option>Venta de producto ilegal</option>
                    <option>Lenguaje ofensivo</option>
                    <option>Spam</option>
                    <option>Otro</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">
                    Detalle (opcional)
                  </label>
                  <textarea
                    value={reportDetails}
                    onChange={(e) => setReportDetails(e.target.value)}
                    className="w-full border-2 border-gray-100 rounded-2xl p-4 text-sm outline-none focus:border-forest-green h-28 resize-none"
                    placeholder="Cuéntanos brevemente qué viste para que moderación lo revise más rápido."
                    disabled={reportSending}
                    maxLength={400}
                  />
                  <div className="mt-1 text-[10px] text-gray-400 font-bold text-right">
                    {reportDetails.length}/400
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (reportSending) return;
                      setReportOpen(false);
                    }}
                    className="flex-1 border border-gray-200 rounded-2xl py-3 font-black text-sm text-gray-700 hover:bg-gray-50"
                    disabled={reportSending}
                  >
                    Cancelar
                  </button>

                  <button
                    type="button"
                    onClick={handleSubmitReport}
                    className="flex-1 bg-gray-900 text-white rounded-2xl py-3 font-black text-sm hover:opacity-95 disabled:opacity-50"
                    disabled={reportSending}
                  >
                    {reportSending ? "ENVIANDO..." : "ENVIAR REPORTE"}
                  </button>
                </div>

                <p className="text-[10px] text-gray-400 font-bold text-center uppercase tracking-widest">
                  Gracias por ayudar a mantener Mi Batute seguro.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}