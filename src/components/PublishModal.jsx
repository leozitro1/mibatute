// src/components/PublishModal.jsx
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { X, Trash2, Tag, Gift, Check, ArrowLeft, ArrowRight, Sparkles, Camera, Scan, ZoomOut, ZoomIn } from "lucide-react";
import Cropper from "react-easy-crop";
import { supabase } from "../supabase/supabaseClient";
import { publicationStatus, publicationQuote } from "../supabase/publicationCredits.js";
import { publishArticle } from "../supabase/articleService";
import { CATEGORY_TREE as FALLBACK_CATEGORY_TREE } from "../data/categories.js";
import useLocations from "../data/useLocations.js";
import ArticleFields from "./ArticleFields";
import PhotoOrderControls from "./PhotoOrderControls.jsx";
import { movePhoto } from "./photoOrder.js";
import { PUBLICATION_STEPS, publicationStepError } from "./publicationSteps.js";
import "./PublishModal.css";
import { notifyCreditBalance } from "./creditBalance.js";
import { photoFitZoom, photoCropDrawRect } from "./photoCropGeometry.js";
import { detectContactoProhibido } from "./articleValidation";

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

  ctx.fillStyle = "#f3f4f6";
  ctx.fillRect(0,0,OUT_SIZE,OUT_SIZE);
  ctx.drawImage(image,...photoCropDrawRect({width:image.naturalWidth,height:image.naturalHeight},cropPixels,OUT_SIZE));

  const blob = await new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), OUT_FORMAT, OUT_QUALITY);
  });

  if (!blob) throw new Error("No se pudo generar la imagen recortada.");
  return blobToFile(blob, originalName);
}

export default function PublishModal({ isOpen, onClose, onPublish, currentCity, user, categories }) {
  const { LOCATIONS } = useLocations();
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

  const [step,setStep] = useState(0);
  const [selectedMode,setSelectedMode] = useState(null);
  const [stepError,setStepError] = useState('');
  const wizardForm = useRef(null), stepHeading = useRef(null);
  useEffect(()=>{
    if(!isOpen)return;
    wizardForm.current?.scrollTo({top:0});
    stepHeading.current?.focus({preventScroll:true});
  },[step,isOpen]);
  const stepProblem = index => publicationStepError(index,{selectedMode,formData,files,categories:CATEGORY_TREE,locations:LOCATIONS});
  const goToStep = next => {setStepError('');setStep(next);};
  const advance = () => {const problem=stepProblem(step);if(problem){setStepError(problem);return;}goToStep(step+1);};

  // ✅ Fotos finales (YA recortadas 800x800 webp)
  const [files, setFiles] = useState([]); // File[]
  const [previews, setPreviews] = useState([]); // string[]
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [publicationLimit, setPublicationLimit] = useState(null);
  const [limitError, setLimitError] = useState('');
  const [usePublicationCredit, setUsePublicationCredit] = useState(false);
  const [featureOnPublish,setFeatureOnPublish] = useState(false);
  const quote = publicationQuote(publicationLimit,selectedMode,featureOnPublish);
  const publicationRequest = useRef(null);
  const publicationSubmitLock = useRef(false);
  useEffect(() => {
    if (!isOpen || !user?.id) return;
    let active = true;
    publicationRequest.current = crypto.randomUUID();
    Promise.resolve().then(() => { if (active) { setPublicationLimit(null); setLimitError(''); setUsePublicationCredit(false); setFeatureOnPublish(false); } });
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
  const [cropGeometry,setCropGeometry] = useState({media:null,box:null});
  const fitZoom = photoFitZoom(cropGeometry.media,cropGeometry.box);
  const minZoom = Math.min(1,fitZoom??1);
  const mediaLoaded = useCallback(media=>setCropGeometry(previous=>({...previous,media})),[]);
  const cropSizeChanged = useCallback(box=>setCropGeometry(previous=>({...previous,box})),[]);
  const fitPhoto = () => {if(fitZoom){setCrop({x:0,y:0});setZoom(fitZoom);}};
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
    setCropGeometry(previous=>({...previous,media:null}));
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
    setStep(0);setSelectedMode(null);setStepError('');setFeatureOnPublish(false);
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

  const reorderPhotos = (from,to) => {setFiles(previous=>movePhoto(previous,from,to));setPreviews(previous=>movePhoto(previous,from,to));};

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
    if(step<PUBLICATION_STEPS.length-1){advance();return;}
    for(let index=0;index<4;index++){
      const problem=stepProblem(index);
      if(problem){setStep(index);setStepError(problem);return;}
    }

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

    if(!quote.sufficient){setStepError('Revisa tu saldo o quita el destacado antes de publicar.');return;}

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
        feature: featureOnPublish,
      });

      if (!res?.success) {
        if (['PUBLICATION_CREDIT_REQUIRED','INSUFFICIENT_CREDITS'].includes(res?.code)) {
          setPublicationLimit(res); setUsePublicationCredit(false);
        }
        alert("Error: " + (res?.error || "No se pudo publicar"));
        return;
      }

      if(Number.isInteger(res.balance))notifyCreditBalance(user.id,res.balance);
      alert(res.data?.is_featured?"¡Artículo publicado y destacado con éxito!":"¡Artículo publicado con éxito!");
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
            <h2 className="font-black text-gray-800 uppercase text-sm tracking-widest">Publica tu artículo</h2>
            <button
              onClick={handleClose}
              aria-label="Cerrar publicación nueva" className="site-icon-close inline-flex items-center justify-center p-1 hover:bg-gray-200 rounded-full transition"
              disabled={isSubmitting || isCropping}
              type="button"
            >
              <X size={20} />
            </button>
          </div>

          <form ref={wizardForm} noValidate className="publish-wizard-form p-8 space-y-4 max-h-[80vh] overflow-y-auto" onSubmit={handleSubmit}>
            <ol className="publish-progress" aria-label="Pasos de publicación">{PUBLICATION_STEPS.map((item,index)=><li key={item.label} aria-current={step===index?'step':undefined} data-complete={step>index}><span>{step>index?<Check size={13} aria-hidden="true"/>:index+1}</span><small>{item.label}</small></li>)}</ol>
            <div className="publish-step-heading"><p>Paso {step+1} de {PUBLICATION_STEPS.length}</p><h3 ref={stepHeading} tabIndex={-1}>{PUBLICATION_STEPS[step].title}</h3><p>{PUBLICATION_STEPS[step].hint}</p></div>
            {stepError&&<p className="publish-step-error" role="alert">{stepError}</p>}
            {step===0&&<div className="publish-mode-options" role="group" aria-label="Tipo de publicación">
              <button type="button" aria-pressed={selectedMode==='venta'} onClick={()=>{setSelectedMode('venta');setFormData(previous=>({...previous,mode:'venta'}));setUsePublicationCredit(false);setStepError('');}}><Tag size={25} aria-hidden="true"/><strong>Venta</strong><span>Vende lo que ya no usas por un máximo de <b>$500.000 COP</b> por artículo.</span><small>Hasta 3 ventas activas gratis. Las adicionales requieren 1 crédito.</small><em>{selectedMode==='venta'?'Seleccionada':'Elegir venta'}</em></button>
              <button type="button" aria-pressed={selectedMode==='donacion'} onClick={()=>{setSelectedMode('donacion');setFormData(previous=>({...previous,mode:'donacion',price:''}));setUsePublicationCredit(false);setStepError('');}}><Gift size={25} aria-hidden="true"/><strong>Donación</strong><span>No botes lo que ya no usas: materiales sobrantes, electrodomésticos o herramientas dañadas, papel y más.</span><small>Aclara su estado: alguien puede repararlo o aprovecharlo. Publicar es gratis.</small><em>{selectedMode==='donacion'?'Seleccionada':'Elegir donación'}</em></button>
            </div>}
            {step===1&&<>
            {/* FOTOS */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-gray-400">
                Fotos (máximo {MAX_FILES})
              </label>

              <p className="publish-review-hint">Usa las flechas para cambiar el orden. La primera foto será la portada.</p>
              <div className="grid grid-cols-2 gap-3">
                {previews.map((src, index) => (
                  <div key={src} className="relative w-full bg-gray-100 rounded-xl overflow-hidden border border-gray-200 group">
                    <img src={src} alt={`Foto ${index+1}${index===0?' · Portada':''}`} className="w-full h-28 object-cover" />

                    <button
                      type="button"
                      onClick={() => removePhoto(index)}
                      disabled={isSubmitting || isCropping}
                      className="absolute top-1 right-1 p-1 rounded-lg bg-black/60 text-white transition disabled:opacity-40"
                      title="Quitar foto"
                      aria-label={`Quitar foto ${index+1}`}
                    >
                      <Trash2 size={14} />
                    </button>
                    <PhotoOrderControls index={index} count={previews.length} onMove={reorderPhotos} disabled={isSubmitting||isCropping||cropOpen}/>
                  </div>
                ))}

                {files.length < MAX_FILES && (
                  <label className="publish-add-photo min-h-40 flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50 transition">
                    <Camera size={22} aria-hidden="true"/><span className="text-xs">Agregar</span>
                    <input
                      type="file"
                      aria-label="Agregar fotos del artículo"
                      multiple
                      onChange={handleFileChange}
                      className="sr-only"
                      accept="image/*"
                      disabled={isSubmitting || isCropping}
                    />
                  </label>
                )}
              </div>
            </div>

            </>}
            {(step===2||step===3)&&<ArticleFields formData={formData} setFormData={setFormData} categories={CATEGORY_TREE} section={step===2?'details':'location'} hideMode lockMode disabled={isSubmitting || isCropping || cropOpen} />}
            {step===4&&<>
            <section className="publish-review" aria-label="Resumen de tu publicación">
              <div className="publish-review-photos">{previews.map((src,index)=><img key={src} src={src} alt={`Foto ${index+1} del artículo`}/>)}</div>
              <div className="publish-review-line"><span>{selectedMode==='venta'?'Venta':'Donación'}</span><button type="button" onClick={()=>goToStep(0)}>Cambiar tipo</button></div>
              <h4>{formData.title}</h4><strong className="publish-review-price">{selectedMode==='venta'?new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(formData.price)):'Gratis'}</strong>
              <dl><dt>Categoría</dt><dd>{formData.category} · {formData.subcategory}</dd><dt>Estado</dt><dd>{formData.conditionScore}/10</dd><dt>Ubicación</dt><dd>{formData.city}, {formData.locality}</dd></dl>
              <p className="publish-review-description">{formData.description}</p>
              <div className="publish-review-edit"><button type="button" onClick={()=>goToStep(1)}>Editar fotos</button><button type="button" onClick={()=>goToStep(2)}>Editar artículo</button><button type="button" onClick={()=>goToStep(3)}>Editar ubicación</button></div>
            </section>
            <div className="rounded-xl border border-[#dfe7d9] bg-[#f3f6f0] p-4 text-sm text-gray-600" aria-live="polite">
              {limitError ? <p role="alert">{limitError}</p> : !publicationLimit ? <p>Comprobando tus publicaciones…</p> : normalizeMode(formData.mode) !== 'venta' ? <p>Publicar una donación es gratis. Destacarla es opcional y requiere 1 crédito.</p> : <>
                <p>Tienes <strong>{publicationLimit.active} ventas activas</strong>. Hasta 3 al mismo tiempo son gratis; las pausadas y reservadas también ocupan espacio.</p>
                {publicationLimit.requiresCredit ? <>
                  <p className="mt-2">Esta publicación adicional requiere <strong>1 crédito</strong> (valor individual: $2.500 COP). Saldo: {publicationLimit.balance}.</p>
                  {publicationLimit.balance > 0 ? <label className="mt-3 flex items-start gap-2"><input type="checkbox" checked={usePublicationCredit} onChange={event=>setUsePublicationCredit(event.target.checked)} disabled={isSubmitting}/><span>Confirmo usar 1 crédito para publicar esta venta adicional. Destacarla requiere otro crédito.</span></label> : <p className="mt-2">Sin créditos disponibles. Puedes finalizar una venta para liberar un espacio gratuito. Puedes consultar las opciones de recarga en tu perfil.</p>}
                </> : <p className="mt-2">Esta publicación es gratis. El destacado es opcional y cuesta 1 crédito adicional.</p>}
              </>}
            </div>

            <aside className="publish-highlight-note"><Sparkles size={20} aria-hidden="true"/><div><strong>Dale más visibilidad a tu publicación</strong><p>Destacar cuesta <b>1 crédito ($2.500 COP)</b>, ayuda a promocionar tu artículo y a sostener MiBatute y sus funciones gratuitas. Es opcional y no garantiza ventas ni solicitudes.</p><button type="button" className="publish-feature-toggle" aria-pressed={featureOnPublish} disabled={!featureOnPublish&&(!quote.canAddFeature||!!limitError)} onClick={()=>{setFeatureOnPublish(value=>!value);setStepError('');}}>{featureOnPublish?<><Check size={16} aria-hidden="true"/>Destacado seleccionado · Quitar</>:<>Destacar por 1 crédito</>}</button>{!quote.canAddFeature&&!featureOnPublish&&publicationLimit&&<p>No tienes saldo suficiente para añadir el destacado. Puedes continuar sin seleccionarlo.</p>}</div></aside>
            <div className="publish-cost-summary" aria-live="polite"><span>Publicación: <b>{quote.publicationCost?'1 crédito':'Gratis'}</b></span><span>Destacado: <b>{featureOnPublish?'1 crédito':'No seleccionado'}</b></span><strong>Total al confirmar: {quote.total} {quote.total===1?'crédito':'créditos'}</strong><span>Saldo disponible: {quote.balance} {quote.balance===1?'crédito':'créditos'}</span>{featureOnPublish&&!quote.sufficient&&<p role="alert">Tu saldo no alcanza para ambas opciones. Quita el destacado o revisa tus créditos.</p>}</div>
            <p className="publish-review-hint">El costo indicado se descuenta al confirmar la publicación. Coordina la entrega y el pago por el chat, compartiendo solo lo necesario.</p>
            </>}
            <div className="publish-wizard-actions">
              {step>0&&<button type="button" className="publish-wizard-back" disabled={isSubmitting||isCropping||cropOpen} onClick={()=>goToStep(step-1)}><ArrowLeft size={16} aria-hidden="true"/>Atrás</button>}
              <button type="submit" className="publish-wizard-next bg-forest-green" disabled={isSubmitting||isCropping||cropOpen||(step===4&&(!publicationLimit||!!limitError||!quote.sufficient||(selectedMode==='venta'&&publicationLimit.requiresCredit&&(!usePublicationCredit||publicationLimit.balance<1))))}>{step===4?(isSubmitting?'Publicando…':featureOnPublish?`Publicar y destacar · ${quote.total} ${quote.total===1?'crédito':'créditos'}`:quote.publicationCost?'Publicar con 1 crédito':'Publicar gratis'):<>Continuar<ArrowRight size={16} aria-hidden="true"/></>}</button>
            </div>
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
                <div className="text-xs text-gray-500">Ajusta la foto completa o acerca para recortar</div>
              </div>
              <button
                type="button"
                onClick={cancelCropAll}
                disabled={isCropping}
                className="site-icon-close inline-flex items-center justify-center p-1 hover:bg-gray-200 rounded-full transition disabled:opacity-40"
                title="Cancelar"
              >
                <X size={20} />
              </button>
            </div>

            <div className="publish-crop-stage relative w-full bg-gray-100">
              <Cropper
                image={cropSrc}
                crop={crop}
                zoom={zoom}
                minZoom={minZoom}
                maxZoom={3}
                restrictPosition={false}
                onMediaLoaded={mediaLoaded}
                onCropSizeChange={cropSizeChanged}
                style={{containerStyle:{backgroundColor:"#f3f4f6"}}}
                aspect={1}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
                objectFit="horizontal-cover"
              />
            </div>

            <div className="p-4 space-y-3">
              <div className="publish-crop-tools"><button type="button" className="publish-fit-photo" onClick={fitPhoto} disabled={isCropping||!fitZoom}><Scan size={17} aria-hidden="true"/>Ajustar foto completa</button><span>Conserva toda la imagen con márgenes suaves si hace falta.</span></div>
              <div>
                <label htmlFor="publish-photo-zoom" className="block text-[10px] font-black text-gray-400 uppercase mb-1">Zoom</label>
                <input
                  id="publish-photo-zoom"
                  type="range"
                  min={minZoom}
                  max={3}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full"
                  disabled={isCropping||!fitZoom}
                />
                <div className="publish-zoom-labels"><span><ZoomOut size={14} aria-hidden="true"/>Alejar</span><span>Acercar<ZoomIn size={14} aria-hidden="true"/></span></div>
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
