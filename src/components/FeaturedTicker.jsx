import { useEffect, useMemo, useRef } from "react";

/**
 * Barra de destacados (carrusel):
 * - Auto-scroll suave (seamless) usando scrollLeft
 * - Se puede arrastrar con mouse (click + drag) o con touch
 * - Se pausa al pasar el mouse o mientras se arrastra
 */
export default function FeaturedTicker({ items = [], onItemClick }) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];

  // Duplicamos para loop continuo
  const doubled = useMemo(() => {
    if (!list.length) return [];
    return [...list, ...list];
  }, [list]);

  const scrollerRef = useRef(null);
  const pausedRef = useRef(false);
  const draggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartScrollLeftRef = useRef(0);

  if (!list.length) return null;

  // Auto-scroll continuo (permite interacción manual)
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    let raf = 0;
    let last = performance.now();

    const step = (now) => {
      const dt = Math.min(50, now - last);
      last = now;

      if (!pausedRef.current && !draggingRef.current) {
        // velocidad: px por segundo
        const speed = 55;
        el.scrollLeft += (speed * dt) / 1000;

        // Loop: como duplicamos la lista, reiniciamos en la mitad
        const half = el.scrollWidth / 2;
        if (half > 0 && el.scrollLeft >= half) el.scrollLeft -= half;
      }

      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [doubled.length]);

  const onPointerDown = (e) => {
    const el = scrollerRef.current;
    if (!el) return;
    draggingRef.current = true;
    pausedRef.current = true;
    dragStartXRef.current = e.clientX;
    dragStartScrollLeftRef.current = el.scrollLeft;
    try {
      el.setPointerCapture?.(e.pointerId);
    } catch {}
  };

  const onPointerMove = (e) => {
    const el = scrollerRef.current;
    if (!el || !draggingRef.current) return;
    const dx = e.clientX - dragStartXRef.current;
    el.scrollLeft = dragStartScrollLeftRef.current - dx;
  };

  const onPointerUp = (e) => {
    const el = scrollerRef.current;
    if (!el) return;
    draggingRef.current = false;
    try {
      el.releasePointerCapture?.(e.pointerId);
    } catch {}
    // mini delay para evitar “salto” al soltar
    setTimeout(() => {
      pausedRef.current = false;
    }, 120);
  };

  return (
    <div className="mt-2">
      <div className="w-full bg-forest-green rounded-3xl shadow-sm overflow-hidden border border-white/10">
        <div className="relative">
          {/* Scroller */}
          <div
            ref={scrollerRef}
            className="ticker-scroller"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onMouseEnter={() => (pausedRef.current = true)}
            onMouseLeave={() => {
              if (!draggingRef.current) pausedRef.current = false;
            }}
            role="region"
            aria-label="Artículos destacados"
          >
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
                      <p className="text-[13px] font-black text-gray-900 truncate leading-tight">{title}</p>

                      {desc ? (
                        <p className="mt-0.5 text-[12px] text-gray-700 font-semibold truncate leading-tight">
                          {desc}
                        </p>
                      ) : null}

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
          </div>

          <style>{`
            .ticker-scroller{
              overflow-x: auto;
              overflow-y: hidden;
              scrollbar-width: none; /* Firefox */
              -ms-overflow-style: none; /* IE/Edge legacy */
              cursor: grab;
              user-select: none;
              touch-action: pan-x;
              scroll-behavior: auto;
            }
            .ticker-scroller::-webkit-scrollbar{ display:none; }
            .ticker-scroller:active{ cursor: grabbing; }

            .ticker-track{
              display:flex;
              gap:12px;
              padding:12px;
              width:max-content;
            }

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
            .ticker-card:hover{ transform: translateY(-1px); }

            @media (max-width: 640px){
              .ticker-card{ min-width: 300px; }
            }
          `}</style>
        </div>
      </div>
    </div>
  );
}
