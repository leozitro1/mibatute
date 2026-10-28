export const ARTICLE_SIZES = [
  { value: 'pequeno', label: 'Pequeño', description: 'Puedes llevarlo en las manos o en una mochila.' },
  { value: 'mediano', label: 'Mediano', description: 'Podrías necesitar ayuda o un vehículo.' },
  { value: 'grande', label: 'Grande', description: 'Requiere transporte amplio y posiblemente varias personas.' },
];
export const articleSize = value => ARTICLE_SIZES.find(size => size.value === value) || null;
