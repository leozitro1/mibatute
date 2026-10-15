export const SPONSOR_STATES={active:'Activo',paused:'Pausado',scheduled:'Programado',expired:'Vencido'};
export function safeSponsorUrl(value,localImages=false) {
  try {
    const url=new URL(String(value||''));
    if(url.username||url.password||url.href.length>2048)return '';
    if(url.protocol==='https:'||(localImages&&url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))return url.href;
  } catch { /* Invalid destinations are never made clickable. */ }
  return '';
}
export function ctr(impressions,clicks) {
  return new Intl.NumberFormat('es-CO',{style:'percent',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(impressions)>0?Number(clicks)/Number(impressions):0);
}
export function bogotaInput(value) {
  if(!value)return '';
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(part=>[part.type,part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
export function bogotaIso(value) {return value?new Date(`${value}:00-05:00`).toISOString():null;}

export function sponsorContext({city='',locality='',category=''}={}) {
  return {p_city:city,p_locality:locality==='Todas'?'':locality,p_category:category==='Todo'?'':category};
}
export function sponsorCreative(campaign,round=0) {
  const assets=campaign?.creative_assets;
  if(!assets?.length)return campaign;
  return {...campaign,...assets[((round%assets.length)+assets.length)%assets.length]};
}
export function sponsorCoverage(campaign) {
  const zones=campaign.target_locations||[],categories=campaign.target_categories||[];
  return `${zones.length?zones.map(zone=>[zone.city,zone.locality].filter(Boolean).join(' / ')).join(', '):'Cobertura general'} · ${categories.length?categories.join(', '):'Todas las categorías'}`;
}
