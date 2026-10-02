import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";

const sponsors = [
  {
    name: "Rueda Urbana",
    category: "Bicicletas y movilidad",
    description: "Una nueva vuelta para tu bicicleta.",
    image: "https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=640&q=75&auto=format&fit=crop",
    alt: "Bicicleta urbana",
  },
  {
    name: "Casa Verde",
    category: "Hogar y muebles",
    description: "Dale otra vida a tus espacios.",
    image: "https://images.unsplash.com/photo-1598300042247-d088f8ab3a91?w=640&q=75&auto=format&fit=crop",
    alt: "Silla para el hogar",
  },
  {
    name: "Página Abierta",
    category: "Libros y cultura",
    description: "Historias que pasan de mano en mano.",
    image: "https://images.unsplash.com/photo-1495446815901-a7297e633e8d?w=640&q=75&auto=format&fit=crop",
    alt: "Colección de libros",
  },
  {
    name: "Sonido Circular",
    category: "Tecnología y accesorios",
    description: "Encuentra el ritmo de tu día.",
    image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=640&q=75&auto=format&fit=crop",
    alt: "Audífonos sobre fondo amarillo",
  },
];

export default function SponsorCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const sponsor = sponsors[index];

  useEffect(() => {
    if (paused || hovered || focused) return;
    const timer = setInterval(() => setIndex(previous => (previous + 1) % sponsors.length), 6500);
    return () => clearInterval(timer);
  }, [paused, hovered, focused]);

  const move = direction => setIndex(previous => (previous + direction + sponsors.length) % sponsors.length);
  const controlClass = "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:border-forest-green hover:text-forest-green focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-green";

  return (
    <section aria-label="Patrocinadores" aria-roledescription="carrusel"
      className="min-w-0 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <h3 className="text-xs font-black uppercase text-gray-800">Patrocinadores</h3>
        <span className="text-[10px] font-medium text-gray-400">Anuncio de muestra</span>
      </div>
      <div aria-roledescription="diapositiva" aria-label={`${index + 1} de ${sponsors.length}`}>
        <div className="relative aspect-[16/9] bg-gray-100 lg:aspect-[4/3]">
          <img src={sponsor.image} alt={sponsor.alt} loading="lazy"
            className="absolute inset-0 h-full w-full object-cover" />
        </div>
        <div className="px-4 pt-4 pb-3">
          <p className="truncate text-[11px] font-semibold text-forest-green">{sponsor.category}</p>
          <h4 className="mt-1 h-7 truncate text-lg font-black text-gray-800">{sponsor.name}</h4>
          <p className="mt-1 h-10 line-clamp-2 text-sm leading-5 text-gray-500">{sponsor.description}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-4 py-3">
        <div className="flex items-center gap-1" role="group" aria-label="Seleccionar patrocinador">
          {sponsors.map((item, position) => (
            <button key={item.name} type="button" onClick={() => setIndex(position)}
              aria-label={`Ver patrocinador ${position + 1}: ${item.name}`}
              title={item.name} aria-current={position === index ? "true" : undefined}
              className="flex h-8 w-6 items-center justify-center rounded focus-visible:outline-2 focus-visible:outline-forest-green">
              <span className={`h-2 w-2 rounded-full ${position === index ? "bg-forest-green" : "bg-gray-300"}`} />
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Patrocinador anterior" title="Patrocinador anterior" className={controlClass} onClick={() => move(-1)}><ChevronLeft size={16} /></button>
          <button type="button" aria-label={paused ? "Reanudar patrocinadores" : "Pausar patrocinadores"}
            title={paused ? "Reanudar patrocinadores" : "Pausar patrocinadores"}
            className={controlClass} onClick={() => setPaused(previous => !previous)}>
            {paused ? <Play size={14} /> : <Pause size={14} />}
          </button>
          <button type="button" aria-label="Siguiente patrocinador" title="Siguiente patrocinador" className={controlClass} onClick={() => move(1)}><ChevronRight size={16} /></button>
        </div>
      </div>
    </section>
  );
}
