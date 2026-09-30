// src/components/EditArticleModal.jsx
import { useEffect, useMemo, useState } from "react";
import {
  updateArticle,
  getArticleWithImages,
  addArticleImages,
  deleteArticleImage,
  replaceArticleImage,
} from "../supabase/articleService";
import { LOCATIONS } from "../data/locations";
import { X, Camera, Loader2, Trash2, Plus, RefreshCw } from "lucide-react";

const FALLBACK_IMG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="800" height="400">
    <rect width="100%" height="100%" fill="#f3f4f6"/>
    <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
      fill="#6b7280" font-family="Arial" font-size="22" font-weight="700">
      Sin imagen
    </text>
  </svg>
`);

export default function EditArticleModal({ isOpen, onClose, article, onUpdateSuccess }) {
  const [loading, setLoading] = useState(false);

  // ✅ Form (alineado a migración ES)
  const [formData, setFormData] = useState({
    titulo: "",
    descripcion: "",
    ciudad: "",
    localidad_es: "", // ✅ antes estaba "localidad" (esa columna NO existe)
    categoria: "",
    imagen_url_principal: "",
  });

  // imágenes (gestión)
  const [fullArticle, setFullArticle] = useState(null);
  const [imgBusyId, setImgBusyId] = useState(null);
  const [addingBusy, setAddingBusy] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(false);

  // preview grande (solo visual)
  const preview = useMemo(() => {
    const a = fullArticle || article;

    const fromImgs =
      Array.isArray(a?.articulo_imagenes) && a.articulo_imagenes.length
        ? a.articulo_imagenes[0]?.url
        : "";

    return (
      a?.imagen_url_principal ||
      a?.imagen_url ||
      a?.image_url ||
      (Array.isArray(a?.imagenes) ? a.imagenes[0] : "") ||
      fromImgs ||
      ""
    );
  }, [fullArticle, article]);

  const images = useMemo(() => {
    const a = fullArticle || article;
    return Array.isArray(a?.articulo_imagenes) ? a.articulo_imagenes : [];
  }, [fullArticle, article]);

  const remainingSlots = useMemo(() => Math.max(0, 4 - images.length), [images.length]);

  const refreshArticle = async (id) => {
    if (!id) return;
    setRefreshBusy(true);
    const res = await getArticleWithImages(id);
    if (res?.success) setFullArticle(res.data);
    setRefreshBusy(false);
  };

  useEffect(() => {
    if (!article || !isOpen) return;

    // ✅ cargar datos del form con fallback ES/EN
    const titulo = article.titulo ?? article.title ?? "";
    const descripcion = article.descripcion ?? article.description ?? "";
    const ciudad = article.ciudad ?? article.city ?? "";
    const localidad_es = article.localidad_es ?? article.locality ?? ""; // ✅
    const categoria = article.categoria ?? article.category ?? "";

    const imagenUrl =
      article.imagen_url_principal ??
      article.imagen_url ??
      article.image_url ??
      (Array.isArray(article.imagenes) ? article.imagenes[0] : "") ??
      (Array.isArray(article.articulo_imagenes) ? article.articulo_imagenes?.[0]?.url : "") ??
      "";

    setFormData({
      titulo,
      descripcion,
      ciudad,
      localidad_es,
      categoria,
      imagen_url_principal: imagenUrl,
    });

    // traer artículo completo con imágenes
    setFullArticle(null);
    refreshArticle(article.id);
  }, [article, isOpen]);

  if (!isOpen) return null;

  const ownerId = fullArticle?.owner_id || article?.owner_id || null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!article?.id) return;

    setLoading(true);

    // ✅ Payload “doble” (ES + EN) para migración segura
    const payload = {
      // Español (nuevo)
      titulo: formData.titulo?.trim() || "",
      descripcion: formData.descripcion?.trim() || "",
      ciudad: formData.ciudad || "",
      localidad_es: formData.localidad_es || "",
      categoria: formData.categoria || "",
      imagen_url_principal: formData.imagen_url_principal || "",

      // Inglés (legacy / compat)
      title: formData.titulo?.trim() || "",
      description: formData.descripcion?.trim() || "",
      city: formData.ciudad || "",
      locality: formData.localidad_es || "",
      category: formData.categoria || "",
      image_url: formData.imagen_url_principal || "",

    };

    const result = await updateArticle(article.id, payload, null);

    if (result?.success) {
      alert("¡Cambios guardados!");
      onUpdateSuccess?.();
      await refreshArticle(article.id);
      onClose?.();
    } else {
      alert("Error al actualizar: " + (result?.error || "Error"));
    }

    setLoading(false);
  };

  const handleAddImages = async (files) => {
    if (!article?.id) return;
    if (!ownerId) return alert("No se pudo determinar el owner_id del artículo.");

    const list = Array.from(files || []).filter(Boolean);
    if (!list.length) return;

    if (list.length > remainingSlots) {
      alert(`Solo puedes agregar ${remainingSlots} foto(s) más.`);
      return;
    }

    setAddingBusy(true);
    const res = await addArticleImages(article.id, list, ownerId);
    if (!res?.success) {
      alert(res?.error || "No se pudo agregar la(s) imagen(es)");
    } else {
      await refreshArticle(article.id);
      onUpdateSuccess?.();
    }
    setAddingBusy(false);
  };

  const handleDeleteImage = async (imageId) => {
    if (!imageId) return;
    const ok = confirm("¿Eliminar esta foto? (No se puede deshacer)");
    if (!ok) return;

    setImgBusyId(imageId);
    const res = await deleteArticleImage(imageId);
    if (!res?.success) {
      alert(res?.error || "No se pudo eliminar la imagen");
    } else {
      await refreshArticle(article.id);
      onUpdateSuccess?.();
    }
    setImgBusyId(null);
  };

  const handleReplaceImage = async (imageId, file) => {
    if (!imageId || !file) return;
    if (!ownerId) return alert("No se pudo determinar el owner_id del artículo.");

    setImgBusyId(imageId);
    const res = await replaceArticleImage(imageId, file, ownerId);
    if (!res?.success) {
      alert(res?.error || "No se pudo reemplazar la imagen");
    } else {
      await refreshArticle(article.id);
      onUpdateSuccess?.();
    }
    setImgBusyId(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="bg-forest-green p-6 flex justify-between items-center text-white">
          <h2 className="font-black uppercase tracking-widest text-lg">Editar Publicación</h2>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => refreshArticle(article?.id)}
              className="p-2 rounded-xl hover:bg-white/10 transition disabled:opacity-50"
              disabled={refreshBusy}
              title="Refrescar"
              aria-label="Refrescar"
            >
              {refreshBusy ? <Loader2 className="animate-spin" size={18} /> : <RefreshCw size={18} />}
            </button>

            <button onClick={onClose} className="hover:rotate-90 transition-transform" type="button">
              <X size={24} />
            </button>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar"
        >
          {/* Preview grande */}
          <div className="w-full h-40 bg-gray-100 rounded-3xl overflow-hidden border border-gray-200">
            <img
              src={preview || FALLBACK_IMG}
              className="w-full h-full object-cover"
              alt="Preview"
              onError={(e) => {
                if (e.currentTarget.dataset.fallbackApplied) return;
                e.currentTarget.dataset.fallbackApplied = "1";
                e.currentTarget.src = FALLBACK_IMG;
              }}
            />
          </div>

          {/* ✅ Gestión de fotos */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-black uppercase text-xs text-gray-700">Fotos (máx. 4)</h3>
              <span className="text-[10px] font-bold text-gray-400">{images.length}/4</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {images.map((img) => (
                <div
                  key={img.id}
                  className="relative rounded-2xl overflow-hidden border border-gray-200 bg-gray-50"
                >
                  <img
                    src={img.url || FALLBACK_IMG}
                    className="w-full h-36 object-cover"
                    alt="Foto"
                    onError={(e) => {
                      if (e.currentTarget.dataset.fallbackApplied) return;
                      e.currentTarget.dataset.fallbackApplied = "1";
                      e.currentTarget.src = FALLBACK_IMG;
                    }}
                  />

                  <div className="absolute inset-0 bg-black/30 opacity-0 hover:opacity-100 transition flex items-end justify-between p-2">
                    <label
                      className="flex items-center gap-1 text-white text-[10px] font-black uppercase bg-white/15 px-2 py-2 rounded-xl cursor-pointer hover:bg-white/25 transition"
                      title="Reemplazar"
                    >
                      {imgBusyId === img.id ? (
                        <Loader2 className="animate-spin" size={14} />
                      ) : (
                        <Camera size={14} />
                      )}
                      Cambiar
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        disabled={imgBusyId === img.id}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          handleReplaceImage(img.id, f);
                        }}
                      />
                    </label>

                    <button
                      type="button"
                      onClick={() => handleDeleteImage(img.id)}
                      disabled={imgBusyId === img.id}
                      className="flex items-center justify-center text-white bg-red-500/80 hover:bg-red-500 px-3 py-2 rounded-xl transition disabled:opacity-50"
                      title="Eliminar"
                      aria-label="Eliminar"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}

              {Array.from({ length: remainingSlots }).map((_, idx) => (
                <label
                  key={`slot-${idx}`}
                  className="h-36 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center cursor-pointer hover:border-forest-green transition"
                  title="Agregar foto"
                >
                  <div className="flex flex-col items-center gap-1 text-gray-400">
                    {addingBusy ? <Loader2 className="animate-spin" /> : <Plus />}
                    <span className="text-[10px] font-black uppercase">Agregar</span>
                  </div>
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    multiple={remainingSlots > 1}
                    disabled={addingBusy || remainingSlots === 0}
                    onChange={(e) => {
                      handleAddImages(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
              ))}
            </div>

            <p className="text-[10px] text-gray-400 mt-2">
              Puedes <b>eliminar</b>, <b>cambiar</b> o <b>agregar</b> fotos hasta completar 4.
            </p>
          </div>

          {/* Título */}
          <div>
            <label className="text-[10px] font-black uppercase text-gray-400 ml-2">Título</label>
            <input
              value={formData.titulo || ""}
              onChange={(e) => setFormData((p) => ({ ...p, titulo: e.target.value }))}
              className="w-full p-3 rounded-2xl bg-gray-50 border-none focus:ring-2 focus:ring-forest-green"
              required
            />
          </div>

          {/* Descripción */}
          <div>
            <label className="text-[10px] font-black uppercase text-gray-400 ml-2">Descripción</label>
            <textarea
              value={formData.descripcion || ""}
              onChange={(e) => setFormData((p) => ({ ...p, descripcion: e.target.value }))}
              className="w-full p-3 rounded-2xl bg-gray-50 border-none focus:ring-2 focus:ring-forest-green h-24 resize-none"
              required
            />
          </div>

          {/* Ciudad / Localidad */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black uppercase text-gray-400 ml-2">Ciudad</label>
              <select
                value={formData.ciudad || ""}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, ciudad: e.target.value, localidad_es: "" }))
                }
                className="w-full p-3 rounded-2xl bg-gray-50 border-none focus:ring-2 focus:ring-forest-green"
              >
                <option value="" disabled>
                  Selecciona...
                </option>
                {Object.keys(LOCATIONS).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase text-gray-400 ml-2">Localidad</label>
              <select
                value={formData.localidad_es || ""}
                onChange={(e) => setFormData((p) => ({ ...p, localidad_es: e.target.value }))}
                className="w-full p-3 rounded-2xl bg-gray-50 border-none focus:ring-2 focus:ring-forest-green"
                disabled={!formData.ciudad}
              >
                <option value="" disabled>
                  Selecciona...
                </option>
                {(LOCATIONS[formData.ciudad] || []).map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Guardar */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-forest-green text-white p-4 rounded-2xl font-black uppercase tracking-widest hover:brightness-110 transition disabled:opacity-50 flex justify-center items-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" /> : "Guardar Cambios"}
          </button>
        </form>
      </div>
    </div>
  );
}
