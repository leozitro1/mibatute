import {createClient} from '@supabase/supabase-js';
import {CREDIT_PACKS} from '../src/config/creditPricing.js';
import { wompiConfig, checkoutUrl, sendJson, authenticatedClient } from '../server/wompi.js';

export default async function handler(req,res) {
  if (!['GET','POST'].includes(req.method)) {
    res.setHeader('Allow','GET, POST');
    return sendJson(res,405,{ error: 'Metodo no permitido.' });
  }
  const config = wompiConfig();
  if(!config.checkoutEnabled)return sendJson(res,req.method==='GET'?200:503,{configured:false,error:'Las recargas estaran disponibles proximamente.'});
  if (!config.configured) return sendJson(res,req.method==='GET'?200:503,
    { configured: false, environment: config.environment, error: 'Wompi esta pendiente de configuracion.' });
  try {
    const client = await authenticatedClient(req,config);
    if (!client) return sendJson(res,401,{ error: 'Inicia sesion para recargar.' });
    if (req.method==='GET') {
      const params=new URL(req.url,'http://localhost').searchParams;
      const reference=params.get('reference');
      const transactionId=params.get('transaction_id');
      if((reference&&!/^MB-[a-f0-9-]{36}$/i.test(reference))||(transactionId&&!/^[a-zA-Z0-9_-]{1,100}$/.test(transactionId)))return sendJson(res,400,{error:'Referencia o transacción no válida.'});
      const { data,error } = await client.rpc('wompi_topup_status', { p_environment: config.environment, p_reference: reference });
      if (error) return sendJson(res,503,{ error: 'No se pudo consultar la recarga.' });
      let paymentStatus=null;
      if(transactionId&&data.order?.state==='approved'&&data.order.transaction_id===transactionId)paymentStatus='APPROVED';
      else if(transactionId){
        if(!reference||!data.order)return sendJson(res,404,{error:'No se encontró la recarga en tu cuenta.'});
        const response=await fetch(`${config.apiUrl}/transactions/${encodeURIComponent(transactionId)}`,{headers:{Authorization:`Bearer ${config.privateKey}`,Accept:'application/json'},signal:AbortSignal.timeout(10000)});
        if(!response.ok)return sendJson(res,503,{error:'No se pudo verificar el pago con Wompi.'});
        const {data:transaction}=await response.json();
        if(transaction?.id!==transactionId||transaction.reference!==data.order.reference||transaction.currency!==data.order.currency||transaction.amount_in_cents!==data.order.amount_in_cents)return sendJson(res,409,{error:'El pago no corresponde a esta recarga.'});
        paymentStatus=transaction.status;
        if(['APPROVED','DECLINED','VOIDED','ERROR'].includes(paymentStatus)){
          const admin=createClient(config.url,config.serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
          const credited=paymentStatus==='APPROVED'
            ?await admin.rpc('credit_wompi_topup',{p_reference:reference,p_transaction_id:transaction.id,p_amount:transaction.amount_in_cents,p_currency:transaction.currency,p_environment:config.environment})
            :await admin.rpc('wompi_record_failure',{p_reference:reference,p_transaction_id:transaction.id,p_status:paymentStatus,p_environment:config.environment});
          if(credited.error)return sendJson(res,503,{error:'No se pudo confirmar el resultado. Verifica nuevamente; no vuelvas a pagar.'});
          const fresh=await client.rpc('wompi_topup_status',{p_environment:config.environment,p_reference:reference});
          if(fresh.error)return sendJson(res,503,{error:'El pago fue confirmado; actualiza para consultar el saldo.'});
          Object.assign(data,fresh.data);
        }
      }
      return sendJson(res,200,{ ...data,paymentStatus, configured: true, environment: config.environment,
        checkoutUrl: data.order?.state==='pending' && Date.parse(data.order.expires_at)>Date.now() ? checkoutUrl(data.order,config) : null });
    }
    const credits = req.body?.credits;
    if (!CREDIT_PACKS.some(pack=>pack.credits===credits)) return sendJson(res,400,{ error: 'Paquete invalido.' });
    const { data,error } = await client.rpc('create_wompi_topup',{ p_credits: credits, p_environment: config.environment });
    if (error) return sendJson(res,400,{ error: 'No se pudo preparar la recarga. Verifica tu cuenta.' });
    return sendJson(res,200,{ order: data, environment: config.environment, checkoutUrl: checkoutUrl(data,config) });
  } catch { return sendJson(res,503,{ error: 'No se pudo conectar con el servicio de recargas.' }); }
}
