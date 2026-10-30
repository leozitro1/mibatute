export function patchMobileFilters(value, patch) {
  const next = {...value,...patch};
  if ('category' in patch && patch.category !== value.category) next.subcategory = '';
  if ('city' in patch && patch.city !== value.city) next.locality = 'Todas';
  return next;
}

export function resetMobileFilters(value) {
  return {...value,category:'Todo',subcategory:'',locality:'Todas',kind:'todo',onlyActive:false,minCondition:0,sort:'random',hideOwn:false,searchMode:'related'};
}

export function mobileFilterChips(value) {
  const chips = [];
  if (value.category !== 'Todo') chips.push({key:'category',label:value.subcategory || value.category,patch:{category:'Todo',subcategory:''}});
  if (value.locality !== 'Todas') chips.push({key:'locality',label:value.locality,patch:{locality:'Todas'}});
  if (value.kind !== 'todo') chips.push({key:'kind',label:({donacion:'Donaciones',venta:'Ventas',destacado:'Destacadas'})[value.kind],patch:{kind:'todo'}});
  if (value.minCondition > 0) chips.push({key:'condition',label:`Estado desde ${value.minCondition}/10`,patch:{minCondition:0}});
  if (value.onlyActive) chips.push({key:'active',label:'Solo disponibles',patch:{onlyActive:false}});
  if (value.hideOwn) chips.push({key:'own',label:'Sin mis anuncios',patch:{hideOwn:false}});
  if (value.sort !== 'random') chips.push({key:'sort',label:value.sort === 'newest' ? 'Más recientes' : 'Más antiguas',patch:{sort:'random'}});
  if (value.searchMode === 'specific') chips.push({key:'mode',label:'Búsqueda específica',patch:{searchMode:'related'}});
  return chips;
}
