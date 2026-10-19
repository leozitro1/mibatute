import { metricsAllowed,METRICS_EVENT,METRICS_KEY } from '../legal/preferences.js';
import { createMarketMetrics } from './metrics.js';

let tracker;
window.addEventListener(METRICS_EVENT,event=>{if(!event.detail?.accepted)tracker?.clear();});
window.addEventListener('storage',event=>{if((event.key===METRICS_KEY||event.key===null)&&event.newValue!=='accepted')tracker?.clear();});
export function recordMarketMetric(event) {
  if(!event||!metricsAllowed(localStorage,navigator)){tracker?.clear();return;}
  if(!tracker){
    tracker=createMarketMetrics({visit:crypto.randomUUID(),send:async(payload,keepalive)=>{
      if(!metricsAllowed(localStorage,navigator))return;
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
