import { useEffect, useMemo, useRef } from "react";

/**
 * Barra de destacados (carrusel):
 * - Auto-scroll suave (seamless) usando scrollLeft
 * - Arrastre con mouse/touch (drag) para mover rápido
 * - Click en tarjeta abre detalle (si NO fue drag)
 *
 * Nota importante:
 * En desktop, usar Pointer Capture en el scroller suele "comerse" el click.
 * Por eso el drag se maneja con listeners en window solo cuando es necesario.
 */
export default function FeaturedTicker({ items = [], onItemClick }) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];

  // Duplicamos para loop continuo
  const doubled = useMemo(() => {
    if (!list.length) return [];
    return [...list, ...list];
  }, [list]);

  const scrollerRef = useRef(null);

  // Auto-scroll control
  const pausedRef = useRef(false);

  // Drag state
  const isPointerDownRef = useRef(false);
  const isDraggingRef = useRef(false);
  const suppressClickRef = useRef(false);
  const startXRef = useRef(0);
  const startScrollLeftRef = useRef(0);

  if (!list.length) return null;

  // Auto-scroll continuo (seamless)
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    let raf = 0;
    let last = performance.now();

    const step = (now) => {
      const dt = Math.min(50, now - last);
      last = now;

      // No mover si está pausado o en drag
      if (!pausedRef.current && !isDraggingRef.current) {
        const speed = 55; // px/seg
        el.scrollLeft += (speed * dt) / 1000;

        // Loop: como duplicamos, reiniciamos en la mitad
        const half = el.scrollWidth / 2;
        if (half > 0 && el.scrollLeft >= half) el.scrollLeft -= half;
      }

      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [doubled.length]);

  // Helpers de drag
  const endDrag = () => {
    isPointerDownRef.current = false;
    isDraggingRef.current = false;

    // Si hubo drag, evitamos el click fantasma al soltar
    if (suppressClickRef.current) {
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }

    // reanudar auto-scroll
    setTimeout(() => {
      pausedRef.current = false;
    }, 120);

    // quitar listeners
    window.removeEventListener("pointermove", onWindowPointerMove, { passive: false });
    window.removeEventListener("pointerup", onWindowPointerUp, { passive: false });
    window.removeEventListener("pointercancel", onWindowPointerUp, { passive: false });
  };

  const onWindowPointerMove = (e) => {
    const el = scrollerRef.current;
    if (!el || !isPointerDownRef.current) return;

    const dx = e.clientX - startXRef.current;

    // Umbral: para que click normal NO se convierta en drag
    if (!isDraggingRef.current && Math.abs(dx) > 6) {
      isDraggingRef.current = true;
      suppressClickRef.current = true;
    }

    if (isDraggingRef.current) {
      // evitar seleccionar texto / gestos raros en desktop
      e.preventDefault?.();
      el.scrollLeft = startScrollLeftRef.current - dx;

      // Mantener loop "seamless" también en drag
      const half = el.scrollWidth / 2;
      if (half > 0) {
        if (el.scrollLeft >= half) el.scrollLeft -= half;
        if (el.scrollLeft < 0) el.scrollLeft += half;
      }
    }
  };

  const onWindowPointerUp = (e) => {
    // Si hubo drag, cortamos propagación para evitar click fantasma
    if (suppressClickRef.current) {
      e.preventDefault?.();
      e.stopPropagation?.();
    }
    endDrag();
  };

  const onPointerDown = (e) => {
    const el = scrollerRef.current;
    if (!el) return;

    // Solo botón principal
    if (e.button != null && e.button !== 0) return;

    isPointerDownRef.current = true;
    isDraggingRef.current = false;
    suppressClickRef.current = false;

    pausedRef.current = true;
    startXRef.current = e.clientX;
    startScrollLeftRef.current = el.scrollLeft;

    // listeners en window (clave para que el click en desktop no se rompa)
    window.addEventListener("pointermove", onWindowPointerMove, { passive: false });
    window.addEventListener("pointerup", onWindowPointerUp, { passive: false });
    window.addEventListener("pointercancel", onWindowPointerUp, { passive: false });
  };

  return (
    <div className="mt-2">
      <div className="w-full bg-forest-green rounded-3xl shadow-sm overflow-hidden border border-white/10">
        <div className="relative">
          <div
            ref={scrollerRef}
            className="ticker-scroller"
            onPointerDown={onPointerDown}
            onMouseEnter={() => (pausedRef.current = true)}
            onMouseLeave={() => {
              if (!isPointerDownRef.current && !isDraggingRef.current) pausedRef.current = false;
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
                  it?.image_url ||
                  it?.imagen_url ||
                  (Array.isArray(it?.imagenes) ? it.imagenes[0] : "") ||
                  (Array.isArray(it?.imagenes_db) ? it.imagenes_db[0] : "") ||
                  (Array.isArray(it?.articulo_imagenes) ? it.articulo_imagenes?.[0]?.url : "") ||
                  "";

                return (
                  <button
                    key={`${it?.id || "x"}-${idx}`}
                    type="button"
                    // ✅ Importantísimo: cortar el click si fue drag
                    onClick={(e) => {
                      if (suppressClickRef.current || isDraggingRef.current) {
                        e.preventDefault();
                        e.stopPropagation();
                        return;
                      }
                      onItemClick?.(it);
                    }}
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
                          draggable={false}
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
