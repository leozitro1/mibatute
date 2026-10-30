import { useEffect, useId, useRef, useState } from 'react';
import { Search, MapPin, SlidersHorizontal, ChevronDown, X, LayoutGrid } from 'lucide-react';
import CategoryIcon from './CategoryIcon.jsx';
import useDetailScroll from './useDetailScroll.js';
import { patchMobileFilters, resetMobileFilters, mobileFilterChips } from './mobileCatalogFilters.js';
import './MobileCatalogTools.css';

const kinds = [['todo','Todo'],['donacion','Donaciones'],['venta','Ventas']];
const shortCategory = category => category.split(' & ')[0];

export default function MobileCatalogTools({ search, onSearch, value, onChange, categories, cities, signedIn, onSubmitSearch }) {
  const [open,setOpen] = useState(false), [draft,setDraft] = useState(value);
  const dialog = useRef(null), searchInput = useRef(null), subcategoryRow = useRef(null);
  const titleId = useId(), fieldId = useId();
  const chips = mobileFilterChips(value);
  useDetailScroll(open);
  useEffect(() => {
    const element = dialog.current;
    if (open && !element.open) element.showModal();
    else if (!open && element.open) element.close();
  },[open]);
  const change = patch => setDraft(current => patchMobileFilters(current,patch));
  const showFilters = () => {setDraft({...value});setOpen(true);};
  const localities = cities.find(city => city.city === draft.city)?.localities || [];
  const subcategories = categories.find(category => category.key === draft.category)?.subs || [];
  const selectedSubcategories = categories.find(category => category.key === value.category)?.subs || [];
  useEffect(() => {
    const row = subcategoryRow.current;
    if (!row) return;
    const active = row.querySelector('[aria-pressed="true"]');
    row.scrollTo({left:value.subcategory && active ? Math.max(0,active.offsetLeft-(row.clientWidth-active.offsetWidth)/2) : 0,behavior:'smooth'});
  },[value.category,value.subcategory]);

  return <>
    <section className="mobile-catalog-tools" aria-label="Explorar artículos">
      <form role="search" onSubmit={event => {event.preventDefault();searchInput.current?.blur();onSubmitSearch?.();}} className="mobile-catalog-search">
        <Search size={21} aria-hidden="true" />
        <input ref={searchInput} type="search" aria-label="Buscar artículos" placeholder="¿Qué estás buscando?" value={search}
          onChange={event => onSearch(event.target.value)} enterKeyHint="search" />
        {search && <button type="button" onClick={() => {onSearch('');searchInput.current?.focus();}} aria-label="Limpiar búsqueda"><X size={18} /></button>}
        <button type="submit" aria-label="Buscar"><Search size={20} /></button>
      </form>
      <button type="button" className="mobile-catalog-location" onClick={showFilters} aria-haspopup="dialog">
        <MapPin size={15} aria-hidden="true" /><span>{value.city}{value.locality !== 'Todas' ? ` · ${value.locality}` : ' · Todas las localidades'}</span><ChevronDown size={14} aria-hidden="true" />
      </button>
      <div className="mobile-catalog-kinds" role="group" aria-label="Tipo de artículo">
        {kinds.map(([key,label]) => <button key={key} type="button" aria-pressed={value.kind === key}
          onClick={() => onChange({...value,kind:key})}>{label}</button>)}
      </div>
      <div className="mobile-catalog-categories" role="group" aria-label="Categorías de artículos">
        <button type="button" aria-pressed={value.category === 'Todo'} onClick={() => onChange(patchMobileFilters(value,{category:'Todo'}))}><LayoutGrid size={19} aria-hidden="true" /><span>Todas</span></button>
        {categories.map(category => <button key={category.key} type="button" aria-pressed={value.category === category.key} title={category.key}
          aria-label={category.key} onClick={() => onChange(patchMobileFilters(value,{category:category.key}))}>
          <CategoryIcon category={category.key} /><span>{shortCategory(category.key)}</span>
        </button>)}
      </div>
      {value.category !== 'Todo' && selectedSubcategories.length > 0 && <div key={value.category} ref={subcategoryRow}
        className="mobile-catalog-subcategories" role="group" aria-label={`Subcategorías de ${value.category}`}>
        <button type="button" aria-label={`Todas las subcategorías de ${value.category}`} aria-pressed={!value.subcategory}
          onClick={() => onChange(patchMobileFilters(value,{subcategory:''}))}>Todas</button>
        {selectedSubcategories.map(subcategory => <button key={subcategory} type="button" aria-pressed={value.subcategory === subcategory}
          onClick={() => onChange(patchMobileFilters(value,{subcategory}))}>{subcategory}</button>)}
      </div>}
      <div className="mobile-catalog-actions">
        <button type="button" className="mobile-catalog-filter-button" onClick={showFilters} aria-haspopup="dialog"><SlidersHorizontal size={17} aria-hidden="true" />Filtros{chips.length > 0 && <span>{chips.length}</span>}</button>
        <span>{value.sort === 'newest' ? 'Más recientes primero' : value.sort === 'oldest' ? 'Más antiguas primero' : 'Explora los hallazgos'}</span>
        {chips.length > 0 && <button type="button" className="mobile-catalog-clear" onClick={() => onChange(resetMobileFilters(value))}>Limpiar</button>}
      </div>
      {chips.length > 0 && <div className="mobile-catalog-chips" role="group" aria-label="Filtros aplicados">
        {chips.map(chip => <button key={chip.key} type="button" aria-label={`Quitar filtro: ${chip.label}`} onClick={() => onChange(patchMobileFilters(value,chip.patch))}>{chip.label}<X size={14} aria-hidden="true" /></button>)}
      </div>}
    </section>

    <dialog ref={dialog} className="mobile-catalog-sheet" aria-labelledby={titleId}
      onCancel={event => {event.preventDefault();setOpen(false);}} onClose={() => setOpen(false)}
      onClick={event => {if (event.target === event.currentTarget) setOpen(false);}}>
      <form onSubmit={event => {event.preventDefault();onChange(draft);setOpen(false);}}>
        <header><div><h2 id={titleId}>Encuentra tu próximo hallazgo</h2><p>Elige dónde y qué quieres ver.</p></div><button type="button" aria-label="Cerrar filtros" onClick={() => setOpen(false)}><X size={21} /></button></header>
        <div className="mobile-catalog-sheet-body">
          <label htmlFor={`${fieldId}-city`}>Ciudad<select id={`${fieldId}-city`} value={draft.city} onChange={event => change({city:event.target.value})}>{cities.map(city => <option key={city.city}>{city.city}</option>)}</select></label>
          <label htmlFor={`${fieldId}-locality`}>Localidad<select id={`${fieldId}-locality`} value={draft.locality} onChange={event => change({locality:event.target.value})}><option value="Todas">Todas las localidades</option>{localities.map(locality => <option key={locality}>{locality}</option>)}</select></label>
          <label htmlFor={`${fieldId}-category`}>Categoría<select id={`${fieldId}-category`} value={draft.category} onChange={event => change({category:event.target.value})}><option value="Todo">Todas las categorías</option>{categories.map(category => <option key={category.key}>{category.key}</option>)}</select></label>
          {subcategories.length > 0 && <label htmlFor={`${fieldId}-subcategory`}>Subcategoría<select id={`${fieldId}-subcategory`} value={draft.subcategory} onChange={event => change({subcategory:event.target.value})}><option value="">Todas</option>{subcategories.map(subcategory => <option key={subcategory}>{subcategory}</option>)}</select></label>}
          <label htmlFor={`${fieldId}-kind`}>Tipo de publicación<select id={`${fieldId}-kind`} value={draft.kind} onChange={event => change({kind:event.target.value})}>{[...kinds,['destacado','Destacadas']].map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label htmlFor={`${fieldId}-sort`}>Ordenar por<select id={`${fieldId}-sort`} value={draft.sort} onChange={event => change({sort:event.target.value})}><option value="random">Aleatorias</option><option value="newest">Más recientes</option><option value="oldest">Más antiguas</option></select></label>
          <label htmlFor={`${fieldId}-mode`}>Modo de búsqueda<select id={`${fieldId}-mode`} value={draft.searchMode} onChange={event => change({searchMode:event.target.value})}><option value="related">Incluir artículos relacionados</option><option value="specific">Búsqueda específica</option></select></label>
          <label htmlFor={`${fieldId}-condition`}>Estado mínimo: {draft.minCondition ? `${draft.minCondition}/10` : 'Todos'}<input id={`${fieldId}-condition`} type="range" min="0" max="10" step="1" value={draft.minCondition} aria-valuetext={draft.minCondition ? `Desde ${draft.minCondition} de 10` : 'Todos los estados'} onChange={event => change({minCondition:Number(event.target.value)})} /></label>
          <label className="mobile-catalog-check"><span>Solo disponibles</span><input type="checkbox" checked={draft.onlyActive} onChange={event => change({onlyActive:event.target.checked})} /></label>
          {signedIn && <label className="mobile-catalog-check"><span>Ocultar mis anuncios</span><input type="checkbox" checked={draft.hideOwn} onChange={event => change({hideOwn:event.target.checked})} /></label>}
        </div>
        <footer><button type="button" onClick={() => setDraft(resetMobileFilters(draft))}>Restablecer</button><button type="submit">Ver resultados</button></footer>
      </form>
    </dialog>
  </>;
}
