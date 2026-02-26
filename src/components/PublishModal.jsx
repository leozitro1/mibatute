// src/components/PublishModal.jsx
import { useEffect, useMemo, useState } from "react";
import { X, Trash2 } from "lucide-react";
import { LOCATIONS } from "../data/locations";
import { publishArticle } from "../supabase/articleService";

/**
 * ✅ fallback por si NO llega props.categories
 * (pero en tu App.jsx ya lo estamos pasando)
 */
const FALLBACK_CATEGORY_TREE = [
  {
    key: "Hogar & Muebles",
    icon: "🌿",
    subs: ["Muebles", "Decoración", "Electrodomésticos", "Colchones", "Cocina"],
  },
  {
    key: "Electrónica & Tecnología",
    icon: "⚡",
    subs: ["Celulares", "Computadores", "Televisores", "Repuestos", "Chatarra electrónica"],
  },
  {
    key: "Construcción & Herramientas",
    icon: "🧱",
    subs: ["Materiales", "Herramientas", "Oficios", "Madera", "Metales"],
  },
  {
    key: "Ropa & Textiles",
    icon: "👕",
    subs: ["Ropa", "Retazos", "Telas", "Uniformes"],
  },
  {
    key: "Reciclaje & Reutilización",
    icon: "🔄",
    subs: ["Plásticos", "Vidrio", "Cartón", "Materias primas"],
  },
  {
    key: "Infantil & Juguetes",
    icon: "🧸",
    subs: ["Juguetes", "Ropa infantil", "Coches y sillas", "Lactancia", "Escolar"],
  },
  {
    key: "Deportes & Movilidad",
    icon: "🚲",
    subs: ["Bicicletas", "Patines", "Gimnasio", "Autopartes", "Motos"],
  },
  {
    key: "Libros & Educación",
    icon: "📚",
    subs: ["Libros", "Cuadernos y útiles", "Cursos y material", "Tecnología educativa", "Instrumentos"],
  },
  {
    key: "Mascotas",
    icon: "🐶",
    subs: ["Accesorios", "Alimento", "Camas y casas", "Salud", "Juguetes"],
  },
  {
    key: "Antigüedades & Coleccionables",
    icon: "🕰",
    subs: ["Monedas", "Relojes", "Arte", "Coleccionables", "Vintage"],
  },
];

// ✅ regla social: tope máximo para ventas
const MAX_VENTA_COP = 500000;

function conditionMeta(raw) {
  const v = Math.max(1, Math.min(10, Number(raw) || 1));
  if (v <= 3) return { label: "Muy deteriorado", cls: "bg-red-50 text-red-700 border-red-200" };
  if (v <= 6) return { label: "Uso medio", cls: "bg-yellow-50 text-yellow-800 border-yellow-200" };
  if (v <= 8) return { label: "Buen estado", cls: "bg-green-50 text-green-700 border-green-200" };
  return { label: "Casi nuevo", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
}

// ====== ESTÁNDAR IMÁGENES (cliente) ======
const MAX_FILES = 4;
const MAX_ORIGINAL_MB = 8; // rechazar originales exagerados
const MAX_SIDE = 1600; // lado mayor
const OUT_FORMAT = "image/webp"; // o "image/jpeg"
const OUT_QUALITY = 0.82; // 0.75–0.85 suele quedar muy bien

function bytesToMB(b) {
  return Math.round((b / (1024 * 1024)) * 100) / 100;
}

async function fileToImageBitmap(file) {
  // Respeta orientación EXIF en navegadores modernos
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {}
    return await createImageBitmap(file);
  }

  // Fallback
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function compressAndResizeImage(file) {
  // 1) Rechazo por peso original
  if (file.size > MAX_ORIGINAL_MB * 1024 * 1024) {
    throw new Error(`La imagen pesa ${bytesToMB(file.size)}MB. Máximo permitido: ${MAX_ORIGINAL_MB}MB.`);
  }

  // 2) Cargar imagen
  const src = await fileToImageBitmap(file);
  const w = src.width;
  const h = src.height;

  // 3) Calcular escala (mantiene proporción)
  const maxDim = Math.max(w, h);
  const scale = maxDim > MAX_SIDE ? MAX_SIDE / maxDim : 1;

  const outW = Math.max(1, Math.round(w * scale));
  const outH = Math.max(1, Math.round(h * scale));

  // 4) Dibujar en canvas
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;

  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("No se pudo preparar el canvas para procesar la imagen.");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, outW, outH);

  // 5) Exportar a WebP/JPEG
  const blob = await new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), OUT_FORMAT, OUT_QUALITY);
  });

  if (!blob) throw new Error("No se pudo procesar la imagen.");

  // 6) Crear nuevo File (con extensión coherente)
  const ext = OUT_FORMAT === "image/webp" ? "webp" : "jpg";
  const baseName = (file.name || "foto").replace(/\.[^.]+$/, "");
  const newName = `${baseName}.${ext}`;

  return new File([blob], newName, { type: OUT_FORMAT });
}

async function preprocessSelectedFiles(selectedFiles) {
  const out = [];
  for (const f of selectedFiles) {
    if (!f?.type?.startsWith("image/")) throw new Error("Solo se permiten imágenes.");
    const optimized = await compressAndResizeImage(f);
    out.push(optimized);
  }
  return out;
}

function normalizeMode(v) {
  const s = String(v || "").toLowerCase().trim();

  if (!s) return "donacion";

  // ✅ alias viejos -> unificado
  if (s === "regalo") return "donacion";
  if (s.includes("regal")) return "donacion";

  // ✅ soporta "donación", "donacion", "donación / regalo", etc.
  if (s.includes("don")) return "donacion";

  if (s.includes("venta")) return "venta";

  return "donacion";
}

function getSubsForCategory(categoryTree, category) {
  const found = (categoryTree || []).find((c) => String(c.key) === String(category));
  return Array.isArray(found?.subs) ? found.subs : [];
}

function getCategoryLabel(categoryTree, category) {
  const found = (categoryTree || []).find((c) => String(c.key) === String(category));
  if (!found) return String(category || "");
  const icon = found.icon ? `${found.icon} ` : "";
  return `${icon}${found.key}`;
}

export default function PublishModal({ isOpen, onClose, onPublish, currentCity, user, categories }) {
  const CATEGORY_TREE = Array.isArray(categories) && categories.length ? categories : FALLBACK_CATEGORY_TREE;
  const CATEGORY_OPTIONS = useMemo(() => CATEGORY_TREE.map((c) => c.key), [CATEGORY_TREE]);

  // ✅ defaults
  const defaultCategory = CATEGORY_OPTIONS[0] || "Hogar & Muebles";
  const defaultSub = getSubsForCategory(CATEGORY_TREE, defaultCategory)[0] || "";

  // ✅ Unificado: donacion/regalo => "donacion"
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
  });

  // ✅ Múltiples fotos
  const [files, setFiles] = useState([]); // File[]
  const [previews, setPreviews] = useState([]); // string[]
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ✅ validar tope venta (UI)
  const modeNorm = normalizeMode(formData.mode);
  const priceNumber = Number(formData.price);
  const isVenta = modeNorm === "venta";
  const isPriceNumberValid = Number.isFinite(priceNumber) && priceNumber > 0;
  const exceedsMaxVenta = isVenta && isPriceNumberValid && priceNumber > MAX_VENTA_COP;

  // ✅ limpiar previews (objectURL)
  const cleanupPreviews = (urls = []) => {
    (urls || []).forEach((u) => {
      try {
        URL.revokeObjectURL(u);
      } catch {}
    });
  };

  useEffect(() => {
    if (!isOpen) return;

    setFormData((prev) => {
      const modeNorm2 = normalizeMode(prev.mode);

      // ✅ asegurar category/subcategory válidas
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
        // ✅ si no es venta, limpia price para evitar "precio pegado"
        price: modeNorm2 === "venta" ? prev.price : "",
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

  // ✅ Si cambia categoría, ajustar subcategory automáticamente
  useEffect(() => {
    if (!isOpen) return;
    setFormData((prev) => {
      const subs = getSubsForCategory(CATEGORY_TREE, prev.category);
      const safeSub = subs.includes(prev.subcategory) ? prev.subcategory : subs[0] || "";
      if (safeSub === prev.subcategory) return prev;
      return { ...prev, subcategory: safeSub };
    });
  }, [isOpen, formData.category, CATEGORY_TREE]);

  if (!isOpen) return null;

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
    });

    cleanupPreviews(previews);
    setPreviews([]);
    setFiles([]);
  };

  const handleClose = () => {
    if (isSubmitting) return;
    resetForm();
    onClose?.();
  };

  // ✅ seleccionar múltiples + máx 4 + NORMALIZAR IMÁGENES (resize+compress)
  const handleFileChange = async (e) => {
    const selectedFiles = Array.from(e.target.files || []).filter(Boolean);

    if (selectedFiles.length + files.length > MAX_FILES) {
      alert(`Solo puedes subir un máximo de ${MAX_FILES} fotos por publicación.`);
      e.target.value = "";
      return;
    }

    try {
      setIsSubmitting(true); // bloquea UI mientras procesa
      const optimizedFiles = await preprocessSelectedFiles(selectedFiles);

      setFiles((prev) => [...prev, ...optimizedFiles]);

      const newPreviews = optimizedFiles.map((file) => URL.createObjectURL(file));
      setPreviews((prev) => [...prev, ...newPreviews]);
    } catch (err) {
      alert(err?.message || "No se pudo procesar la imagen.");
    } finally {
      setIsSubmitting(false);
      e.target.value = "";
    }
  };

  // ✅ quitar una foto antes de publicar (mejora UX)
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
    if (isSubmitting) return;

    if (!user) return alert("Debes iniciar sesión para publicar.");
    if (!files.length) return alert("Sube al menos 1 foto del artículo.");
    if (!formData.title.trim()) return alert("Escribe un título.");
    if (!formData.city) return alert("Selecciona una ciudad.");
    if (!formData.locality) return alert("Selecciona una localidad.");
    if (!formData.category) return alert("Selecciona una categoría.");
    if (!formData.subcategory) return alert("Selecciona una subcategoría.");

    const modeNorm3 = normalizeMode(formData.mode);

    // ✅ si es venta, exigir precio + tope social
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

    setIsSubmitting(true);

    try {
      // ✅ Payload ES + EN
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
      };

      const res = await publishArticle({
        formData: { ...formDataEN, ...formDataES },
        files, // ✅ ya van normalizadas (webp + max 1600px)
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

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl animate-in zoom-in duration-200">
        <div className="p-4 border-b flex justify-between items-center bg-smoke-white">
          <h2 className="font-black text-gray-800 uppercase text-sm tracking-widest">Subir nuevo artículo</h2>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-gray-200 rounded-full transition"
            disabled={isSubmitting}
            type="button"
          >
            <X size={20} />
          </button>
        </div>

        <form className="p-8 space-y-4 max-h-[80vh] overflow-y-auto" onSubmit={handleSubmit}>
          {/* FOTOS */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-gray-400">
              Fotos (Máx {MAX_FILES}) — se optimizan automáticamente (max {MAX_SIDE}px, {OUT_FORMAT})
            </label>

            <div className="grid grid-cols-4 gap-2">
              {previews.map((src, index) => (
                <div key={index} className="relative h-20 w-full bg-gray-100 rounded-xl overflow-hidden shadow-inner group">
                  <img src={src} alt={`Preview ${index + 1}`} className="w-full h-full object-cover" />

                  <button
                    type="button"
                    onClick={() => removePhoto(index)}
                    disabled={isSubmitting}
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
                    disabled={isSubmitting}
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
              disabled={isSubmitting}
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
                disabled={isSubmitting}
              >
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {getCategoryLabel(CATEGORY_TREE, c)}
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
                className="w-full border-2 border-gray-100 rounded-xl p-3 outline-none disabled:bg-gray-100 disabled:text-gray-400"
                disabled={!formData.category || isSubmitting}
              >
                {subOptions.length ? null : (
                  <option value="" disabled>
                    Sin subcategorías
                  </option>
                )}
                {subOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Tipo */}
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Tipo</label>
              <select
                value={normalizeMode(formData.mode)}
                onChange={(e) => {
                  const next = normalizeMode(e.target.value);
                  setFormData((prev) => ({
                    ...prev,
                    mode: next,
                    price: next === "venta" ? prev.price : "",
                  }));
                }}
                className="w-full border-2 border-gray-100 rounded-xl p-3 outline-none"
                disabled={isSubmitting}
              >
                <option value="donacion">Donación / Regalo</option>
                <option value="venta">Venta</option>
              </select>
            </div>

            {/* Precio (solo venta) */}
            <div className="min-h-[1px]">
              {normalizeMode(formData.mode) === "venta" ? (
                <>
                  <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Precio (COP)</label>
                  <input
                    type="number"
                    min="1"
                    max={MAX_VENTA_COP}
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="0"
                    className={`w-full border-2 rounded-xl p-3 outline-none focus:border-forest-green ${
                      exceedsMaxVenta ? "border-red-300" : "border-gray-100"
                    }`}
                    disabled={isSubmitting}
                  />

                  <p className={`mt-2 text-[11px] font-bold ${exceedsMaxVenta ? "text-red-600" : "text-gray-400"}`}>
                    Tope de venta: ${MAX_VENTA_COP.toLocaleString("es-CO")} COP. Si es más costoso, usa Marketplace o
                    Mercado Libre.
                  </p>
                </>
              ) : (
                <div className="h-full" />
              )}
            </div>
          </div>

          {/* Ubicación */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Ciudad</label>
              <select
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value, locality: "" })}
                className="w-full border-2 border-gray-100 rounded-xl p-3 outline-none"
                disabled={isSubmitting}
                required
              >
                <option value="" disabled>
                  Selecciona una...
                </option>
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
                required
                value={formData.locality}
                onChange={(e) => setFormData({ ...formData, locality: e.target.value })}
                className="w-full border-2 border-gray-100 rounded-xl p-3 outline-none disabled:bg-gray-100 disabled:text-gray-400"
                disabled={!formData.city || isSubmitting}
              >
                <option value="" disabled>
                  Selecciona una...
                </option>
                {localities.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Descripción */}
          <div>
          {/* Estado del producto */}
            <div className="mb-3">
              <div className="flex items-center justify-between gap-3 mb-2">
                <label className="block text-[10px] font-black text-gray-400 uppercase">
                  Estado del producto
                </label>
                <div
                  className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-[11px] font-black ${conditionMeta(formData.conditionScore).cls}`}
                  title="1 = muy mal estado, 10 = casi nuevo"
                >
                  <span aria-hidden>⭐</span>
                  <span>{(Number(formData.conditionScore) || 8)}/10</span>
                  <span className="font-extrabold opacity-80">
                    {conditionMeta(formData.conditionScore).label}
                  </span>
                </div>
              </div>

              <input
                type="range"
                min="1"
                max="10"
                step="1"
                value={Number(formData.conditionScore) || 8}
                onChange={(e) =>
                  setFormData({ ...formData, conditionScore: Number(e.target.value) })
                }
                className="w-full"
                disabled={isSubmitting}
              />

              <div className="flex justify-between text-[10px] font-black text-gray-400 mt-1 select-none">
                <span>1</span>
                <span>5</span>
                <span>10</span>
              </div>
            </div>

            <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Descripción (opcional)</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              placeholder="Agrega un detalle útil: estado, medidas, condiciones..."
              className="w-full border-2 border-gray-100 rounded-xl p-3 outline-none focus:border-forest-green resize-none"
              disabled={isSubmitting}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting || exceedsMaxVenta}
            className={`w-full py-4 rounded-2xl font-black uppercase text-sm transition mt-4 ${
              isSubmitting || exceedsMaxVenta
                ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                : "bg-forest-green text-white hover:shadow-lg"
            }`}
            title={
              exceedsMaxVenta
                ? `El precio supera el tope de $${MAX_VENTA_COP.toLocaleString("es-CO")} COP`
                : "Publicar"
            }
          >
            {isSubmitting ? "Publicando..." : exceedsMaxVenta ? "Precio supera el tope" : "Publicar Artículo"}
          </button>
        </form>
      </div>
    </div>
  );
}
