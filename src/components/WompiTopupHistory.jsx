import {useEffect,useState} from 'react';
import {supabase} from '../supabase/supabaseClient';
import {formatCOP} from '../config/creditPricing.js';

const HISTORY_LIMIT=5;
const dateFormat=new Intl.DateTimeFormat('es-CO',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Bogota'});
function stateLabel(order){
 if(order.state==='pending'&&Date.parse(order.expires_at)<Date.now())return 'Vencida sin confirmar';
 return {approved:'Pagada',pending:'Pendiente',declined:'Rechazada',voided:'Anulada',error:'No completada'}[order.state]||'Sin confirmar';
}

export default function WompiTopupHistory({environment,updatedAt}){
 const [open,setOpen]=useState(false),[result,setResult]=useState({rows:[],loading:false,error:''}),[retry,setRetry]=useState(0);
 useEffect(()=>{
  if(!open)return;
  const controller=new AbortController();
  async function load(){
   setResult({rows:[],loading:true,error:''});
   try{
    const {data:session,error:sessionError}=await supabase.auth.getSession();
    if(sessionError||!session?.session?.user?.id)throw new Error('Inicia sesión para ver tus recargas.');
    const {data,error}=await supabase.from('wompi_topups')
     .select('id,reference,credits,amount_in_cents,currency,state,created_at,credited_at,expires_at')
     .eq('usuario_id',session.session.user.id).eq('environment',environment)
     .order('created_at',{ascending:false}).order('id',{ascending:false})
     .limit(HISTORY_LIMIT).abortSignal(controller.signal);
    if(error)throw new Error('No se pudo cargar el historial de recargas.');
    if(!controller.signal.aborted)setResult({rows:data,loading:false,error:''});
   }catch(error){if(!controller.signal.aborted)setResult({rows:[],loading:false,error:error.message});}
  }
  void load();return()=>controller.abort();
 },[open,environment,updatedAt,retry]);
 return <details className="my-4 border-t border-gray-100 pt-4" onToggle={event=>setOpen(event.currentTarget.open)}>
  <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-forest-green">Últimas 5 recargas</summary>
  {open&&<div className="mt-2 text-sm">
   {environment==='test'&&<p className="mb-3 text-xs text-gray-500">Pruebas Sandbox: estos registros no corresponden a pagos reales.</p>}
   {result.loading?<p role="status" className="py-3 text-gray-500">Cargando historial…</p>:result.error?<div role="alert"><p className="text-red-700">{result.error}</p><button type="button" onClick={()=>setRetry(value=>value+1)} className="min-h-11 font-semibold text-forest-green">Reintentar</button></div>:<>
    {!result.rows.length?<p className="py-3 text-gray-500">Aún no tienes recargas registradas.</p>:<ul className="divide-y divide-gray-100">{result.rows.map(order=><li key={order.id} className="py-3">
     <div className="flex flex-wrap items-center justify-between gap-2"><strong>{formatCOP(order.amount_in_cents/100)} {order.currency}</strong><span className={order.state==='approved'?'font-semibold text-green-800':'text-gray-600'}>{stateLabel(order)}</span></div>
     <p className="mt-1">{order.credits} crédito{order.credits===1?'':'s'}</p>
     <p className="mt-1 text-xs text-gray-500">{order.credited_at?'Pago confirmado: ':'Solicitud: '}<time dateTime={order.credited_at||order.created_at}>{dateFormat.format(new Date(order.credited_at||order.created_at))}</time> · hora de Bogotá</p>
     <p className="mt-1 break-all text-xs text-gray-500">Referencia: {order.reference}</p>
    </li>)}</ul>}
   </>}
  </div>}
 </details>;
}
