import { useMemo } from "react";

/**
 * Barra de destacados: carrusel horizontal automático (derecha -> izquierda)
 * - Se pausa al pasar el mouse
 * - Duplica la lista para que el loop sea continuo
 * - Al hacer click, entrega el item a onItemClick
 */
export default function FeaturedTicker({ items = [], onItemClick }) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];

  // Duplicamos para loop continuo
  const doubled = useMemo(() => {
    if (!list.length) return [];
    return [...list, ...list];
  }, [list]);

  if (!list.length) return null;

  return (
    // ✅ Separación más compacta con el HeroBanner
    <div className="mt-2">
      {/* ✅ Fondo del carrusel en verde de la app (sin bordes naranjas) */}
      <div className="w-full bg-forest-green rounded-3xl shadow-sm overflow-hidden border border-white/10">
        <div className="relative">
          {/* pista */}
          <div className="ticker-track">
            {doubled.map((it, idx) => {
              const title = it?.titulo || it?.title || "Artículo";
              const city = it?.ciudad || it?.city || "";
              const locality = it?.locality || it?.localidad_es || it?.localidad || "";
              const cat = it?.categoria || it?.category || "";
              const desc = String(it?.descripcion || it?.description || "").trim();

              const img =
                it?.imagen_url_principal ||
                it?.imagenUrlPrincipal ||
                (Array.isArray(it?.imagenes) ? it.imagenes[0] : "") ||
                "";

              return (
                <button
                  key={`${it?.id || "x"}-${idx}`}
                  type="button"
                  onClick={() => onItemClick?.(it)}
                  className="ticker-card"
                  title={title}
                  aria-label={`Destacado: ${title}`}
                >
                  {/* ✅ un poco más alto/visual: thumbnail más grande */}
                  <div className="w-20 h-20 rounded-2xl bg-gray-100 overflow-hidden border border-gray-200 shrink-0">
                    {img ? (
                      <img
                        src={img}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    ) : null}
                  </div>

                  <div className="min-w-0 flex-1 text-left">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13px] font-black text-gray-900 truncate leading-tight">{title}</p>
                    </div>

                    {/* ✅ Menos espacio en blanco: descripción compacta */}
                    {desc ? (
                      <p className="mt-0.5 text-[12px] text-gray-700 font-semibold truncate leading-tight">
                        {desc}
                      </p>
                    ) : null}

                    {/* ✅ Ciudad + Localidad */}
                    <p className="mt-0.5 text-[11px] text-gray-500 font-bold truncate leading-tight">
                      {cat ? `${cat} • ` : ""}
                      {city}
                      {locality ? `, ${locality}` : ""}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* estilos locales */}
          <style>{`
            .ticker-track{
              display:flex;
              gap:12px;
              padding:12px;
              width:max-content;
              animation: tickerMove 35s linear infinite;
            }
            .ticker-track:hover{ animation-play-state: paused; }

            .ticker-card{
              display:flex;
              align-items:center;
              gap:10px;
              min-width: 340px;
              max-width: 420px;
              padding:12px;
              border-radius: 24px;
              background: #ffffff;
              border: 1px solid rgba(0,0,0,.06);
              box-shadow: 0 8px 30px rgba(0,0,0,.04);
              transition: transform .15s ease;
            }
            .ticker-card:hover{
              transform: translateY(-1px);
            }

            @keyframes tickerMove{
              0% { transform: translateX(0); }
              100% { transform: translateX(-50%); }
            }

            @media (max-width: 640px){
              .ticker-card{ min-width: 300px; }
              .ticker-track{ animation-duration: 28s; }
            }
          `}</style>
        </div>
      </div>
    </div>
  );
}