export function searchMetric(filters,total) {
  const term=String(filters.search||'').normalize('NFC').toLocaleLowerCase('es').trim().replace(/\s+/g,' ');
  // Discard contact-like text rather than sending private data to analytics.
  if(term&&(!/^[\p{L}0-9\s-]{2,60}$/u.test(term)||!/\p{L}/u.test(term)
    ||(term.match(/[0-9]/g)||[]).length>=7||term.split(' ').length>6))return null;
  return {kind:'search',term,city:filters.city||'',locality:filters.locality==='Todas'?'':filters.locality||'',
    category:filters.category==='Todo'?'':filters.category||'',empty:total===0};
}

export function createMarketMetrics({send,visit,schedule=setTimeout,cancel=clearTimeout}) {
  const pending=new Map(),seen=new Set();let timer=null,inFlight=null,failures=0;
  const defer=()=>{if(timer===null&&pending.size&&failures<3)timer=schedule(()=>{timer=null;flush();},30_000);};
  const flush=(keepalive=false)=>{
    if(timer!==null){cancel(timer);timer=null;}
    if(inFlight||!pending.size||failures>=3)return inFlight||Promise.resolve();
    const batch=[...pending.entries()].slice(0,20);batch.forEach(([key])=>pending.delete(key));
    inFlight=Promise.resolve().then(()=>send({p_visit:visit,p_events:batch.map(([,event])=>event)},keepalive))
      .then(()=>{failures=0;}).catch(()=>{failures++;for(const [key,event]of batch)pending.set(key,event);})
      .finally(()=>{inFlight=null;defer();});return inFlight;
  };
  return {record(event){
    if(!event||seen.size>=200)return;
    const key=JSON.stringify(event.kind==='view'?['view',event.id]:['search',event.term,event.city,event.locality,event.category]);
    if(seen.has(key))return;seen.add(key);pending.set(key,event);defer();
  },flush};
}
