import { useEffect,useState } from 'react';
import { supabase } from '../supabase/supabaseClient';
import { createSponsorMetrics } from './metricsQueue.js';
import { safeSponsorUrl,sponsorContext } from './model.js';

const cache=new Map();
let tracker,seed;
function slots(context) {
  const key=JSON.stringify(context),previous=cache.get(key);
  if(previous?.expires>Date.now())return Promise.resolve(previous.items);
  if(previous?.promise)return previous.promise;
  if(!seed)seed=crypto.randomUUID();
  const entry={};cache.set(key,entry);
  if(cache.size>20)cache.delete(cache.keys().next().value);
  entry.promise=supabase.rpc('public_sponsor_slots',{...context,p_seed:seed}).then(({data,error})=>{
    if(error)throw error;
    const clean=asset=>({imagen_url:safeSponsorUrl(asset.imagen_url,import.meta.env.DEV),mobile_image_url:safeSponsorUrl(asset.mobile_image_url,import.meta.env.DEV)});
    entry.items=(data||[]).map(item=>({...item,...clean(item),creative_assets:(item.creative_assets||[]).map(clean).filter(asset=>asset.imagen_url),enlace:safeSponsorUrl(item.enlace)})).filter(item=>item.imagen_url);
    entry.expires=Date.now()+60_000;return entry.items;
  }).finally(()=>{entry.promise=null;});
  return entry.promise;
}
export function useSponsorSlots(placement,filters) {
  const context=sponsorContext(filters),key=JSON.stringify(context);
  const [result,setResult]=useState({key:'',items:[]});
  useEffect(()=>{
    let active=true;
    const load=()=>slots(JSON.parse(key)).then(items=>{if(active)setResult({key,items:items.filter(item=>item.placement===placement)});}).catch(()=>{});
    const timer=setTimeout(load,200);window.addEventListener('focus',load);
    return()=>{active=false;clearTimeout(timer);window.removeEventListener('focus',load);};
  },[placement,key]);
  return result.key===key?result.items:[];
}
function metrics() {
  if(!tracker) {
    tracker=createSponsorMetrics({visit:crypto.randomUUID(),send:async(payload,keepalive)=>{
      const response=await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/record_sponsor_metrics`,{
        method:'POST',keepalive,headers:{'Content-Type':'application/json',apikey:import.meta.env.VITE_SUPABASE_ANON_KEY,Authorization:`Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`},body:JSON.stringify(payload),
      });
      if(!response.ok)throw new Error('No se pudo registrar el lote.');
    }});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')tracker.flush(true);});
    window.addEventListener('pagehide',()=>tracker.flush(true));
  }
  return tracker;
}
export const recordSponsorClick=(id,placement)=>metrics().click(id,placement);
export function useSponsorImpression(ref,id,placement) {
  useEffect(()=>{
    if(!id||!ref.current||typeof IntersectionObserver==='undefined')return;
    let timer=null,visible=false;
    const reset=()=>{if(timer!==null)clearTimeout(timer);timer=null;};
    const update=()=>{
      reset();if(visible&&document.visibilityState==='visible')timer=setTimeout(()=>metrics().impression(id,placement),1000);
    };
    const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting&&entry.intersectionRatio>=.5;update();},{threshold:[0,.5,1]});
    observer.observe(ref.current);document.addEventListener('visibilitychange',update);
    return()=>{reset();observer.disconnect();document.removeEventListener('visibilitychange',update);};
  },[ref,id,placement]);
}
