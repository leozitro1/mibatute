// src/components/ProductDetail.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { X, MapPin, ShieldCheck, Lock } from "lucide-react";
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
    const sorted = [...item.articulo_imagenes].sort(
      (a, b) => (a?.position ?? 0) - (b?.position ?? 0)
    );
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

// ✅ detecta si es URL completa
function isHttpUrl(v) {
  const s = String(v || "").trim();
  return s.startsWith("http://") || s.startsWith("https://") || s.startsWith("data:");
}

/**
 * ✅ intenta resolver foto_url cuando viene como:
 * - URL completa -> se usa tal cual
 * - "bucket/ruta/archivo.png" -> intenta publicUrl y si no, signedUrl
 */
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
  } catch {
    // ignore
  }

  try {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
    if (error) return "";
    return data?.signedUrl || "";
  } catch {
    return "";
  }
}

// ✅ UNIFICACIÓN: regalo -> donacion
function normalizeTipo(v) {
  const s = String(v || "").toLowerCase().trim();
  if (!s) return "donacion";
  if (s.includes("venta")) return "venta";
  if (s.includes("don")) return "donacion";
  if (s.includes("regal")) return "donacion"; // ✅ antes "regalo"
  return s;
}

// ✅ Normaliza estado EN/ES
function normalizeEstado(v) {
  const s = String(v || "").toLowerCase().trim();
  if (s === "available") return "disponible";
  if (s === "reserved") return "reservado";
  if (s === "delivered") return "entregado";
  return s || "disponible";
}

export default function ProductDetail({ item, isOpen, onClose, onSolicitar, user }) {
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeImg, setActiveImg] = useState(0);

  // ✅ estado para bloquear si ya aplicó (sin parpadeo)
  const [checkingApplied, setCheckingApplied] = useState(false);
  const [hasApplied, setHasApplied] = useState(false);

  // ✅ resolver vendedor aunque item no traiga foto/nombre
  const [ownerNameResolved, setOwnerNameResolved] = useState("");
  const [ownerPhotoResolved, setOwnerPhotoResolved] = useState("");

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

  const ownerPhotoRaw =
    item?.owner_photo ||
    item?.vendedor?.foto_url ||
    item?.usuarios?.foto_url ||
    "";

  const tipoNorm = normalizeTipo(item?.tipo ?? item?.mode ?? "donacion");
  const estadoNorm = normalizeEstado(item?.estado ?? item?.status ?? "disponible");

  const ciudad = item?.ciudad ?? item?.city ?? "";
  const localidad = item?.localidad_es ?? item?.locality ?? "";
  const locationText =
    item?.location ||
    (localidad && ciudad ? `${localidad}, ${ciudad}` : localidad || ciudad || "Ubicación");

  const isAvailable = estadoNorm === "disponible";
  const isGift = tipoNorm !== "venta"; // ✅ donación (unificado)

  const isOwner = useMemo(() => {
    if (!user?.id || !ownerId) return false;
    return user.id === ownerId;
  }, [user?.id, ownerId]);

  const buyerId = item?.buyer_id || item?.buyerId || null;
  const winnerId = item?.ganador_id || item?.winner_id || item?.winnerUid || null;

  const isWinner = !!user?.id && !!winnerId && user.id === winnerId;
  const isBuyer = !!user?.id && !!buyerId && user.id === buyerId;

  // ✅ chat visible para involucrados cuando: reservado o entregado
  const canSeeChat =
    (estadoNorm === "reservado" || estadoNorm === "entregado") &&
    (isOwner || (isGift ? isWinner : isBuyer));

  const images = useMemo(() => buildImages(item), [item]);
  const mainImage = images[activeImg] || images[0] || FALLBACK_IMAGE;

  // ✅ reset al abrir / cambiar item
  useEffect(() => {
    setMessage("");
    setIsSubmitting(false);
    setActiveImg(0);
    submitLock.current = false;

    // ✅ evita parpadeo: arrancamos "verificando"
    setHasApplied(false);
    setCheckingApplied(true);

    setOwnerNameResolved("");
    setOwnerPhotoResolved("");
  }, [isOpen, item?.id]);

  // ✅ resolver vendedor (nombre + foto)
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
      }

      if (!ownerId) return;
      if (nameFromItem && photoResolvedFromItem) return;

      try {
        const { data, error } = await supabase
          .from("usuarios") // ✅ ajusta si tu tabla se llama diferente
          .select("id, nombre, foto_url")
          .eq("id", ownerId)
          .maybeSingle();

        if (!alive) return;

        if (error) {
          console.log("Error cargando perfil vendedor:", error);
          return;
        }

        const nombreDb = String(data?.nombre || "").trim();
        const fotoDb = String(data?.foto_url || "").trim();
        const fotoDbResolved = await resolvePhotoUrlMaybe(fotoDb);

        if (!alive) return;

        setOwnerNameResolved((prev) => prev || nombreDb);
        setOwnerPhotoResolved((prev) => prev || fotoDbResolved);
      } catch (e) {
        console.log("Error inesperado cargando vendedor:", e);
      }
    })();

    return () => {
      alive = false;
    };
  }, [isOpen, item, ownerId, ownerNameRaw, ownerPhotoRaw]);

  // ✅ verificar si ya existe postulación del usuario para este artículo (sin flicker)
  useEffect(() => {
    if (!isOpen) return;
    if (!item) return;

    const articuloId = getArticuloId(item);

    // si no aplica, dejamos checkingApplied en false
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
          console.log("Error verificando postulación existente:", error);
          setHasApplied(false);
          return;
        }

        setHasApplied(Array.isArray(data) && data.length > 0);
      } catch (e) {
        if (!alive) return;
        console.log("Error inesperado verificando postulación:", e);
        setHasApplied(false);
      } finally {
        if (!alive) return;
        setCheckingApplied(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [isOpen, item?.id, user?.id, ownerId, isGift, isAvailable]);

  if (!isOpen || !item) return null;

  const safeClose = () => {
    if (isSubmitting) return;
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

      // ✅ marca inmediatamente como aplicado (evita que vuelva a aparecer el form)
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

  const titulo = item?.titulo ?? item?.title ?? "Sin título";
  const descripcion = item?.descripcion ?? item?.description ?? "";

  const ownerName = ownerNameResolved || "Vendedor";
  const ownerPhoto = ownerPhotoResolved || "";

  const tipoBadgeStyles =
    tipoNorm === "donacion"
      ? "bg-blue-100 text-blue-700"
      : "bg-gray-800 text-white";

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

            {!isAvailable && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <div className="bg-white/90 rounded-2xl px-4 py-3 flex items-center gap-2 font-black text-gray-800">
                  <Lock size={18} className="text-forest-green" />
                  Este artículo está {estadoNorm}
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
            <span
              className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${tipoBadgeStyles}`}
            >
              {tipoNorm === "donacion" ? "donacion" : "venta"}
            </span>

            <button
              onClick={safeClose}
              className="hidden md:block p-1 hover:bg-gray-100 rounded-full"
              type="button"
            >
              <X size={24} className="text-gray-400" />
            </button>
          </div>

          <h1 className="text-2xl font-black text-gray-800 mb-2 leading-tight">{titulo}</h1>

          <div className="flex items-center gap-2 text-gray-500 text-sm mb-6">
            <MapPin size={16} className="text-forest-green" />
            <span className="font-bold">{locationText}</span>
          </div>

          <div className="bg-smoke-white p-4 rounded-2xl mb-6">
            <h3 className="text-xs font-black text-gray-400 uppercase mb-2">
              Descripción del tesoro
            </h3>
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

            <div className="min-w-0">
              <p className="text-sm font-black text-gray-800 truncate">{ownerName}</p>
              <div className="flex items-center gap-1 text-[10px] text-gray-500 font-bold uppercase">
                <ShieldCheck size={12} className="text-forest-green" />
                Vendedor verificado
              </div>
            </div>
          </div>

          {isOwner && (
            <div className="mt-4 bg-orange-50 border border-orange-100 p-4 rounded-2xl">
              <p className="text-orange-600 text-xs font-bold text-center italic">
                Esta es tu publicación. Puedes editarla desde tu perfil.
              </p>
            </div>
          )}

          {!isAvailable && (
            <div className="mt-4 bg-gray-50 border border-gray-100 rounded-2xl p-4">
              <p className="text-sm text-gray-600 font-bold">
                Este artículo está <span className="uppercase">{estadoNorm}</span>.
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Ya no se aceptan nuevas solicitudes / reservas por ahora.
              </p>

              <button
                onClick={safeClose}
                className="mt-3 w-full bg-gray-900 text-white py-3 rounded-2xl font-black"
                type="button"
              >
                CERRAR
              </button>
            </div>
          )}

          {/* ✅ DONACIÓN / SOLICITUD (sin parpadeo) */}
          {isGift && isAvailable && !isOwner && (
            <div className="mt-6 space-y-4 border-t pt-6">
              {checkingApplied ? (
                <div className="bg-gray-50 border border-gray-100 p-4 rounded-2xl">
                  <p className="text-xs font-black text-gray-600 uppercase">
                    Verificando tu solicitud…
                  </p>
                </div>
              ) : hasApplied ? (
                <div className="bg-forest-green/10 border border-forest-green/20 p-4 rounded-2xl">
                  <p className="text-sm font-black text-gray-800">✅ Ya hiciste una solicitud.</p>
                  <p className="text-xs text-gray-600 mt-1 font-bold">
                    Puedes ver el estado en <span className="uppercase">Mis Rescates</span>.
                  </p>

                  <button
                    onClick={safeClose}
                    className="mt-3 w-full bg-gray-900 text-white py-3 rounded-2xl font-black"
                    type="button"
                  >
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

          {/* ✅ VENTA / RESERVA */}
          {!isGift && isAvailable && !isOwner && (
            <div className="mt-auto space-y-3 pt-6 border-t">
              <button
                onClick={handleReserve}
                disabled={isSubmitting}
                className="w-full bg-forest-green text-white py-4 rounded-2xl font-black text-lg hover:shadow-xl hover:-translate-y-1 transition-all disabled:opacity-50"
                type="button"
              >
                {isSubmitting ? "RESERVANDO..." : "RESERVAR"}
              </button>

              <p className="text-[10px] text-center text-gray-400 font-bold uppercase tracking-tighter">
                Reserva primero y coordina el pago con el vendedor.
              </p>
            </div>
          )}

          {canSeeChat && (
            <div className="mt-8 animate-in slide-in-from-bottom-4">
              <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
                <p className="text-sm font-bold text-gray-700">Chat privado habilitado ✅</p>
                <p className="text-xs text-gray-500 mt-1">
                  Solo tú y la otra parte pueden ver este chat.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
