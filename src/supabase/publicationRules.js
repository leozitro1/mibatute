import {supabase} from './supabaseClient.js';
let cached=[],expires=0,pending;
export const cachedPublicationRules=()=>cached;
export function invalidatePublicationRules(){expires=0;}
export function loadPublicationRules(){
 if(Date.now()<expires)return Promise.resolve(cached);
 if(pending)return pending;
 pending=supabase.rpc('publication_text_rules').then(({data,error})=>{
  if(error)throw new Error('No se pudo cargar el filtro de publicaciones. El servidor comprobará el texto al guardar.');
  cached=Array.isArray(data)?data:[];expires=Date.now()+300000;return cached;
 }).finally(()=>{pending=null;});
 return pending;
}
