import {LEGAL_READY} from '../src/legal/config.js';
import { wompiConfig, checkoutUrl, sendJson, authenticatedClient } from '../server/wompi.js';

export default async function handler(req,res) {
  if (!['GET','POST'].includes(req.method)) {
    res.setHeader('Allow','GET, POST');
    return sendJson(res,405,{ error: 'Metodo no permitido.' });
  }
  const config = wompiConfig();
  if (!config.configured) return sendJson(res,req.method==='GET'?200:503,
    { configured: false, environment: config.environment, error: 'Wompi esta pendiente de configuracion.' });
  try {
    const client = await authenticatedClient(req,config);
    if (!client) return sendJson(res,401,{ error: 'Inicia sesion para recargar.' });
    if (req.method==='GET') {
      const reference = new URL(req.url,'http://localhost').searchParams.get('reference');
      const { data,error } = await client.rpc('wompi_topup_status', { p_environment: config.environment, p_reference: reference });
      if (error) return sendJson(res,503,{ error: 'No se pudo consultar la recarga.' });
      return sendJson(res,200,{ ...data, configured: true, environment: config.environment,
        checkoutUrl: data.order?.state==='pending' && Date.parse(data.order.expires_at)>Date.now() ? checkoutUrl(data.order,config) : null });
    }
    if(!LEGAL_READY)return sendJson(res,503,{error:'Las recargas estarán disponibles cuando se publiquen sus condiciones definitivas.'});
    const credits = req.body?.credits;
    if (![2,5,10].includes(credits)) return sendJson(res,400,{ error: 'Paquete invalido.' });
    const { data,error } = await client.rpc('create_wompi_topup',{ p_credits: credits, p_environment: config.environment });
    if (error) return sendJson(res,400,{ error: 'No se pudo preparar la recarga. Verifica tu cuenta.' });
    return sendJson(res,200,{ order: data, environment: config.environment, checkoutUrl: checkoutUrl(data,config) });
  } catch { return sendJson(res,503,{ error: 'No se pudo conectar con el servicio de recargas.' }); }
}
