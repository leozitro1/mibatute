export function getEditableArticle(article = {}) {
  const mode = String(article.mode || article.tipo || "donacion").toLowerCase();
  return {
    title: article.title || article.titulo || "",
    description: article.description || article.descripcion || "",
    city: article.city || article.ciudad || "",
    locality: article.locality || article.localidad_es || "",
    category: article.category || article.categoria || "",
    subcategory: article.subcategory || article.subcategoria || "",
    mode: mode.includes("venta") ? "venta" : "donacion",
    price: article.price ?? article.precio ?? "",
    is_featured: !!(article.is_featured ?? article.isFeatured),
    conditionScore: article.estado_producto ?? 8,
  };
}
