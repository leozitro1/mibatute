export function createSponsorMetrics({send,visit,schedule=setTimeout,cancel=clearTimeout}) {
  const pending=new Map(),seen=new Set(),clicked=new Set();
  let timer=null,inFlight=null,failures=0,generation=0;
  const defer=()=>{if(timer===null&&pending.size&&failures<3)timer=schedule(()=>{timer=null;flush();},15_000);};
  const flush=(keepalive=false)=>{
    if(timer!==null){cancel(timer);timer=null;}
    if(inFlight||!pending.size||failures>=3)return inFlight||Promise.resolve();
    const batchGeneration=generation;
    const batch=[...pending.entries()].slice(0,20);batch.forEach(([key])=>pending.delete(key));
    inFlight=Promise.resolve().then(()=>send({p_visit:visit,p_events:batch.map(([,event])=>event)},keepalive))
      .then(()=>{failures=0;}).catch(()=>{
        if(batchGeneration!==generation)return;
        failures++;
        for(const [key,event] of batch)pending.set(key,{...event,clicked:event.clicked||!!pending.get(key)?.clicked});
      }).finally(()=>{inFlight=null;defer();});
    return inFlight;
  };
  const record=(id,placement,isClick)=>{
    if(!id||!['hero','footer'].includes(placement)||seen.size>=200)return;
    const key=`${placement}:${id}`;
    if(isClick?clicked.has(key):seen.has(key))return;
    seen.add(key);if(isClick)clicked.add(key);
    pending.set(key,{id,placement,seen:true,clicked:isClick||!!pending.get(key)?.clicked});
    if(isClick||pending.size>=20)flush();else defer();
  };
  return {impression:(id,placement)=>record(id,placement,false),click:(id,placement)=>record(id,placement,true),flush,clear(){generation++;if(timer!==null){cancel(timer);timer=null;}pending.clear();seen.clear();clicked.clear();failures=0;}};
}
