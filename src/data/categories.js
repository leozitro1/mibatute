// Una sola lista para publicar, editar, moderar y filtrar.
// Conservar los nombres existentes: las publicaciones guardan estos textos.
export const CATEGORY_TREE = [
  {"key": "Hogar & Muebles", "label": "🌿 Hogar & Muebles", "subs": ["Muebles", "Decoración", "Electrodomésticos", "Colchones", "Cocina", "Iluminación", "Jardín & Plantas", "Organización & Limpieza", "Ropa de cama & Baño", "Otros"]},
  {"key": "Electrónica & Tecnología", "label": "⚡ Electrónica & Tecnología", "subs": ["Celulares", "Computadores", "Televisores", "Repuestos", "Chatarra electrónica", "Audio & Sonido", "Videojuegos & Consolas", "Cámaras & Fotografía", "Accesorios tecnológicos", "Otros"]},
  {"key": "Construcción & Herramientas", "label": "🧱 Construcción & Herramientas", "subs": ["Materiales", "Herramientas", "Oficios", "Madera", "Metales", "Baños & Sanitarios", "Plomería & Grifería", "Puertas & Ventanas", "Electricidad", "Pisos & Revestimientos", "Pintura & Acabados", "Otros"]},
  {"key": "Ropa & Textiles", "label": "👕 Ropa & Textiles", "subs": ["Ropa", "Retazos", "Telas", "Uniformes", "Calzado", "Bolsos & Maletas", "Accesorios", "Ropa de trabajo", "Otros"]},
  {"key": "Reciclaje & Reutilización", "label": "🔄 Reciclaje & Reutilización", "subs": ["Plásticos", "Vidrio", "Cartón", "Materias primas", "Papel", "Textiles para reciclar", "Caucho", "Envases & Empaques", "Otros"]},
  {"key": "Infantil & Juguetes", "label": "🧸 Infantil & Juguetes", "subs": ["Juguetes", "Ropa infantil", "Coches y sillas", "Lactancia", "Escolar", "Muebles infantiles", "Seguridad infantil", "Juegos de mesa", "Otros"]},
  {"key": "Deportes & Movilidad", "label": "🚲 Deportes & Movilidad", "subs": ["Bicicletas", "Patines", "Gimnasio", "Autopartes", "Motos", "Camping & Aire libre", "Deportes de equipo", "Accesorios de movilidad", "Cascos & Protección", "Otros"]},
  {"key": "Libros & Educación", "label": "📚 Libros & Educación", "subs": ["Libros", "Cuadernos y útiles", "Cursos y material", "Tecnología educativa", "Instrumentos", "Material de arte & Manualidades", "Material de oficina", "Otros"]},
  {"key": "Mascotas", "label": "🐶 Mascotas", "subs": ["Accesorios", "Alimento", "Camas y casas", "Salud", "Juguetes", "Transportadoras", "Higiene & Cuidado", "Acuarios & Accesorios", "Otros"]},
  {"key": "Antigüedades & Coleccionables", "label": "🕰 Antigüedades & Coleccionables", "subs": ["Monedas", "Relojes", "Arte", "Coleccionables", "Vintage", "Discos & Música", "Figuras & Miniaturas", "Sellos & Postales", "Otros"]},
];

export const ARTICLE_CATEGORIES = CATEGORY_TREE.map(category => category.key);
