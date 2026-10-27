import StyledSelect from "../components/StyledSelect.jsx";
import { useState } from 'react';
import { Plus,X } from 'lucide-react';
import useLocations from "../data/useLocations.js";
import { ARTICLE_CATEGORIES } from './moderation.js';

export default function StaffSponsorTargeting({draft,change,busy}) {
  const { COLOMBIA_DATA } = useLocations();
  const [city,setCity]=useState(''),[locality,setLocality]=useState('');
  const zones=draft.target_locations||[],categories=draft.target_categories||[];
  const add=()=>{
    if(!city)return;
    const rest=zones.filter(zone=>zone.city!==city||(locality&&zone.locality&&zone.locality!==locality));
    change('target_locations',[...rest,{city,locality}]);setLocality('');
  };
  return <>
    <fieldset className="staff-sponsor-targeting" disabled={busy}><legend>Cobertura geográfica</legend>
      <p className="staff-item-detail">{zones.length?`${zones.length} zonas seleccionadas`:'Toda la plataforma'}</p>
      <div className="staff-sponsor-fields"><div><label htmlFor="sponsor-city">Ciudad</label><StyledSelect id="sponsor-city" value={city} onChange={event=>{setCity(event.target.value);setLocality('');}}><option value="">Seleccionar ciudad</option>{COLOMBIA_DATA.map(item=><option key={item.city}>{item.city}</option>)}</StyledSelect></div>
      <div><label htmlFor="sponsor-locality">Localidad / zona</label><select id="sponsor-locality" value={locality} onChange={event=>setLocality(event.target.value)} disabled={!city||busy}><option value="">Toda la ciudad</option>{(COLOMBIA_DATA.find(item=>item.city===city)?.localities||[]).map(item=><option key={item}>{item}</option>)}</select></div></div>
      <button type="button" className="staff-button" onClick={add} disabled={!city||zones.length>=100}><Plus size={16} />Añadir zona</button>
      <ul className="staff-sponsor-zones">{zones.map((zone,index)=><li key={`${zone.city}-${zone.locality}`}><span>{zone.city} · {zone.locality||'Toda la ciudad'}</span><button type="button" className="site-icon-close inline-flex items-center justify-center staff-icon-button" title="Quitar zona" aria-label={`Quitar zona ${zone.city} ${zone.locality}`} onClick={()=>change('target_locations',zones.filter((_,position)=>position!==index))}><X size={16} /></button></li>)}</ul>
      {zones.length>0&&<button type="button" className="staff-button" onClick={()=>change('target_locations',[])}>Cobertura general</button>}
    </fieldset>
    <fieldset className="staff-sponsor-targeting" disabled={busy}><legend>Categorías</legend>
      <label className="staff-permission"><input type="checkbox" checked={!categories.length} onChange={()=>change('target_categories',[])} />Todas las categorías</label>
      <div className="staff-sponsor-fields">{ARTICLE_CATEGORIES.map(category=><label key={category} className="staff-permission"><input type="checkbox" checked={categories.includes(category)} onChange={event=>change('target_categories',event.target.checked?[...categories,category]:categories.filter(item=>item!==category))} />{category}</label>)}</div>
    </fieldset>
  </>;
}
