import { productCondition } from './productCondition.js';

const statuses = {available:'Disponible',disponible:'Disponible',reserved:'Reservado',reservado:'Reservado',
  delivered:'Entregado',entregado:'Entregado',paused:'Pausado',pausado:'Pausado',reviewing:'En revisión',en_revision:'En revisión'};

export function chatArticlePresentation(data) {
  const article = data || {};
  const rows = Array.isArray(article.articulo_imagenes)
    ? [...article.articulo_imagenes].sort((a,b) => (a?.position ?? 0)-(b?.position ?? 0)) : [];
  const values = [article.imagen_url_principal,article.image_url,article.imagen_url,
    ...(Array.isArray(article.imagenes) ? article.imagenes : []),...rows,
    ...(Array.isArray(article.imagenes_db) ? article.imagenes_db : [])];
  const images = [...new Set(values.map(value => {
    const url = typeof value === 'string' ? value : value?.url;
    return typeof url === 'string' ? url.trim() : '';
  }).filter(Boolean))];
  return {
    images,
    status:statuses[String(article.status || article.estado || '').trim().toLowerCase()] || 'No informado',
    condition:productCondition(article.estado_producto ?? article.estadoProducto ?? article.condition_score ?? article.conditionScore ?? article.estado_condicion ?? article.estado),
    locality:article.localidad_es || article.locality || article.localidad || '',
    city:article.city || article.ciudad || '',
  };
}
