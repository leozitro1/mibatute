import {useCallback,useEffect,useRef,useState} from 'react';
import {CreditCard,X,RefreshCw,ExternalLink} from 'lucide-react';
import {loadWompiWidget,sandboxWidgetOptions} from './wompiWidget.js';
import WompiTopupHistory from './WompiTopupHistory.jsx';
import ContactButton from './ContactButton.jsx';
import {supabase} from '../supabase/supabaseClient';
import {PAID_TOPUPS_ENABLED,LOCAL_WOMPI_SANDBOX} from '../config/availability.js';
import {WOMPI_MERCHANT_NOTICE} from '../config/paymentMerchant.js';
import {CREDIT_PACKS,formatCOP} from '../config/creditPricing.js';

export default function WompiTopupDialog({onClose,onConfirmed,reference=null,transactionId=null}) {
 const enabled=PAID_TOPUPS_ENABLED||LOCAL_WOMPI_SANDBOX;
 const [credits,setCredits]=useState(1),[data,setData]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const confirmed=useRef(onConfirmed),mounted=useRef(false),confirmation=useRef(null);
 const verification=useRef({reference,transactionId});
 confirmed.current=onConfirmed;
 const request=useCallback(async(method='GET',body)=>{
  const {data:session}=await supabase.auth.getSession();
  if(!session?.session?.access_token)throw new Error('Inicia sesión para consultar o recargar créditos.');
  const target=verification.current;
  const query=new URLSearchParams();if(target.reference)query.set('reference',target.reference);if(target.transactionId)query.set('transaction_id',target.transactionId);
  const response=await fetch(`/api/wompi-checkout${method==='GET'&&query.size?'?'+query:''}`,{method,headers:{Authorization:`Bearer ${session.session.access_token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const result=await response.json();if(!response.ok||!result.configured&&method==='GET')throw new Error(result.error||'No se pudo consultar la recarga.');
  return result;
 },[]);
 const refresh=useCallback(async()=>{
  setBusy(true);setError('');
  try{const result=await request();if(!mounted.current)return;setData(result);
   if(result.order?.state==='approved'&&confirmation.current!==result.order.reference){confirmation.current=result.order.reference;confirmed.current?.(result.balance);}
  }catch(err){if(mounted.current)setError(err.message);}finally{if(mounted.current)setBusy(false);}
 },[request]);
 useEffect(()=>{mounted.current=true;if(enabled)refresh();return()=>{mounted.current=false;};},[enabled,refresh]);
 useEffect(()=>{const close=event=>{if(event.key==='Escape')onClose();};document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close);},[onClose]);
 const prepare=async()=>{
  setBusy(true);setError('');
  try{const result=await request('POST',{credits});if(mounted.current){verification.current={reference:result.order.reference,transactionId:null};setData(result);}}
  catch(err){if(mounted.current)setError(err.message);}finally{if(mounted.current)setBusy(false);}
 };
 const openSandbox=async()=>{
  setBusy(true);setError('');
  try{
   const options=sandboxWidgetOptions(data.checkoutUrl);
   const Widget=await loadWompiWidget();
   if(!mounted.current)return;
   new Widget(options).open(result=>{
    if(!mounted.current)return;
    const id=result?.transaction?.id;
    if(id){verification.current={reference:options.reference,transactionId:id};void refresh();}
    else setBusy(false);
   });
  }catch(err){if(mounted.current){setError(err.message);setBusy(false);}}
 };
 const approved=data?.order?.state==='approved';
 const status={APPROVED:'Pago aprobado',PENDING:'Pago pendiente',DECLINED:'Pago rechazado',VOIDED:'Pago anulado',ERROR:'El pago no pudo completarse'}[data?.paymentStatus];
 const selected=CREDIT_PACKS.find(pack=>pack.credits===credits);
 const pending=data?.order?.state==='pending'&&data.checkoutUrl&&Date.parse(data.order.expires_at)>Date.now();
 return <div className="marketplace-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
  <section role="dialog" aria-modal="true" aria-labelledby="wompi-topup-title" className="marketplace-surface marketplace-modal relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-lg bg-white p-5 shadow-xl" onClick={event=>event.stopPropagation()}>
   <button type="button" aria-label="Cerrar recarga" onClick={onClose} className="site-icon-close inline-flex items-center justify-center absolute right-2 top-2 h-11 w-11 text-gray-500"><X size={20}/></button>
   <CreditCard size={24} className="mb-3 text-forest-green" aria-hidden="true"/>
   <h2 id="wompi-topup-title" className="pr-9 text-lg font-black text-gray-800">Recargar créditos</h2>
   <p className="mt-3 rounded-xl border border-[#e1e7dc] bg-[#f8faf5] p-3 text-xs leading-relaxed text-[#596b51]"><strong className="font-semibold">Identificación del pago.</strong> {WOMPI_MERCHANT_NOTICE}</p>
   {!enabled?<p className="my-4 text-sm text-gray-600">Puedes consultar tu saldo en el perfil. Para recibir ayuda con una recarga, contacta a MiBatute.</p>:<>
    {LOCAL_WOMPI_SANDBOX&&<p className="my-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><strong>Sandbox: prueba sin dinero real.</strong> Usa únicamente los datos de prueba de Wompi. Los créditos de esta prueba solo afectan la base local.</p>}
    {error&&<p role="alert" className="my-3 text-sm text-red-700">{error}</p>}
    {approved?<div role="status" className="my-4 rounded-xl bg-green-50 p-4 text-green-900"><strong>Recarga confirmada</strong><p className="mt-2 text-sm">{data.order.credits} créditos abonados. Saldo actual: {data.balance}.</p><button type="button" onClick={()=>{verification.current={reference:null,transactionId:null};setData(null);setError('');}} className="mt-4 min-h-11 w-full rounded-xl bg-forest-green px-4 py-3 text-sm font-semibold text-white">Hacer otra recarga</button></div>:<>
     <fieldset disabled={busy} className="my-4 grid grid-cols-3 gap-2"><legend className="mb-3 text-sm font-semibold">Elige un paquete</legend>{CREDIT_PACKS.map(pack=><label key={pack.credits} className={`cursor-pointer rounded-xl border p-3 text-center text-sm ${credits===pack.credits?'border-green-700 bg-green-50':'border-gray-200'}`}><input type="radio" name="wompi-pack" value={pack.credits} checked={credits===pack.credits} onChange={()=>{setCredits(pack.credits);setData(null);setError('');}}/><strong className="mt-2 block">{pack.credits} {pack.credits===1?'crédito':'créditos'}</strong><span className="mt-1 block">{formatCOP(pack.amountCOP)}</span></label>)}</fieldset>
     <p className="mb-4 text-sm text-gray-600">Total del paquete seleccionado: <strong>{formatCOP(selected.amountCOP)} COP</strong>. Sin suscripciones. MiBatute solo confirma el abono tras verificar el pago con Wompi.</p>
     {status&&<p role="status" className="my-3 text-sm font-semibold">{status}{data.paymentStatus==='PENDING'?'. Aún no se han abonado créditos; no vuelvas a pagar.':''}</p>}
     {pending?LOCAL_WOMPI_SANDBOX?<button type="button" disabled={busy} onClick={openSandbox} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-forest-green p-3 text-sm font-semibold text-white disabled:opacity-50"><ExternalLink size={16}/>{busy?'Procesando…':'Continuar en Wompi'}</button>:<a href={data.checkoutUrl} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-forest-green p-3 text-sm font-semibold text-white"><ExternalLink size={16}/>Continuar en Wompi</a>:<button type="button" onClick={prepare} disabled={busy} className="min-h-11 w-full rounded-xl bg-forest-green p-3 text-sm font-semibold text-white disabled:opacity-50">{busy?'Consultando…':LOCAL_WOMPI_SANDBOX?'Preparar pago de prueba':'Preparar pago'}</button>}
    </>}
    {data?.order&&<p className="my-3 break-all text-xs text-gray-500">Referencia: {data.order.reference}</p>}
    <button type="button" onClick={refresh} disabled={busy} className="my-3 flex min-h-11 items-center gap-2 text-sm font-semibold text-forest-green disabled:opacity-50"><RefreshCw size={16}/>Verificar pago y saldo</button>
    <p className="mb-4 text-xs leading-relaxed text-gray-500">El estado mostrado por el navegador no acredita el pago. Si hay una diferencia, conserva la referencia y solicita revisión; no repitas el pago para corregir un saldo.</p>
   </>}
   <WompiTopupHistory environment={LOCAL_WOMPI_SANDBOX?'test':'prod'} updatedAt={data?.order?.credited_at}/>
   <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
    <ContactButton className="text-sm font-semibold text-forest-green underline" subject="Consulta sobre recargas">Contactar a MiBatute</ContactButton>
    <button type="button" onClick={onClose} className="min-h-11 rounded-xl bg-forest-green px-6 py-3 text-sm font-semibold text-white">Cerrar</button>
   </div>
  </section>
 </div>;
}
