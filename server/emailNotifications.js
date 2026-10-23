import {renderActivityEmail} from '../src/email/templates.js';

export async function deliverNotifications({client,apiKey,from,fetcher=fetch,max=10}) {
  let sent=0,failed=0;
  for(let index=0;index<max;index++) {
    const {data:item,error}=await client.rpc('email_claim');
    if(error)throw new Error('No se pudo consultar la cola.');
    if(!item)break;
    let state='uncertain',providerId=null,errorCode='network_uncertain',stop=false;
    try {
      const response=await fetcher('https://api.resend.com/emails',{
        method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':`mibatute-event/${item.id}`},
        body:JSON.stringify({from,to:[item.to],...renderActivityEmail(item)}),
        signal:AbortSignal.timeout(15000),
      });
      const body=await response.json().catch(()=>({}));
      if(response.ok&&typeof body.id==='string'){state='sent';providerId=body.id;errorCode=null;}
      else {
        // Never retry an ambiguous delivery automatically. A provider quota/auth error pauses all notices.
        state=response.status>=500||response.ok?'uncertain':'failed';errorCode=`provider_${response.status}`;stop=true;
      }
    } catch {stop=true;}
    const {error:finishError}=await client.rpc('email_finish',{p_id:item.id,p_state:state,p_provider_id:providerId,p_error:errorCode});
    if(finishError)throw new Error('No se pudo registrar el resultado; no se reintentará automáticamente.');
    if(state==='sent')sent++;else failed++;
    if(stop)break;
    // Stay below Resend's default rate even when multiple events are ready.
    if(index<max-1)await new Promise(resolve=>setTimeout(resolve,600));
  }
  return {sent,failed};
}
