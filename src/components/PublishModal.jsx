// src/components/PublishModal.jsx
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { X, Trash2 } from "lucide-react";
import Cropper from "react-easy-crop";
import { supabase } from "../supabase/supabaseClient";
import { publicationStatus } from "../supabase/publicationCredits.js";
import { publishArticle } from "../supabase/articleService";
import ArticleFields from "./ArticleFields";
import { detectContactoProhibido } from "./articleValidation";

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


function normalizeMode(v) {
  const s = String(v || "").toLowerCase().trim();
  if (!s) return "donacion";
  if (s === "regalo") return "donacion";
  if (s.includes("regal")) return "donacion";
  if (s.includes("don")) return "donacion";
  if (s.includes("venta")) return "venta";
  return "donacion";
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
  });

  // ✅ Fotos finales (YA recortadas 800x800 webp)
  const [files, setFiles] = useState([]); // File[]
  const [previews, setPreviews] = useState([]); // string[]
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [publicationLimit, setPublicationLimit] = useState(null);
  const [limitError, setLimitError] = useState('');
  const [usePublicationCredit, setUsePublicationCredit] = useState(false);
  const publicationRequest = useRef(null);
  const publicationSubmitLock = useRef(false);
  useEffect(() => {
    if (!isOpen || !user?.id) return;
    let active = true;
    publicationRequest.current = crypto.randomUUID();
    Promise.resolve().then(() => { if (active) { setPublicationLimit(null); setLimitError(''); setUsePublicationCredit(false); } });
    publicationStatus(supabase).then(status => { if (active) setPublicationLimit(status); })
      .catch(error => { if (active) setLimitError(error.message); });
    return () => { active = false; };
  }, [isOpen, user?.id]);


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
        } catch { /* Preview may already have been released. */ }
      }, 0);
    }
    prevCropSrcRef.current = cropSrc || null;

    return () => {
      // al desmontar, revoca el actual también
      if (cropSrc) {
        try {
          URL.revokeObjectURL(cropSrc);
        } catch { /* Preview may already have been released. */ }
      }
    };
  }, [cropSrc]);

  const [cropSrcName, setCropSrcName] = useState("foto");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [isCropping, setIsCropping] = useState(false);


  const cleanupPreviews = (urls = []) => {
    (urls || []).forEach((u) => {
      try {
        URL.revokeObjectURL(u);
      } catch { /* Preview may already have been released. */ }
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
      };
    });

    setIsSubmitting(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCity, isOpen]);


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
    if (publicationSubmitLock.current || isSubmitting || isCropping || cropOpen) return;

    if (!user) return alert("Debes iniciar sesión para publicar.");
    if (!user?.email_confirmed_at) return alert("Debes verificar tu correo electrónico antes de publicar.\n\nRevisa tu bandeja de entrada y haz clic en el enlace de confirmación.");
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

    if (limitError || !publicationLimit) return alert(limitError || 'Espera mientras comprobamos tus publicaciones.');
    if (modeNorm3 === 'venta' && publicationLimit.requiresCredit && !usePublicationCredit) {
      return alert('Confirma el uso de 1 crédito para una venta adicional o finaliza otra venta para liberar un espacio gratuito.');
    }
    if (modeNorm3 === 'venta' && publicationLimit.requiresCredit && publicationLimit.balance < 1) {
      return alert('No tienes créditos suficientes. Finaliza una venta para liberar un espacio gratuito.');
    }

    // ✅ Validar que la descripción no tenga datos de contacto
    const contactError = detectContactoProhibido(formData.description);
    if (contactError) {
      return;
    }

    publicationSubmitLock.current = true;
    setIsSubmitting(true);

    try {

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
        is_featured: false,
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
        is_featured: false,
      };

      const res = await publishArticle({
        formData: { ...formDataEN, ...formDataES },
        files, // ✅ ya van recortadas 800x800 webp
        user,
        requestId: publicationRequest.current,
        useCredit: modeNorm3 === "venta" && usePublicationCredit,
      });

      if (!res?.success) {
        if (['PUBLICATION_CREDIT_REQUIRED','INSUFFICIENT_CREDITS'].includes(res?.code)) {
          setPublicationLimit(res); setUsePublicationCredit(false);
        }
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
      publicationSubmitLock.current = false;
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="marketplace-overlay fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
        <div role="dialog" aria-modal="true" aria-label="Publicar artículo" className="marketplace-surface marketplace-modal publish-article-dialog bg-white rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl animate-in zoom-in duration-200">
          <div className="marketplace-modal-header p-4 border-b flex justify-between items-center bg-smoke-white">
            <h2 className="font-black text-gray-800 uppercase text-sm tracking-widest">Subir nuevo artículo</h2>
            <button
              onClick={handleClose}
              aria-label="Cerrar publicación nueva" className="p-1 hover:bg-gray-200 rounded-full transition"
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
                Fotos (máximo {MAX_FILES})
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

            <ArticleFields formData={formData} setFormData={setFormData} categories={CATEGORY_TREE}
              disabled={isSubmitting || isCropping || cropOpen} />

            <div className="rounded-xl border border-[#dfe7d9] bg-[#f3f6f0] p-4 text-sm text-gray-600" aria-live="polite">
              {limitError ? <p role="alert">{limitError}</p> : !publicationLimit ? <p>Comprobando tus publicaciones…</p> : normalizeMode(formData.mode) !== 'venta' ? <p>Publicar una donación es gratis. Destacarla después es opcional y requiere 1 crédito.</p> : <>
                <p>Tienes <strong>{publicationLimit.active} ventas activas</strong>. Hasta 3 al mismo tiempo son gratis; las pausadas y reservadas también ocupan espacio.</p>
                {publicationLimit.requiresCredit ? <>
                  <p className="mt-2">Esta publicación adicional requiere <strong>1 crédito</strong> (valor individual: $2.500 COP). Saldo: {publicationLimit.balance}.</p>
                  {publicationLimit.balance > 0 ? <label className="mt-3 flex items-start gap-2"><input type="checkbox" checked={usePublicationCredit} onChange={event=>setUsePublicationCredit(event.target.checked)} disabled={isSubmitting}/><span>Confirmo usar 1 crédito para publicar esta venta adicional. Destacarla requiere otro crédito.</span></label> : <p className="mt-2">Sin créditos disponibles. Puedes finalizar una venta para liberar un espacio gratuito. Las recargas aún no están habilitadas.</p>}
                </> : <p className="mt-2">Esta publicación es gratis. Si eliges destacar después, se cobra 1 crédito aparte.</p>}
              </>}
            </div>

            {/* Botón publicar */}
            <button
              type="submit"
              disabled={isSubmitting || isCropping || cropOpen || !publicationLimit || !!limitError || (normalizeMode(formData.mode)==='venta' && publicationLimit.requiresCredit && (!usePublicationCredit || publicationLimit.balance<1))}
              className="w-full py-3 rounded-xl font-black uppercase tracking-widest bg-forest-green text-white hover:opacity-90 disabled:opacity-50"
            >
              {isSubmitting ? "Publicando..." : "Publicar"}
            </button>
          </form>
        </div>
      </div>

      {/* ===== Crop Modal ===== */}
      {cropOpen && (
        <div className="marketplace-overlay fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div role="dialog" aria-modal="true" aria-label="Recortar foto" className="marketplace-surface marketplace-modal photo-crop-dialog bg-white w-full max-w-xl rounded-3xl overflow-hidden shadow-2xl">
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
