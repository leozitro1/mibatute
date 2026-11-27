import { MapPin, Store } from 'lucide-react';
import './LocalSponsoredCard.css';

export default function LocalSponsoredCard() {
  return <div className="home-listing home-listing--sponsored">
    <article aria-label="Publicidad: Taller Vuelta, marca ficticia" className="product-card local-sponsored-card relative flex h-full min-h-[376px] w-full flex-col overflow-hidden rounded-lg border-2 bg-white">
      <div className="product-card-photo relative h-48 shrink-0">
        <img src="/demo-furniture-sponsor.jpg" alt="Sala con muebles de madera y sillas tapizadas" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        <span className="local-sponsored-label">Publicidad</span>
      </div>
      <div className="product-card-body flex min-h-0 flex-1 flex-col p-4">
        <p className="product-card-location mb-1 flex min-w-0 items-center text-xs text-forest-green">
          <MapPin size={12} className="mr-1 shrink-0" aria-hidden="true" />Bogotá, Chapinero
        </p>
        <h3 className="min-w-0 truncate font-bold text-gray-800" title="Restauración de muebles">Restauración de muebles</h3>
        <p className="product-card-interest-summary is-sale"><span className="product-card-description">Reparamos sillas, mesas y muebles de madera para que sigan contigo.</span></p>
        <div className="local-sponsored-brand">
          <span className="local-sponsored-seller" title="Vendedor registrado" role="img" aria-label="Vendedor registrado"><Store size={17} aria-hidden="true" /></span>
          <strong>Taller Vuelta</strong>
        </div>
        <div className="product-card-actions flex items-center justify-between gap-2">
          <span className="text-lg font-black text-forest-green">$ 80.000</span>
          <a href="https://www.google.com/" target="_blank" rel="sponsored noopener noreferrer"
            className="local-sponsored-cta px-3 py-1 rounded-md text-xs font-bold transition text-forest-green border border-forest-green"
            title="Abrir enlace de prueba en Google (nueva pestaña)">
            Lo quiero
          </a>
        </div>
      </div>
    </article>
  </div>;
}
