import ArticleSizeField from "./ArticleSizeField.jsx";
import StyledSelect from "./StyledSelect.jsx";
import { useId } from "react";
import useLocations from "../data/useLocations.js";
import {publicationTextIssue,PUBLICATION_CONTACT_NOTICE} from './articleValidation.js';
import usePublicationRules from './usePublicationRules.js';

import { productCondition } from "./productCondition.js";
import "./ProductCondition.css";

const MAX_VENTA_COP = 500000;

export default function ArticleFields({ formData, setFormData, categories, disabled = false, lockMode = false, section = 'all', hideMode = false, preserveLocation = false }) {
  const { LOCATIONS } = useLocations();
  const fieldId = useId();
  const CATEGORY_TREE = categories;
  const CATEGORY_OPTIONS = categories.map(c => c.key);
  const getSubsForCategory = (tree, category) => tree.find(c => c.key === category)?.subs || [];
  const subOptions = getSubsForCategory(categories, formData.category);
  const localities = LOCATIONS[formData.city] || [];
  const exceedsMaxVenta = formData.mode === "venta" && Number(formData.price) > MAX_VENTA_COP;
  const condition = productCondition(formData.conditionScore) || productCondition(8);
  const rules=usePublicationRules();
  const titleError=publicationTextIssue(formData.title,rules);
  const descError=publicationTextIssue(formData.description,rules);
  return <div className="space-y-4">
            <p id={`${fieldId}-contact-policy`} className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950">{PUBLICATION_CONTACT_NOTICE}</p>
            {section!=='location'&&<>
            {/* Título */}
            <div>
              <label htmlFor={`${fieldId}-title`} className="block text-[10px] font-black text-gray-400 uppercase mb-1">¿Qué quieres publicar?</label>
              <input id={`${fieldId}-title`}
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                type="text"
                maxLength={160}
                aria-describedby={`${fieldId}-contact-policy${titleError?' '+fieldId+'-title-error':''}`}
                aria-invalid={!!titleError}
                placeholder="Ej: Licuadora funcionando / repuestos..."
                className="w-full border-2 border-gray-100 rounded-xl p-3 outline-none focus:border-forest-green"
                disabled={disabled}
              />
              {titleError&&<p id={`${fieldId}-title-error`} role="status" className="mt-1 text-xs text-red-700">{titleError}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Categoría (macro) */}
              <div>
                <label htmlFor={`${fieldId}-category`} className="block text-[10px] font-black text-gray-400 uppercase mb-1">Categoría</label>
                <select id={`${fieldId}-category`}
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
                <label htmlFor={`${fieldId}-subcategory`} className="block text-[10px] font-black text-gray-400 uppercase mb-1">Subcategoría</label>
                <select id={`${fieldId}-subcategory`}
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
            <p className="text-xs text-gray-500">Elige la categoría más cercana. Si ninguna subcategoría encaja, selecciona «Otros».</p>

            {/* Modo + precio */}
            {(!hideMode||formData.mode==='venta')&&<div className={hideMode?"grid grid-cols-1 gap-4":"grid grid-cols-1 sm:grid-cols-2 gap-4"}>
              {!hideMode&&<div>
                <label htmlFor={`${fieldId}-mode`} className="block text-[10px] font-black text-gray-400 uppercase mb-1">Tipo</label>
                <select id={`${fieldId}-mode`}
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
              </div>}

              {(!hideMode||formData.mode==='venta')&&<div>
                <label htmlFor={`${fieldId}-price`} className="block text-[10px] font-black text-gray-400 uppercase mb-1">Precio (solo si es venta)</label>
                <input id={`${fieldId}-price`}
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
              </div>}
            </div>}

            </>}
            {section!=='details'&&<>
            {/* Ciudad / localidad */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor={`${fieldId}-city`} className="block text-[10px] font-black text-gray-400 uppercase mb-1">Ciudad</label>
                <StyledSelect id={`${fieldId}-city`}
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value, locality: "" })}
                  className="w-full border-2 border-gray-100 rounded-xl p-3 outline-none"
                  disabled={disabled}
                >
                  <option value="">Selecciona...</option>
                  {preserveLocation && formData.city && !LOCATIONS[formData.city] && <option value={formData.city}>{formData.city} (inactiva)</option>}
                  {Object.keys(LOCATIONS).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </StyledSelect>
              </div>

              <div>
                <label htmlFor={`${fieldId}-locality`} className="block text-[10px] font-black text-gray-400 uppercase mb-1">Localidad</label>
                <select id={`${fieldId}-locality`}
                  value={formData.locality}
                  onChange={(e) => setFormData({ ...formData, locality: e.target.value })}
                  className="w-full border-2 border-gray-100 rounded-xl p-3 outline-none"
                  disabled={disabled || !formData.city}
                >
                  <option value="">Selecciona...</option>
                  {preserveLocation && formData.locality && !localities.includes(formData.locality) && <option value={formData.locality}>{formData.locality}</option>}
                  {localities.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            </>}
            {section!=='location'&&<>
            {/* Condición */}
            <div style={{ '--condition-color': condition.color }}>
              <label htmlFor={`${fieldId}-conditionScore`} className="block text-[10px] font-black text-gray-400 uppercase mb-1">Estado del producto (1-10)</label>
              <input id={`${fieldId}-conditionScore`}
                type="range"
                min="1"
                max="10"
                step="1"
                value={condition.score}
                onChange={(e) => setFormData({ ...formData, conditionScore: Number(e.target.value) })}
                className="product-condition-slider"
                style={{ accentColor: condition.color }}
                aria-valuetext={`${condition.score} de 10: ${condition.label}. ${condition.description}`}
                aria-describedby={`${fieldId}-condition-guide`}
                disabled={disabled}
              />
              <div className="product-condition-endpoints" aria-hidden="true"><span>1 · Muy deteriorado</span><span>10 · Nuevo</span></div>
              <div id={`${fieldId}-condition-guide`} className="product-condition-guide" aria-live="polite" aria-atomic="true">
                <strong>{condition.score}/10 · {condition.label}</strong>
                <p>{condition.description}</p>
                <small>Describe las fallas y muéstralas en las fotos. El estado es informado por quien publica.</small>
              </div>
            </div>

            <ArticleSizeField value={formData.sizeClass || ''} name={`${fieldId}-size`} onChange={sizeClass => setFormData(previous => ({ ...previous, sizeClass }))} disabled={disabled} />

            {/* Descripción */}
            <div>
              <label htmlFor={`${fieldId}-description`} className="block text-[10px] font-black text-gray-400 uppercase mb-1">Descripción</label>
              <textarea id={`${fieldId}-description`} maxLength={4000} aria-describedby={`${fieldId}-contact-policy`} aria-invalid={!!descError}
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
            </>}

  </div>;
}
