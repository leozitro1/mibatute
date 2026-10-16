import { Sofa, Monitor, Hammer, Shirt, Recycle, Blocks, Bike, BookOpen, PawPrint, Clock, LayoutGrid } from 'lucide-react';

const icons = {
  'Hogar & Muebles': Sofa,
  'Electrónica & Tecnología': Monitor,
  'Construcción & Herramientas': Hammer,
  'Ropa & Textiles': Shirt,
  'Reciclaje & Reutilización': Recycle,
  'Infantil & Juguetes': Blocks,
  'Deportes & Movilidad': Bike,
  'Libros & Educación': BookOpen,
  Mascotas: PawPrint,
  'Antigüedades & Coleccionables': Clock,
};

export default function CategoryIcon({ category }) {
  const Icon = icons[category] || LayoutGrid;
  return <Icon size={19} strokeWidth={1.65} aria-hidden="true" className="category-line-icon shrink-0" />;
}
