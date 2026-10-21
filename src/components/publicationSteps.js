import { LOCATIONS } from '../data/locations.js';
import { detectContactoProhibido } from './articleValidation.js';

export const PUBLICATION_STEPS = [
  { label:'Tipo', title:'¿Quieres vender o donar?', hint:'Elige cómo quieres darle otra oportunidad a tu artículo.' },
  { label:'Fotos', title:'Muéstralo tal como está', hint:'Agrega entre 1 y 4 fotos reales. La primera será la portada. No incluyas datos de contacto.' },
  { label:'Artículo', title:'Cuéntanos qué vas a publicar', hint:'Describe su estado con honestidad, especialmente si tiene daños o sirve para repuestos.' },
  { label:'Ubicación', title:'¿Dónde se puede recoger?', hint:'Solo publicamos la ciudad y localidad. La dirección exacta se acuerda después por el chat.' },
  { label:'Revisión', title:'Revisa antes de publicar', hint:'Comprueba las fotos, los datos y si tu publicación requiere un crédito.' },
];

export function publicationStepError(step,{selectedMode,formData,files,categories}) {
  if(step===0)return ['venta','donacion'].includes(selectedMode)?'':'Elige Venta o Donación para continuar.';
  if(step===1)return files.length>=1&&files.length<=4?'':'Agrega entre 1 y 4 fotos para continuar.';
  if(step===2){
    if(!formData.title.trim())return 'Escribe un título para tu artículo.';
    const category=categories.find(item=>item.key===formData.category);
    if(!category||!category.subs.includes(formData.subcategory))return 'Selecciona una categoría y subcategoría válidas.';
    if(selectedMode==='venta'&&(!Number.isFinite(Number(formData.price))||Number(formData.price)<=0||Number(formData.price)>500000))return 'El precio debe estar entre $1 y $500.000 COP.';
    if(!Number.isInteger(Number(formData.conditionScore))||Number(formData.conditionScore)<1||Number(formData.conditionScore)>10)return 'Indica el estado del artículo entre 1 y 10.';
    if(!formData.description.trim())return 'Describe el artículo, su estado y los detalles que debe conocer quien lo recibe.';
    return detectContactoProhibido(formData.description)||'';
  }
  if(step===3){
    if(!LOCATIONS[formData.city])return 'Selecciona una ciudad.';
    if(!LOCATIONS[formData.city].includes(formData.locality))return 'Selecciona una localidad de esa ciudad.';
  }
  return '';
}
