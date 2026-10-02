import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Star, Users } from 'lucide-react';
import { orderFeaturedItems } from './featuredOrder';
import { isSaleArticle } from '../supabase/articleContext';

export default function FeaturedTicker({ items = [], onItemClick }) {
  const [seed] = useState(() => Math.floor(Math.random() * 0x100000000));
  const list = useMemo(() => orderFeaturedItems(items, seed), [items, seed]);
  const scroller = useRef(null);
  if (!list.length) return null;

  return (
    <section aria-labelledby="featured-title" className="mb-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="featured-title" className="flex items-center gap-2 text-lg font-black text-gray-800">
          <Star size={18} className="text-yellow-600 fill-yellow-400" aria-hidden="true" />Destacados
        </h2>
        {list.length > 1 && <div className="flex gap-2">
          <button type="button" aria-label="Destacados anteriores" title="Destacados anteriores"
            onClick={() => scroller.current?.scrollBy({ left: -scroller.current.clientWidth, behavior: 'smooth' })}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:border-forest-green">
            <ArrowLeft size={16} aria-hidden="true" />
          </button>
          <button type="button" aria-label="Siguientes destacados" title="Siguientes destacados"
            onClick={() => scroller.current?.scrollBy({ left: scroller.current.clientWidth, behavior: 'smooth' })}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:border-forest-green">
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>}
      </div>
      <div ref={scroller} role="region" aria-label="Artículos destacados"
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
        {list.map(item => {
          const title = item.title || item.titulo || 'Artículo';
          const image = item.image_url || item.imagen_url_principal || item.imagen_url
            || item.imagenes?.[0] || item.imagenes_db?.[0] || item.articulo_imagenes?.[0]?.url;
          const category = item.category || item.categoria || item.categoria_es || item.category_name || '';
          const isSale = isSaleArticle(item);
          const requestCount = Math.max(0, Math.floor(Number(item.interested_count) || 0));
          return <button key={item.id} type="button" aria-label={`Destacado: ${title}`}
            onClick={() => onItemClick?.(item)}
            className="flex w-60 max-w-full shrink-0 snap-start flex-col overflow-hidden rounded-lg border border-yellow-200 bg-white text-left hover:border-yellow-500 focus-visible:outline-forest-green">
            <div className="relative aspect-[4/3] w-full shrink-0 bg-gray-100">
              {image && <img src={image} alt={title} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />}
              <span className="absolute left-2 top-2 rounded bg-yellow-400 px-2 py-1 text-[10px] font-black text-gray-900">DESTACADO</span>
              {!isSale && <span
                title={`${requestCount} ${requestCount === 1 ? 'solicitud de donación' : 'solicitudes de donación'}`}
                className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 rounded-lg bg-white/95 px-2 py-1 text-[11px] font-bold text-gray-800 shadow-sm">
                <Users size={14} aria-hidden="true" />
                {requestCount} {requestCount === 1 ? 'solicitud' : 'solicitudes'}
              </span>}
            </div>
            <div className="w-full min-w-0 p-3">
              <h3 className="truncate text-sm font-black text-gray-800">{title}</h3>
              <p className="mt-1 h-4 truncate text-[11px] text-gray-400" title={category || undefined}>{category}</p>
              <p className="mt-1 truncate text-xs text-gray-500">
                {item.city || item.ciudad}{(item.locality || item.localidad_es) ? `, ${item.locality || item.localidad_es}` : ''}
              </p>
              <p className="mt-2 text-sm font-black text-forest-green">
                {isSale ? Number(item.price ?? item.precio ?? 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }) : 'GRATIS'}
              </p>
            </div>
          </button>;
        })}
      </div>
    </section>
  );
}
