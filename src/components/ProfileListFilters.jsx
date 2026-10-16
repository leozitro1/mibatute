import { useId, useState } from 'react';
import { Search, X, RotateCcw, SlidersHorizontal, ChevronDown } from 'lucide-react';
import { DEFAULT_PROFILE_FILTERS } from './profileFilters.js';
import './ProfileListFilters.css';

export default function ProfileListFilters({ value, onChange, rescates = false, count, total }) {
  const [open, setOpen] = useState(false);
  const optionsId = useId();
  const update = (key, next) => onChange(previous => ({ ...previous, [key]: next }));
  const active = Object.keys(DEFAULT_PROFILE_FILTERS).some(key => value[key] !== DEFAULT_PROFILE_FILTERS[key]);
  const inputClass = 'h-11 min-w-0 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-700 focus:border-forest-green focus:outline-none';
  return (
    <section aria-label={rescates ? 'Filtros de mis rescates' : 'Filtros de mis publicaciones'} className="profile-list-filters" data-has-featured={!rescates}>
      <div className="profile-list-toolbar">
        <label className="profile-list-search min-w-0">
          <span className="sr-only">Buscar</span>
          <div className="relative">
            <Search size={15} aria-hidden="true" className="absolute left-2.5 top-3.5 text-gray-400" />
            <input type="search" aria-label="Buscar en esta lista" placeholder="Buscar"
              value={value.search} onChange={event => update('search', event.target.value)}
              className={`${inputClass} pl-8 pr-8`} />
            {value.search && <button type="button" aria-label="Borrar búsqueda de artículos" title="Borrar búsqueda"
              onClick={() => update('search', '')} className="absolute right-0 top-0 flex h-11 w-8 items-center justify-center text-gray-500"><X size={14} /></button>}
          </div>
        </label>
        {!rescates && <label className="profile-list-featured flex items-center gap-2 text-xs font-semibold text-gray-600">
          <input type="checkbox" checked={value.featured} onChange={event => update('featured', event.target.checked)} className="h-4 w-4 accent-forest-green" />
          Solo destacados
        </label>}
        <div className="profile-list-summary">
        <button type="button" onClick={() => setOpen(previous => !previous)} aria-expanded={open} aria-controls={optionsId}
          className="profile-list-toggle inline-flex min-h-11 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700">
          <SlidersHorizontal size={16} aria-hidden="true" />Filtros{active && <span className="profile-list-active" aria-label="activos" />}
          <ChevronDown size={16} className={open ? 'rotate-180' : ''} aria-hidden="true" />
        </button>
        <span aria-live="polite" className="text-xs text-gray-500">{count} de {total} artículos</span>
        {active && <button type="button" onClick={() => onChange({ ...DEFAULT_PROFILE_FILTERS })}
          className="profile-list-reset inline-flex items-center gap-1.5 text-xs font-semibold text-forest-green" title="Limpiar filtros"><RotateCcw size={14} />Limpiar</button>}
        </div>
      </div>
      <div id={optionsId} className={`${open ? 'block' : 'hidden'} lg:block mt-2`}>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <label className="min-w-0">
          <span className="mb-1 block text-xs font-semibold text-gray-600">Estado</span>
          <select value={value.status} onChange={event => update('status', event.target.value)} className={inputClass}>
            <option value="todos">Todos los estados</option>
            {rescates ? <option value="pendiente">Solicitudes pendientes</option> : <option value="disponible">Disponibles</option>}
            <option value="reservado">Reservados</option>
            <option value="entregado">Entregados</option>
            <option value="vencido">Vencidos</option>
            {rescates && <option value="cancelado">No aprobadas</option>}
            {!rescates && <><option value="pausado">Pausados</option><option value="en_revision">En revisión</option></>}
          </select>
        </label>
        <label className="min-w-0">
          <span className="mb-1 block text-xs font-semibold text-gray-600">Tipo</span>
          <select value={value.type} onChange={event => update('type', event.target.value)} className={inputClass}>
            <option value="todos">Venta y regalo</option><option value="venta">Venta</option><option value="donacion">Donación / regalo</option>
          </select>
        </label>
        <label className="min-w-0">
          <span className="mb-1 block text-xs font-semibold text-gray-600">Actividad</span>
          <select value={value.activity} onChange={event => update('activity', event.target.value)} className={inputClass}>
            <option value="todos">Toda la actividad</option><option value="unread">Mensajes sin leer</option><option value="chat">Con chat</option>
            <option value="requests">Con solicitudes</option><option value="pending">Solicitudes pendientes</option>
          </select>
        </label>
        <label className="min-w-0">
          <span className="mb-1 block text-xs font-semibold text-gray-600">Orden</span>
          <select value={value.sort} onChange={event => update('sort', event.target.value)} className={inputClass}>
            <option value="priority">Prioridad</option><option value="newest">Más recientes</option><option value="oldest">Más antiguos</option>
          </select>
        </label>
      </div>
      </div>
    </section>
  );
}
