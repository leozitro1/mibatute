// src/components/HeroBanner.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabase/supabaseClient";

/**
 * HeroBanner (Slider)
 * - 3 slides: Cómo funciona, Blog & tutoriales, Publicidad (monetización)
 * - Visualización únicamente: si no pasas callbacks, solo hace console.log
 *
 * Props (opcionales):
 *  - onLearnMore: callback para el botón del slide 1 (compatibilidad con tu versión anterior)
 *  - onBlog: callback para el botón del slide 2
 *  - onAds: callback para el botón del slide 3
 */
export default function HeroBanner({ onLearnMore, onBlog, onAds }) {
  const [currentAd, setCurrentAd] = useState(null);
  const impressionRegisteredRef = useRef(new Set());

  const loadAd = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("patrocinadores")
        .select("id,imagen_url,texto,descripcion,enlace")
        .eq("activo", true)
        .limit(10);
      if (error || !data?.length) return;
      const pick = data[Math.floor(Math.random() * data.length)];
      setCurrentAd(pick);
    } catch {}
  }, []);

  useEffect(() => { loadAd(); }, [loadAd]);

  useEffect(() => {
    if (!currentAd?.id) return;
    if (impressionRegisteredRef.current.has(currentAd.id)) return;
    impressionRegisteredRef.current.add(currentAd.id);
    (async () => { try { await supabase.rpc("reg_impresion", { p_ad_id: currentAd.id }); } catch {} })();
  }, [currentAd?.id]);

  const handleAdClick = useCallback(() => {
    if (!currentAd) { onAds?.(); return; }
    (async () => { try { await supabase.rpc("reg_clic", { p_ad_id: currentAd.id }); } catch {} })();
    if (currentAd.enlace) window.open(currentAd.enlace, "_blank", "noopener,noreferrer");
  }, [currentAd, onAds]);

  const slides = useMemo(
    () => [
      {
        key: "how",
        badge: "Economía Circular",
        title: (
          <>
            Tu basura es el <span className="text-treasure-gold">tesoro</span> de alguien más.
          </>
        ),
        desc:
          "Aprende a publicar, donar, vender o intercambiar. Tips para que tu artículo salga más rápido.",
        cta: "¿Cómo funciona?",
        onClick: () => (onLearnMore ? onLearnMore() : console.log("CTA: cómo funciona")),
        img:
          "https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?q=80&w=1600&auto=format&fit=crop",
        aria: "Ver cómo funciona Mi Batute",
      },
      {
        key: "ads",
        badge: "Publicidad",
        title: currentAd?.texto ? <>{currentAd.texto}</> : <>Este espacio se puede vender</>,
        desc: currentAd?.descripcion || (currentAd ? null : "Una forma de monetización: anuncia tu marca aquí. Primero verás planes y precios (como debe ser)."),
        cta: currentAd ? "Visitar sitio →" : "Ver planes y precios",
        onClick: handleAdClick,
        img: currentAd?.imagen_url || "https://images.unsplash.com/photo-1557838923-2985c318be48?q=80&w=1600&auto=format&fit=crop",
        aria: currentAd ? "Visitar patrocinador" : "Ver planes y precios para publicidad",
        isAdSlot: true,
      },
      {
        key: "blog",
        badge: "Blog y tutoriales",
        title: <>Ideas reales para reciclar y reutilizar</>,
        desc:
          "Guías, ejemplos y trucos prácticos para darle segunda vida a tus cosas (y ayudar al planeta).",
        cta: "Ver tutoriales",
        onClick: () => (onBlog ? onBlog() : console.log("CTA: blog y tutoriales")),
        img:
          "https://images.unsplash.com/photo-1528323273322-d81458248d40?q=80&w=1600&auto=format&fit=crop",
        aria: "Ver blog y tutoriales",
      },

    ],
    [onLearnMore, onBlog, currentAd, handleAdClick]
  );

  const [index, setIndex] = useState(0);
  const [isPaused, setPaused] = useState(false);
  const total = slides.length;

  const intervalRef = useRef(null);

  function clampNext(i) {
    const n = i % total;
    return n < 0 ? n + total : n;
  }

  const go = (next) => setIndex((i) => clampNext(typeof next === "function" ? next(i) : next));
  const prev = () => go((i) => i - 1);
  const next = () => go((i) => i + 1);

  // Auto-advance (pausa al hover/focus)
  useEffect(() => {
    if (isPaused) return;

    // 6.5s se siente moderno/relajado
    intervalRef.current = setInterval(() => {
      setIndex((i) => clampNext(i + 1));
    }, 6500);

    return () => clearInterval(intervalRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPaused, total]);

  const active = slides[index];

  return (
    <section
      className="relative mb-8 overflow-hidden rounded-3xl border border-white/10 bg-forest-green shadow-sm"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      aria-label="Banner principal"
    >
      {active.isAdSlot && (
        <div className="absolute top-3 right-3 z-10">
          <span className="inline-flex items-center rounded-full bg-black/40 backdrop-blur-sm px-2.5 py-1 text-[10px] font-bold text-white/70 uppercase tracking-widest border border-white/10">
            Publicidad
          </span>
        </div>
      )}

      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center transition-opacity duration-500"
        style={{ backgroundImage: `url('${active.img}')` }}
        aria-hidden="true"
      />
      {/* Overlays for legibility */}
      <div className={`absolute inset-0 ${active.isAdSlot ? "bg-black/20" : "bg-black/45"}`} aria-hidden="true" />
      <div
        className={`absolute inset-0 bg-gradient-to-r ${active.isAdSlot ? "from-black/40 via-black/15 to-black/5" : "from-black/65 via-black/35 to-black/15"}`}
        aria-hidden="true"
      />

      {/* Content */}
      <div className="relative px-6 py-8 sm:px-10 sm:py-10 md:px-14 md:py-14">
        <div className="flex flex-col gap-4 md:max-w-2xl">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-treasure-gold px-3 py-1 text-xs font-black uppercase tracking-wide text-black">
              {active.badge}
            </span>
            <span className="hidden sm:inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90 backdrop-blur">
              Desliza o usa las flechas
            </span>
          </div>

          <h1 className="text-3xl font-black leading-tight text-white sm:text-4xl md:text-5xl">
            {active.title}
          </h1>

          {active.desc && (
            <p className="max-w-xl text-sm text-white/85 sm:text-base">{active.desc}</p>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={active.onClick}
              className="inline-flex items-center justify-center rounded-xl bg-white px-7 py-3 text-sm font-black text-forest-green transition-colors hover:bg-treasure-gold hover:text-black active:opacity-90"
              aria-label={active.aria}
            >
              {active.cta}
            </button>

            {/* Secondary: next slide */}
            <button
              type="button"
              onClick={next}
              className="inline-flex items-center justify-center rounded-xl bg-white/10 px-5 py-3 text-sm font-bold text-white backdrop-blur transition hover:bg-white/15 active:opacity-90"
              aria-label="Ver siguiente banner"
            >
              Siguiente <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="mt-6 flex items-center justify-between gap-4">
          {/* Dots */}
          <div className="flex items-center gap-2">
            {slides.map((s, i) => {
              const isActive = i === index;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => go(i)}
                  className={[
                    "h-2.5 rounded-full transition-all",
                    isActive ? "w-8 bg-white" : "w-2.5 bg-white/50 hover:bg-white/70",
                  ].join(" ")}
                  aria-label={`Ir al banner ${i + 1}: ${s.badge}`}
                />
              );
            })}
          </div>

          {/* Arrows */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={prev}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white backdrop-blur transition hover:bg-white/15 active:opacity-90"
              aria-label="Banner anterior"
              title="Anterior"
            >
              <span aria-hidden="true">‹</span>
            </button>
            <button
              type="button"
              onClick={next}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white backdrop-blur transition hover:bg-white/15 active:opacity-90"
              aria-label="Siguiente banner"
              title="Siguiente"
            >
              <span aria-hidden="true">›</span>
            </button>
          </div>
        </div>

        {/* Progress hint */}
        <div className="mt-3 text-xs text-white/70">
          {index + 1} / {total} • {isPaused ? "Pausado" : "Auto"}
        </div>
      </div>
    </section>
  );
}
