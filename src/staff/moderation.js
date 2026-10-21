export const DELETION_REASONS=[
  ['prohibited','Artículo prohibido'],['fraud','Posible fraude o información engañosa'],
  ['duplicate','Publicación duplicada o spam'],['inappropriate','Contenido o imágenes inapropiadas'],
  ['privacy','Exposición de datos personales'],['unavailable','Artículo no disponible'],
  ['community','Incumplimiento de las normas de la comunidad'],['other','Otro motivo'],
];
export const CORRECTION_REASONS=[
  ['contact','Datos de contacto en la publicación'],
  ['restricted','Palabras restringidas o lenguaje inapropiado'],
  ['misleading','Información falsa o engañosa'],
  ['privacy','Exposición de datos personales'],
  ['photos','Fotos incorrectas o inapropiadas'],
  ['description','Título o descripción que no corresponde al artículo'],
  ['community','Incumplimiento de las normas de la comunidad'],
  ['other','Otro ajuste de moderación'],
];

export function correctionReason(code,details='') {
  const label=CORRECTION_REASONS.find(([value])=>value===code)?.[1];
  if(!label)return '';
  const extra=details.trim();
  return extra?`${label}: ${extra}`:label;
}
export { ARTICLE_CATEGORIES } from '../data/categories.js';
export const EMPTY_ARTICLE_FILTERS={mode:'',city:'',locality:'',status:'',category:'',chat:'',featured:'',owner_id:''};

export function articleImages(article) {
  const images=Array.isArray(article?.imagenes)?article.imagenes:[];
  return [...new Set([article?.image_url,...images.map(value=>typeof value==='string'?value:value?.url)].filter(Boolean))]
    .filter(value=>{try{return ['https:','http:'].includes(new URL(value).protocol);}catch{return false;}});
}
