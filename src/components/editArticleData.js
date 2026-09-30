export function getEditableArticle(article = {}) {
  const mode = String(article.mode || article.tipo || "donacion").toLowerCase();
  return {
    titulo: article.title || article.titulo || "",
    descripcion: article.description || article.descripcion || "",
    ciudad: article.city || article.ciudad || "",
    localidad_es: article.locality || article.localidad_es || "",
    categoria: article.category || article.categoria || "",
    subcategoria: article.subcategory || article.subcategoria || "",
    tipo: mode.includes("venta") ? "venta" : "donacion",
    price: article.price ?? article.precio ?? "",
    is_featured: !!(article.is_featured ?? article.isFeatured),
    estado_producto: article.estado_producto ?? null,
  };
}
