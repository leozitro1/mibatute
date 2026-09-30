import { LOCATIONS } from "../data/locations";
import { detectContactoProhibido } from "./articleValidation";

const MAX_VENTA_COP = 500000;

function conditionMeta(raw) {
  const v = Math.max(1, Math.min(10, Number(raw) || 1));
  if (v <= 3) return { label: "Muy deteriorado", cls: "bg-red-50 text-red-700 border-red-200" };
  if (v <= 6) return { label: "Uso medio", cls: "bg-yellow-50 text-yellow-800 border-yellow-200" };
  if (v <= 8) return { label: "Buen estado", cls: "bg-green-50 text-green-700 border-green-200" };
  return { label: "Casi nuevo", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
}


export default function ArticleFields({ formData, setFormData, categories, disabled = false, lockMode = false }) {
  const CATEGORY_TREE = categories;
  const CATEGORY_OPTIONS = categories.map(c => c.key);
  const getSubsForCategory = (tree, category) => tree.find(c => c.key === category)?.subs || [];
  const subOptions = getSubsForCategory(categories, formData.category);
  const localities = LOCATIONS[formData.city] || [];
  const exceedsMaxVenta = formData.mode === "venta" && Number(formData.price) > MAX_VENTA_COP;
  const descError = detectContactoProhibido(formData.description);
  return <div className="space-y-4">
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
                disabled={disabled}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  disabled={disabled}
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
                  disabled={disabled}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Tipo</label>
                <select
                  value={formData.mode}
                  onChange={(e) => {
                    const m = e.target.value;
                    setFormData((prev) => ({ ...prev, mode: m, price: m === "venta" ? prev.price : "" }));
                  }}
                  className="w-full border-2 border-gray-100 rounded-xl p-3 outline-none"
                  disabled={disabled || lockMode}
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
                  disabled={disabled || formData.mode !== "venta"}
                />
                {exceedsMaxVenta && (
                  <p className="text-[11px] mt-1 text-red-600">Tope: ${MAX_VENTA_COP.toLocaleString("es-CO")} COP</p>
                )}
              </div>
            </div>

            {/* Ciudad / localidad */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Ciudad</label>
                <select
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value, locality: "" })}
                  className="w-full border-2 border-gray-100 rounded-xl p-3 outline-none"
                  disabled={disabled}
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
                  disabled={disabled || !formData.city}
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
                disabled={disabled}
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
                }}
                placeholder="Describe el artículo, estado, detalles..."
                className={`w-full border-2 rounded-xl p-3 outline-none min-h-[110px] ${
                  descError ? "border-red-400 focus:ring-2 focus:ring-red-300" : "border-gray-100"
                }`}
                disabled={disabled}
              />
              {descError && (
                <p className="mt-1 text-xs font-bold text-red-600 flex items-start gap-1">
                  <span>⛔</span>
                  <span>{descError}</span>
                </p>
              )}
            </div>


  </div>;
}
