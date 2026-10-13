import { createClient } from '@supabase/supabase-js';
import { wompiConfig, verifyWompiEvent, sendJson } from '../server/wompi.js';

export default async function handler(req,res) {
  if (req.method!=='POST') {
    res.setHeader('Allow','POST');
    return sendJson(res,405,{ error: 'Metodo no permitido.' });
  }
  const config = wompiConfig();
  if (!config.configured) return sendJson(res,503,{ error: 'Wompi no esta configurado.' });
  const event = req.body;
  if (event?.environment!==config.environment || !verifyWompiEvent(event,config.eventsSecret)) {
    return sendJson(res,401,{ error: 'Evento no autentico.' });
  }
  if (event.event!=='transaction.updated' || event.data?.transaction?.status!=='APPROVED') {
    return sendJson(res,200,{ received: true });
  }
  const transactionId = event.data.transaction.id;
  if (typeof transactionId!=='string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(transactionId)) return sendJson(res,400,{ error: 'Transaccion invalida.' });
  try {
    // Reference and currency may not be covered by the event signature: read the canonical payment server-side.
    const response = await fetch(`${config.apiUrl}/transactions/${encodeURIComponent(transactionId)}`, {
      headers: { Authorization: `Bearer ${config.privateKey}`, Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return sendJson(res,503,{ error: 'No se pudo verificar el pago.' });
    const { data: transaction } = await response.json();
    if (transaction?.id!==transactionId || transaction.status!=='APPROVED'
      || transaction.currency!=='COP' || !Number.isSafeInteger(transaction.amount_in_cents)) {
      return sendJson(res,409,{ error: 'El pago no esta aprobado.' });
    }
    const admin = createClient(config.url,config.serviceKey,{ auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await admin.rpc('credit_wompi_topup',{
      p_reference: transaction.reference, p_transaction_id: transaction.id,
      p_amount: transaction.amount_in_cents, p_currency: transaction.currency, p_environment: config.environment,
    });
    if (error) return sendJson(res,503,{ error: 'No se pudo confirmar la recarga.' });
    return sendJson(res,200,{ received: true });
  } catch { return sendJson(res,503,{ error: 'No se pudo verificar el pago. Se reintentara por evento.' }); }
}
