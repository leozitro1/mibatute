// src/pages/AdsPanel.jsx
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase/supabaseClient";

const MAX_ADS = 5;

function fmtDate(v) {
  try {
    return v
      ? new Date(v).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })
      : "—";
  } catch { return "—"; }
}

function ctr(imp, clics) {
  if (!imp) return "0%";
  return ((clics / imp) * 100).toFixed(1) + "%";
}

const EMPTY_FORM = { imagen_url: "", texto: "", descripcion: "", enlace: "" };

export default function AdsPanel() {
  const [ads, setAds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [formError, setFormError] = useState("");

  const loadAds = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error } = await supabase
        .from("patrocinadores")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setAds(data || []);
    } catch (e) {
      setError(e?.message || "No se pudieron cargar los anuncios.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAds(); }, [loadAds]);

  const validate = () => {
    if (!form.imagen_url.trim()) return "La URL de imagen es obligatoria.";
    if (!form.texto.trim()) return "El texto descriptivo es obligatorio.";
    if (form.enlace && !/^https?:\/\//i.test(form.enlace.trim()))
      return "El enlace debe comenzar con http:// o https://";
    return null;
  };

  const handleSave = async () => {
    const err = validate();
    if (err) { setFormError(err); return; }
    setFormError("");
    if (!editingId && ads.length >= MAX_ADS) {
      setFormError(`Máximo ${MAX_ADS} anuncios. Elimina uno antes de agregar.`);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        imagen_url: form.imagen_url.trim(),
        texto: form.texto.trim(),
        descripcion: form.descripcion.trim() || null,
        enlace: form.enlace.trim() || null,
      };
      if (editingId) {
        const { error } = await supabase.from("patrocinadores").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("patrocinadores").insert([{ ...payload, activo: true }]);
        if (error) throw error;
      }
      setForm(EMPTY_FORM);
      setEditingId(null);
      await loadAds();
    } catch (e) {
      setFormError(e?.message || "Error al guardar.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActivo = async (ad) => {
    try {
      const { error } = await supabase
        .from("patrocinadores").update({ activo: !ad.activo }).eq("id", ad.id);
      if (error) throw error;
      setAds((prev) => prev.map((a) => a.id === ad.id ? { ...a, activo: !a.activo } : a));
    } catch (e) {
      alert("No se pudo actualizar: " + (e?.message || "error"));
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("¿Eliminar este anuncio permanentemente?")) return;
    try {
      const { error } = await supabase.from("patrocinadores").delete().eq("id", id);
      if (error) throw error;
      setAds((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      alert("No se pudo eliminar: " + (e?.message || "error"));
    }
  };

  const handleEdit = (ad) => {
    setEditingId(ad.id);
    setForm({ imagen_url: ad.imagen_url || "", texto: ad.texto || "", descripcion: ad.descripcion || "", enlace: ad.enlace || "" });
    setFormError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCancel = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError("");
  };

  const activeCount = ads.filter((a) => a.activo).length;
  const totalImp = ads.reduce((s, a) => s + (a.impresiones || 0), 0);
  const totalClics = ads.reduce((s, a) => s + (a.clics || 0), 0);

  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      <div className="max-w-4xl mx-auto px-4 py-10 space-y-6">

        {/* Header */}
        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Panel de administración</p>
              <h1 className="text-2xl font-black text-gray-900 mt-1">Anuncios patrocinados</h1>
              <p className="text-sm text-gray-500 font-medium mt-1">
                Gestiona los anuncios del banner principal · máximo {MAX_ADS} anuncios
              </p>
            </div>
            <button
              type="button" onClick={loadAds} disabled={loading}
              className="px-4 py-2 rounded-2xl bg-gray-100 text-gray-900 font-bold text-sm border border-gray-200 hover:border-gray-400 transition disabled:opacity-50"
            >
              {loading ? "Cargando…" : "Refrescar"}
            </button>
          </div>

          {/* Métricas globales */}
          <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total anuncios", value: `${ads.length} / ${MAX_ADS}` },
              { label: "Activos", value: activeCount, color: "text-green-700" },
              { label: "Impresiones", value: totalImp.toLocaleString("es-CO") },
              { label: "Clics · CTR", value: `${totalClics.toLocaleString("es-CO")} · ${ctr(totalImp, totalClics)}`, color: "text-indigo-700" },
            ].map((m) => (
              <div key={m.label} className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{m.label}</p>
                <p className={`text-lg font-black mt-1 ${m.color || "text-gray-900"}`}>{m.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Formulario */}
        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
            {editingId ? "Editando anuncio" : "Nuevo anuncio"}
          </p>
          <h2 className="text-lg font-black text-gray-900 mt-1">
            {editingId ? "Modificar datos" : "Agregar anuncio"}
          </h2>

          <div className="mt-4 space-y-4">
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">
                URL de imagen <span className="text-red-500">*</span>
              </label>
              <input
                value={form.imagen_url}
                onChange={(e) => setForm((p) => ({ ...p, imagen_url: e.target.value }))}
                placeholder="https://ejemplo.com/imagen.jpg"
                className="mt-1.5 w-full px-4 py-3 rounded-2xl border border-gray-200 font-medium text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 transition"
              />
              {form.imagen_url && (
                <img
                  src={form.imagen_url} alt="preview"
                  className="mt-2 w-full h-36 object-cover rounded-2xl border border-gray-100"
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              )}
            </div>

            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">
                Texto del banner <span className="text-red-500">*</span>
              </label>
              <input
                value={form.texto}
                onChange={(e) => setForm((p) => ({ ...p, texto: e.target.value }))}
                placeholder="Ej: Descubre nuestra nueva colección"
                maxLength={120}
                className="mt-1.5 w-full px-4 py-3 rounded-2xl border border-gray-200 font-medium text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 transition"
              />
              <p className="mt-1 text-[10px] text-gray-400 font-medium text-right">{form.texto.length}/120</p>
            </div>

            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">
                Descripción <span className="text-gray-400 normal-case font-medium">(opcional)</span>
              </label>
              <textarea
                value={form.descripcion}
                onChange={(e) => setForm((p) => ({ ...p, descripcion: e.target.value }))}
                placeholder="Ej: Visita nuestra tienda y encuentra los mejores precios"
                maxLength={200}
                rows={2}
                className="mt-1.5 w-full px-4 py-3 rounded-2xl border border-gray-200 font-medium text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 transition resize-none"
              />
              <p className="mt-1 text-[10px] text-gray-400 font-medium text-right">{form.descripcion.length}/200</p>
            </div>

            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">
                Enlace del patrocinador <span className="text-gray-400 normal-case font-medium">(opcional)</span>
              </label>
              <input
                value={form.enlace}
                onChange={(e) => setForm((p) => ({ ...p, enlace: e.target.value }))}
                placeholder="https://patrocinador.com"
                className="mt-1.5 w-full px-4 py-3 rounded-2xl border border-gray-200 font-medium text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 transition"
              />
            </div>

            {formError && (
              <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
                <p className="text-sm font-bold text-red-700">{formError}</p>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button" onClick={handleSave} disabled={saving}
                className="px-6 py-3 rounded-2xl bg-gray-900 text-white font-black text-sm transition hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Guardando…" : editingId ? "Guardar cambios" : "Agregar anuncio"}
              </button>
              {editingId && (
                <button
                  type="button" onClick={handleCancel}
                  className="px-6 py-3 rounded-2xl bg-white text-gray-900 font-black text-sm border border-gray-200 hover:border-gray-900 transition"
                >
                  Cancelar
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Lista */}
        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Anuncios</p>
          <h2 className="text-lg font-black text-gray-900 mt-1">Lista de anuncios</h2>

          <div className="mt-4">
            {loading ? (
              <p className="text-sm font-bold text-gray-500 py-4">Cargando…</p>
            ) : error ? (
              <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
                <p className="text-sm font-bold text-red-700">{error}</p>
              </div>
            ) : ads.length === 0 ? (
              <div className="bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-8 text-center">
                <p className="text-sm font-bold text-gray-400">No hay anuncios. Agrega el primero arriba.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {ads.map((ad) => (
                  <div key={ad.id} className={`rounded-2xl border p-4 transition ${ad.activo ? "bg-white border-gray-200" : "bg-gray-50 border-gray-100 opacity-60"}`}>
                    <div className="flex gap-4">
                      <div className="shrink-0 w-24 h-16 rounded-xl overflow-hidden bg-gray-100 border border-gray-100">
                        {ad.imagen_url ? (
                          <img src={ad.imagen_url} alt="ad" className="w-full h-full object-cover"
                            onError={(e) => { e.currentTarget.style.display = "none"; }} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400 font-bold">Sin imagen</div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${ad.activo ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-100 text-gray-500 border-gray-200"}`}>
                            {ad.activo ? "ACTIVO" : "INACTIVO"}
                          </span>
                          <span className="text-[10px] text-gray-400 font-medium">Creado: {fmtDate(ad.created_at)}</span>
                        </div>

                        <p className="mt-1 text-sm font-black text-gray-900 truncate">{ad.texto || "—"}</p>

                        {ad.enlace && (
                          <a href={ad.enlace} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-blue-600 font-medium hover:underline truncate block mt-0.5">
                            {ad.enlace}
                          </a>
                        )}

                        <div className="mt-3 flex flex-wrap gap-2">
                          {[
                            { label: "Impresiones", value: (ad.impresiones || 0).toLocaleString("es-CO") },
                            { label: "Clics", value: (ad.clics || 0).toLocaleString("es-CO") },
                            { label: "CTR", value: ctr(ad.impresiones, ad.clics), color: "text-indigo-700" },
                          ].map((m) => (
                            <div key={m.label} className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-1.5">
                              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{m.label}</p>
                              <p className={`text-sm font-black ${m.color || "text-gray-800"}`}>{m.value}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => handleEdit(ad)}
                        className="px-3 py-2 rounded-xl bg-white text-gray-900 font-bold text-xs border border-gray-200 hover:border-gray-900 transition">
                        Editar
                      </button>
                      <button type="button" onClick={() => toggleActivo(ad)}
                        className={`px-3 py-2 rounded-xl font-bold text-xs border transition ${ad.activo ? "bg-gray-100 text-gray-700 border-gray-200 hover:border-gray-900" : "bg-green-50 text-green-800 border-green-200 hover:border-green-900"}`}>
                        {ad.activo ? "Desactivar" : "Activar"}
                      </button>
                      <button type="button" onClick={() => handleDelete(ad.id)}
                        className="px-3 py-2 rounded-xl bg-red-50 text-red-700 font-bold text-xs border border-red-100 hover:border-red-600 transition">
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
