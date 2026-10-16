import { createMarketMetrics } from './metrics.js';

let tracker;
export function recordMarketMetric(event) {
  if(!event||navigator.doNotTrack==='1'||navigator.globalPrivacyControl===true)return;
  if(!tracker){
    tracker=createMarketMetrics({visit:crypto.randomUUID(),send:async(payload,keepalive)=>{
      const response=await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/record_market_metrics`,{
        method:'POST',keepalive,headers:{'Content-Type':'application/json',apikey:import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization:`Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`},body:JSON.stringify(payload),
      });
      if(!response.ok)throw new Error('No se pudo registrar el lote.');
    }});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')tracker.flush(true);});
    window.addEventListener('pagehide',()=>tracker.flush(true));
  }
  tracker.record(event);
}
