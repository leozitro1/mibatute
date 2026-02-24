// src/components/HeroBanner.jsx
export default function HeroBanner({ onLearnMore }) {
  return (
    <div className="relative bg-forest-green rounded-3xl overflow-hidden mb-8 group">
      <div
        className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?q=80&w=1000')] bg-cover bg-center opacity-30 group-hover:scale-105 transition-transform duration-700"
        aria-hidden="true"
      />

      <div className="relative p-8 md:p-16 flex flex-col items-start gap-4">
        <span className="bg-treasure-gold text-black text-xs font-black px-3 py-1 rounded-full uppercase">
          Economía Circular
        </span>

        <h1 className="text-4xl md:text-5xl font-black text-white max-w-lg leading-tight">
          Tu basura es el <span className="text-treasure-gold">tesoro</span> de alguien más.
        </h1>

        <p className="text-green-100 max-w-md text-sm md:text-base">
          Dale una segunda vida a lo que ya no usas. Recicla, regala o vende chatarra y tesoros en tu localidad.
        </p>

        <button
          type="button"
          onClick={() => onLearnMore?.()}
          className="bg-white text-forest-green px-8 py-3 rounded-xl font-black hover:bg-treasure-gold hover:text-black transition-colors"
          aria-label="Ver cómo funciona MiBatute"
        >
          ¿Cómo funciona?
        </button>
      </div>
    </div>
  );
}
