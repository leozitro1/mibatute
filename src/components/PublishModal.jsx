// src/components/PublishModal.jsx
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { X, Trash2 } from "lucide-react";
import Cropper from "react-easy-crop";
import { LOCATIONS } from "../data/locations";
import { publishArticle } from "../supabase/articleService";

/**
 * ✅ fallback por si NO llega props.categories
 * (pero en tu App.jsx ya lo estamos pasando)
 */
const FALLBACK_CATEGORY_TREE = [
  { key: "Hogar & Muebles", icon: "🌿", subs: ["Muebles", "Decoración", "Electrodomésticos", "Colchones", "Cocina"] },
  { key: "Electrónica & Tecnología", icon: "⚡", subs: ["Celulares", "Computadores", "Televisores", "Repuestos", "Chatarra electrónica"] },
  { key: "Construcción & Herramientas", icon: "🧱", subs: ["Materiales", "Herramientas", "Oficios", "Madera", "Metales"] },
  { key: "Ropa & Textiles", icon: "👕", subs: ["Ropa", "Retazos", "Telas", "Uniformes"] },
  { key: "Reciclaje & Reutilización", icon: "🔄", subs: ["Plásticos", "Vidrio", "Cartón", "Materias primas"] },
  { key: "Infantil & Juguetes", icon: "🧸", subs: ["Juguetes", "Ropa infantil", "Coches y sillas", "Lactancia", "Escolar"] },
  { key: "Deportes & Movilidad", icon: "🚲", subs: ["Bicicletas", "Patines", "Gimnasio", "Autopartes", "Motos"] },
  { key: "Libros & Educación", icon: "📚", subs: ["Libros", "Cuadernos y útiles", "Cursos y material", "Tecnología educativa", "Instrumentos"] },
  { key: "Mascotas", icon: "🐶", subs: ["Accesorios", "Alimento", "Camas y casas", "Salud", "Juguetes"] },
  { key: "Antigüedades & Coleccionables", icon: "🕰", subs: ["Monedas", "Relojes", "Arte", "Coleccionables", "Vintage"] },
];

// ✅ regla social: tope máximo para ventas
const MAX_VENTA_COP = 500000;

// ====== ESTÁNDAR FINAL (cuadrada) ======
const MAX_FILES = 4;
const MAX_ORIGINAL_MB = 8; // rechazo de originales gigantes
const OUT_SIZE = 800; // 800x800 final
const OUT_FORMAT = "image/webp";
const OUT_QUALITY = 0.82;

function bytesToMB(b) {
  return Math.round((b / (1024 * 1024)) * 100) / 100;
}

function conditionMeta(raw) {
  const v = Math.max(1, Math.min(10, Number(raw) || 1));
  if (v <= 3) return { label: "Muy deteriorado", cls: "bg-red-50 text-red-700 border-red-200" };
  if (v <= 6) return { label: "Uso medio", cls: "bg-yellow-50 text-yellow-800 border-yellow-200" };
  if (v <= 8) return { label: "Buen estado", cls: "bg-green-50 text-green-700 border-green-200" };
  return { label: "Casi nuevo", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
}

function normalizeMode(v) {
  const s = String(v || "").toLowerCase().trim();
  if (!s) return "donacion";
  if (s === "regalo") return "donacion";
  if (s.includes("regal")) return "donacion";
  if (s.includes("don")) return "donacion";
  if (s.includes("venta")) return "venta";
  return "donacion";
}

// ✅ Detecta datos de contacto prohibidos en la descripción
const PALABRAS_CLAVE_CONTACTO = [
  "comunicate", "comunicate", "comuniquese",
  "llamame", "llamame", "llama al", "llamar al",
  "whatsapp", "whats app", "wsp", "wasap",
  "facebook", "instagram", "telegram", "tiktok",
  " fb ", "fb.", "fb:", "/fb",
  "correo", "email", "e-mail", "gmail", "hotmail", "yahoo",
  "escribeme", "escribe al", "contactame", "contactame",
  "mi numero", "mi cel", "mi celular", "al cel",
];

const NUMERO_PALABRAS = [
  "cero","uno","dos","tres","cuatro","cinco",
  "seis","siete","ocho","nueve","diez",
];

function detectContactoProhibido(texto = "") {
  const t = (texto || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // 1) Email con @
  if (/@/.test(t)) {
    return "No puedes incluir correos electrónicos en la descripción.";
  }

  // 2) Palabras clave de contacto
  for (const kw of PALABRAS_CLAVE_CONTACTO) {
    if (t.includes(kw)) {
      return `No puedes incluir formas de contacto externo en la descripción (detectado: "${kw}").`;
    }
  }

  // 3) Número de teléfono en dígitos: 7+ dígitos con separadores opcionales
  if (/\d[\d\s.\-]{5,}\d/.test(t)) {
    return "No puedes incluir números de teléfono en la descripción.";
  }

  // 4) Número escrito en letras: 4+ palabras numéricas consecutivas
  const regexPalabrasNum = new RegExp(
    "(" + NUMERO_PALABRAS.join("|") + ")(\\s+(" + NUMERO_PALABRAS.join("|") + ")){3,}",
    "i"
  );
  if (regexPalabrasNum.test(t)) {
    return "No puedes escribir números de teléfono con letras en la descripción.";
  }

  return null;
}

function getSubsForCategory(categoryTree, category) {
  const found = (categoryTree || []).find((c) => String(c.key) === String(category));
  return Array.isArray(found?.subs) ? found.subs : [];
}

async function createImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function blobToFile(blob, originalName = "foto") {
  const ext = OUT_FORMAT === "image/webp" ? "webp" : "jpg";
  const base = String(originalName || "foto").replace(/\.[^.]+$/, "");
  return new File([blob], `${base}_sq.${ext}`, { type: OUT_FORMAT });
}

async function getCroppedSquareFile({ imageSrc, cropPixels, originalName }) {
  const image = await createImageFromUrl(imageSrc);

  const canvas = document.createElement("canvas");
  canvas.width = OUT_SIZE;
  canvas.height = OUT_SIZE;

  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("No se pudo procesar la imagen (canvas).");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // drawImage(source, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)
  ctx.drawImage(
    image,
    cropPixels.x,
    cropPixels.y,
    cropPixels.width,
    cropPixels.height,
    0,
    0,
    OUT_SIZE,
    OUT_SIZE
  );

  const blob = await new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), OUT_FORMAT, OUT_QUALITY);
  });

  if (!blob) throw new Error("No se pudo generar la imagen recortada.");
  return blobToFile(blob, originalName);
}

export default function PublishModal({ isOpen, onClose, onPublish, currentCity, user, categories }) {
  const CATEGORY_TREE = Array.isArray(categories) && categories.length ? categories : FALLBACK_CATEGORY_TREE;
  const CATEGORY_OPTIONS = useMemo(() => CATEGORY_TREE.map((c) => c.key), [CATEGORY_TREE]);

  const defaultCategory = CATEGORY_OPTIONS[0] || "Hogar & Muebles";
  const defaultSub = getSubsForCategory(CATEGORY_TREE, defaultCategory)[0] || "";

  const [formData, setFormData] = useState({
    title: "",
    category: defaultCategory,
    subcategory: defaultSub,
    mode: "donacion",
    price: "",
    city: currentCity || "",
    locality: "",
    description: "",
    conditionScore: 8, // 1-10
    isFeatured: false, // ✅ destacado (por ahora libre)
  });

  // ✅ Fotos finales (YA recortadas 800x800 webp)
  const [files, setFiles] = useState([]); // File[]
  const [previews, setPreviews] = useState([]); // string[]
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [descError, setDescError] = useState(null); // ✅ validación contacto

  // ====== Crop Queue ======
  const [cropQueue, setCropQueue] = useState([]); // File[]
  const [cropIndex, setCropIndex] = useState(0);

  const [cropOpen, setCropOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState("");
  const prevCropSrcRef = useRef(null);

  // ✅ Revocar el blob anterior SOLO después de que React haya cambiado de src.
  // Esto evita el spam: GET blob:... ERR_FILE_NOT_FOUND
  useEffect(() => {
    const prev = prevCropSrcRef.current;
    if (prev && prev !== cropSrc) {
      // siguiente tick para que el DOM ya no lo esté usando
      setTimeout(() => {
        try {
          URL.revokeObjectURL(prev);
        } catch {}
      }, 0);
    }
    prevCropSrcRef.current = cropSrc || null;

    return () => {
      // al desmontar, revoca el actual también
      if (cropSrc) {
        try {
          URL.revokeObjectURL(cropSrc);
        } catch {}
      }
    };
  }, [cropSrc]);

  const [cropSrcName, setCropSrcName] = useState("foto");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [isCropping, setIsCropping] = useState(false);

  const modeNorm = normalizeMode(formData.mode);
  const priceNumber = Number(formData.price);
  const isVenta = modeNorm === "venta";
  const isPriceNumberValid = Number.isFinite(priceNumber) && priceNumber > 0;
  const exceedsMaxVenta = isVenta && isPriceNumberValid && priceNumber > MAX_VENTA_COP;

  const cleanupPreviews = (urls = []) => {
    (urls || []).forEach((u) => {
      try {
        URL.revokeObjectURL(u);
      } catch {}
    });
  };

  const openCropForFile = useCallback((file) => {
    // ⚠️ No revocar aquí: si revocas antes de que React deje de usar el src anterior,
    // el navegador spamea ERR_FILE_NOT_FOUND (blob inexistente).
    const url = URL.createObjectURL(file);
    setCropSrc(url);
    setCropSrcName(file?.name || "foto");
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setCropOpen(true);
  }, []);

  // Cuando cambie la cola/índice, abre el crop del archivo actual
  useEffect(() => {
    if (!cropQueue.length) return;
    if (cropIndex < 0 || cropIndex >= cropQueue.length) return;
    openCropForFile(cropQueue[cropIndex]);
  }, [cropQueue, cropIndex, openCropForFile]);

  useEffect(() => {
    if (!isOpen) return;

    setFormData((prev) => {
      const modeNorm2 = normalizeMode(prev.mode);
      const safeCategory = CATEGORY_OPTIONS.includes(prev.category) ? prev.category : defaultCategory;
      const subs = getSubsForCategory(CATEGORY_TREE, safeCategory);
      const safeSub = subs.includes(prev.subcategory) ? prev.subcategory : subs[0] || "";

      return {
        ...prev,
        city: currentCity || prev.city || "",
        locality: "",
        mode: modeNorm2,
        category: safeCategory,
        subcategory: safeSub,
        price: modeNorm2 === "venta" ? prev.price : "",
        // 👇 por si cambiaste defaults o abres/cierra modal
        isFeatured: !!prev.isFeatured,
      };
    });

    setIsSubmitting(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCity, isOpen]);

  const localities = useMemo(() => {
    return formData.city ? LOCATIONS[formData.city] || [] : [];
  }, [formData.city]);

  const subOptions = useMemo(() => {
    return getSubsForCategory(CATEGORY_TREE, formData.category);
  }, [CATEGORY_TREE, formData.category]);

  useEffect(() => {
    if (!isOpen) return;
    setFormData((prev) => {
      const subs = getSubsForCategory(CATEGORY_TREE, prev.category);
      const safeSub = subs.includes(prev.subcategory) ? prev.subcategory : subs[0] || "";
      if (safeSub === prev.subcategory) return prev;
      return { ...prev, subcategory: safeSub };
    });
  }, [isOpen, formData.category, CATEGORY_TREE]);

  const resetForm = () => {
    const cat = defaultCategory;
    const sub = getSubsForCategory(CATEGORY_TREE, cat)[0] || "";

    setFormData({
      title: "",
      category: cat,
      subcategory: sub,
      mode: "donacion",
      price: "",
      city: currentCity || "",
      locality: "",
      description: "",
      conditionScore: 8,
      isFeatured: false,
    });

    cleanupPreviews(previews);
    setPreviews([]);
    setFiles([]);

    // crop
    setCropQueue([]);
    setCropIndex(0);
    setCropOpen(false);
    setCropSrc("");
    setCroppedAreaPixels(null);
    setIsCropping(false);
  };

  const handleClose = () => {
    if (isSubmitting || isCropping) return;
    resetForm();
    onClose?.();
  };

  const onCropComplete = useCallback((_, croppedPixels) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const finalizeCurrentCrop = async () => {
    if (!cropSrc || !croppedAreaPixels) {
      alert("No se pudo obtener el recorte. Intenta de nuevo.");
      return;
    }

    try {
      setIsCropping(true);

      const outFile = await getCroppedSquareFile({
        imageSrc: cropSrc,
        cropPixels: croppedAreaPixels,
        originalName: cropSrcName,
      });

      // Agregar al listado final
      setFiles((prev) => [...prev, outFile]);
      const prevUrl = URL.createObjectURL(outFile);
      setPreviews((prev) => [...prev, prevUrl]);

      // siguiente en cola
      const next = cropIndex + 1;
      if (next < cropQueue.length) {
        setCropIndex(next);
      } else {
        // terminar
        setCropOpen(false);
        setCropSrc("");
        setCropQueue([]);
        setCropIndex(0);
      }
    } catch (err) {
      alert(err?.message || "No se pudo recortar la imagen.");
    } finally {
      setIsCropping(false);
    }
  };

  const cancelCropAll = () => {
    if (isCropping) return;
    // Cancelar cola actual sin agregar nada más
    setCropOpen(false);
    setCropSrc("");
    setCropQueue([]);
    setCropIndex(0);
    setCroppedAreaPixels(null);
  };

  // ✅ seleccionar múltiples + máx 4 -> abrir crop por cada una
  const handleFileChange = async (e) => {
    const selectedFiles = Array.from(e.target.files || []).filter(Boolean);
    e.target.value = "";

    if (!selectedFiles.length) return;

    if (selectedFiles.length + files.length > MAX_FILES) {
      alert(`Solo puedes subir un máximo de ${MAX_FILES} fotos por publicación.`);
      return;
    }

    // Validaciones rápidas
    for (const f of selectedFiles) {
      if (!f?.type?.startsWith("image/")) {
        alert("Solo se permiten imágenes.");
        return;
      }
      if (f.size > MAX_ORIGINAL_MB * 1024 * 1024) {
        alert(`La imagen "${f.name}" pesa ${bytesToMB(f.size)}MB. Máximo permitido: ${MAX_ORIGINAL_MB}MB.`);
        return;
      }
    }

    // Encolar para recorte individual
    setCropQueue(selectedFiles);
    setCropIndex(0);
  };

  const removePhoto = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => {
      const copy = [...prev];
      const removed = copy.splice(index, 1);
      cleanupPreviews(removed);
      return copy;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting || isCropping || cropOpen) return;

    if (!user) return alert("Debes iniciar sesión para publicar.");
    if (!files.length) return alert("Sube al menos 1 foto del artículo.");
    if (!formData.title.trim()) return alert("Escribe un título.");
    if (!formData.city) return alert("Selecciona una ciudad.");
    if (!formData.locality) return alert("Selecciona una localidad.");
    if (!formData.category) return alert("Selecciona una categoría.");
    if (!formData.subcategory) return alert("Selecciona una subcategoría.");

    const modeNorm3 = normalizeMode(formData.mode);

    if (modeNorm3 === "venta") {
      const p = Number(formData.price);

      if (!Number.isFinite(p) || p <= 0) {
        alert("Ingresa un precio válido (mayor a 0).");
        return;
      }

      if (p > MAX_VENTA_COP) {
        alert(
          `Tope de venta: $${MAX_VENTA_COP.toLocaleString("es-CO")} COP.\n\n` +
            "Esta plataforma es más social que comercial. Para ventas mayores te recomendamos Marketplace o Mercado Libre."
        );
        return;
      }
    }

    // ✅ Validar que la descripción no tenga datos de contacto
    const contactError = detectContactoProhibido(formData.description);
    if (contactError) {
      setDescError(contactError);
      return;
    }

    setIsSubmitting(true);

    try {
      const featured = !!formData.isFeatured;

      const formDataES = {
        titulo: formData.title,
        categoria: formData.category,
        subcategoria: formData.subcategory,
        tipo: modeNorm3,
        precio: modeNorm3 === "venta" && formData.price ? Number(formData.price) : null,
        ciudad: formData.city,
        localidad_es: formData.locality,
        descripcion: formData.description,
        estado_producto: Number(formData.conditionScore) || 8,
        // ✅ Destacado / Featured (compatibilidad de columnas)
        destacado: featured,
        is_featured: featured,
        isFeatured: featured,
      };

      const formDataEN = {
        title: formData.title,
        category: formData.category,
        subcategory: formData.subcategory,
        mode: modeNorm3,
        price: modeNorm3 === "venta" && formData.price ? Number(formData.price) : null,
        city: formData.city,
        locality: formData.locality,
        description: formData.description,
        estado_producto: Number(formData.conditionScore) || 8,
        // ✅ Destacado / Featured (compatibilidad de columnas)
        destacado: featured,
        is_featured: featured,
        isFeatured: featured,
      };

      const res = await publishArticle({
        formData: { ...formDataEN, ...formDataES },
        files, // ✅ ya van recortadas 800x800 webp
        user,
      });

      if (!res?.success) {
        alert("Error: " + (res?.error || "No se pudo publicar"));
        return;
      }

      alert("¡Artículo publicado con éxito!");
      onPublish?.(res.data);
      resetForm();
      onClose?.();
    } catch (err) {
      console.error("Publish error:", err);
      alert("No se pudo publicar. Revisa la consola.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl animate-in zoom-in duration-200">
          <div className="p-4 border-b flex justify-between items-center bg-smoke-white">
            <h2 className="font-black text-gray-800 uppercase text-sm tracking-widest">Subir nuevo artículo</h2>
            <button
              onClick={handleClose}
              className="p-1 hover:bg-gray-200 rounded-full transition"
              disabled={isSubmitting || isCropping}
              type="button"
            >
              <X size={20} />
            </button>
          </div>

          <form className="p-8 space-y-4 max-h-[80vh] overflow-y-auto" onSubmit={handleSubmit}>
            {/* FOTOS */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-gray-400">
                Fotos (Máx {MAX_FILES}) — se recortan a cuadrado {OUT_SIZE}x{OUT_SIZE} ({OUT_FORMAT})
              </label>

              <div className="grid grid-cols-4 gap-2">
                {previews.map((src, index) => (
                  <div key={index} className="relative h-20 w-full bg-gray-100 rounded-xl overflow-hidden shadow-inner group">
                    <img src={src} alt={`Preview ${index + 1}`} className="w-full h-full object-cover" />

                    <button
                      type="button"
                      onClick={() => removePhoto(index)}
                      disabled={isSubmitting || isCropping}
                      className="absolute top-1 right-1 p-1 rounded-lg bg-black/50 text-white opacity-0 group-hover:opacity-100 transition disabled:opacity-40"
                      title="Quitar foto"
                      aria-label="Quitar foto"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}

                {files.length < MAX_FILES && (
                  <label className="h-20 flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50 transition">
                    <span className="text-xl text-gray-400">+</span>
                    <input
                      type="file"
                      multiple
                      onChange={handleFileChange}
                      className="hidden"
                      accept="image/*"
                      disabled={isSubmitting || isCropping}
                    />
                  </label>
                )}
              </div>
            </div>

            {/* Título */}
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">¿Qué quieres publicar?</label>
              <input
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                type="text"
                placeholder="Ej: Licuadora funcionando / repuestos..."
                className="w-full border-2 border-gray-100 rounded-xl p-3 outline-none focus:border-forest-green"
                disabled={isSubmitting || isCropping || cropOpen}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Categoría (macro) */}
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Categoría</label>
                <select
                  value={formData.category}
                  onChange={(e) => {
                    const nextCategory = e.target.value;
                    const subs = getSubsForCategory(CATEGORY_TREE, nextCategory);
                    setFormData((prev) => ({
                      ...prev,
                      category: nextCategory,
                      subcategory: subs[0] || "",
                    }));
                  }}
                  className="w-full border-2 border-gray-100 rounded-xl p-3 outline-none"
                  disabled={isSubmitting || isCropping || cropOpen}
                >
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Subcategoría */}
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Subcategoría</label>
                <select
                  value={formData.subcategory}
                  onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
                  className="w-full border-2 border-gray-100 rounded-xl p-3 outline-none"
                  disabled={isSubmitting || isCropping || cropOpen}
                >
                  {subOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Modo + precio */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Tipo</label>
                <select
                  value={formData.mode}
                  onChange={(e) => {
                    const m = normalizeMode(e.target.value);
                    setFormData((prev) => ({ ...prev, mode: m, price: m === "venta" ? prev.price : "" }));
                  }}
                  className="w-full border-2 border-gray-100 rounded-xl p-3 outline-none"
                  disabled={isSubmitting || isCropping || cropOpen}
                >
                  <option value="donacion">Donación</option>
                  <option value="venta">Venta</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Precio (solo si es venta)</label>
                <input
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  type="number"
                  placeholder="Ej: 20000"
                  className={`w-full border-2 rounded-xl p-3 outline-none ${
                    exceedsMaxVenta ? "border-red-300" : "border-gray-100"
                  }`}
                  disabled={isSubmitting || isCropping || cropOpen || normalizeMode(formData.mode) !== "venta"}
                />
                {exceedsMaxVenta && (
                  <p className="text-[11px] mt-1 text-red-600">Tope: ${MAX_VENTA_COP.toLocaleString("es-CO")} COP</p>
                )}
              </div>
            </div>

            {/* ✅ NUEVO: Destacado */}
            <div className="border-2 border-orange-400 rounded-2xl p-4 bg-orange-50/40">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Destacado</p>
                  <p className="mt-1 text-sm font-black text-gray-900">Mostrar en “Artículos destacados”</p>
                  <p className="mt-1 text-[12px] text-gray-600 font-medium">
                    Por ahora es gratis. Luego aquí conectamos el pago.
                  </p>
                </div>

                <label className="shrink-0 inline-flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!!formData.isFeatured}
                    onChange={(e) => setFormData((prev) => ({ ...prev, isFeatured: !!e.target.checked }))}
                    className="h-5 w-5 accent-forest-green"
                    disabled={isSubmitting || isCropping || cropOpen}
                    aria-label="Marcar como destacado"
                  />
                  <span className="text-[12px] font-black text-gray-700">Destacar</span>
                </label>
              </div>
            </div>

            {/* Ciudad / localidad */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Ciudad</label>
                <select
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value, locality: "" })}
                  className="w-full border-2 border-gray-100 rounded-xl p-3 outline-none"
                  disabled={isSubmitting || isCropping || cropOpen}
                >
                  <option value="">Selecciona...</option>
                  {Object.keys(LOCATIONS).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Localidad</label>
                <select
                  value={formData.locality}
                  onChange={(e) => setFormData({ ...formData, locality: e.target.value })}
                  className="w-full border-2 border-gray-100 rounded-xl p-3 outline-none"
                  disabled={isSubmitting || isCropping || cropOpen || !formData.city}
                >
                  <option value="">Selecciona...</option>
                  {localities.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Condición */}
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Estado del producto (1-10)</label>
              <input
                type="range"
                min="1"
                max="10"
                value={formData.conditionScore}
                onChange={(e) => setFormData({ ...formData, conditionScore: Number(e.target.value) })}
                className="w-full"
                disabled={isSubmitting || isCropping || cropOpen}
              />
              {(() => {
                const meta = conditionMeta(formData.conditionScore);
                return (
                  <div className={`inline-flex items-center px-2 py-1 border rounded-lg text-xs ${meta.cls}`}>
                    {meta.label} ({formData.conditionScore}/10)
                  </div>
                );
              })()}
            </div>

            {/* Descripción */}
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Descripción</label>
              <p className="mb-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 font-medium leading-snug">
                🔒 <strong>No incluyas datos de contacto</strong> (teléfonos, correos, redes sociales). Esto es por tu seguridad y la de la comunidad. Tu cuenta podría ser bloqueada.
              </p>
              <textarea
                value={formData.description}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData({ ...formData, description: val });
                  setDescError(detectContactoProhibido(val));
                }}
                placeholder="Describe el artículo, estado, detalles..."
                className={`w-full border-2 rounded-xl p-3 outline-none min-h-[110px] ${
                  descError ? "border-red-400 focus:ring-2 focus:ring-red-300" : "border-gray-100"
                }`}
                disabled={isSubmitting || isCropping || cropOpen}
              />
              {descError && (
                <p className="mt-1 text-xs font-bold text-red-600 flex items-start gap-1">
                  <span>⛔</span>
                  <span>{descError}</span>
                </p>
              )}
            </div>

            {/* Botón publicar */}
            <button
              type="submit"
              disabled={isSubmitting || isCropping || cropOpen}
              className="w-full py-3 rounded-xl font-black uppercase tracking-widest bg-forest-green text-white hover:opacity-90 disabled:opacity-50"
            >
              {isSubmitting ? "Publicando..." : "Publicar"}
            </button>
          </form>
        </div>
      </div>

      {/* ===== Crop Modal ===== */}
      {cropOpen && (
        <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-3xl overflow-hidden shadow-2xl">
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <div className="font-black text-gray-800 uppercase text-sm tracking-widest">Recorta tu foto</div>
                <div className="text-xs text-gray-500">Cuadrado 1:1 • mueve la foto y usa zoom</div>
              </div>
              <button
                type="button"
                onClick={cancelCropAll}
                disabled={isCropping}
                className="p-1 hover:bg-gray-200 rounded-full transition disabled:opacity-40"
                title="Cancelar"
              >
                <X size={20} />
              </button>
            </div>

            <div className="relative w-full h-[420px] bg-black">
              <Cropper
                image={cropSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
                objectFit="horizontal-cover"
              />
            </div>

            <div className="p-4 space-y-3">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Zoom</label>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full"
                  disabled={isCropping}
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={cancelCropAll}
                  disabled={isCropping}
                  className="flex-1 py-3 rounded-xl font-black uppercase tracking-widest border-2 border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={finalizeCurrentCrop}
                  disabled={isCropping}
                  className="flex-1 py-3 rounded-xl font-black uppercase tracking-widest bg-forest-green text-white hover:opacity-90 disabled:opacity-50"
                >
                  {isCropping ? "Procesando..." : "Usar recorte"}
                </button>
              </div>

              <div className="text-[11px] text-gray-500">
                Foto {Math.min(cropIndex + 1, cropQueue.length)} de {cropQueue.length}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
