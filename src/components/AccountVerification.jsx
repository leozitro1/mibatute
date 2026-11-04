import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { supabase } from '../supabase/supabaseClient';
import './AccountVerification.css';
import VerificationMark from './VerificationMark.jsx';

const labels={unverified:'Sin verificar',pending:'En revisión',approved:'Cuenta verificada',rejected:'Requiere corrección'};

export default function AccountVerification({userId,disabled=false,refreshKey}) {
 const [request,setRequest]=useState(null),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  let active=true;
  const refresh=()=>{if(document.visibilityState!=='hidden')supabase.rpc('my_account_verification').then(({data,error})=>{if(active){if(error)setError('No se pudo consultar la verificación. Recarga para intentar nuevamente.');else {setRequest(data);setError('');}}});};
  refresh();document.addEventListener('visibilitychange',refresh);
  return()=>{active=false;document.removeEventListener('visibilitychange',refresh);};
 },[userId,refreshKey]);
 const submit=async event=>{
  event.preventDefault();if(busy)return;
  const form=new FormData(event.currentTarget);setBusy(true);setError('');
  try {
   const {data,error}=await supabase.rpc('submit_account_verification',{p_full_name:String(form.get('name')).trim(),p_document_number:String(form.get('document')).trim(),p_issue_date:form.get('issued'),p_consent:form.get('consent')==='on'});
   if(error)throw error;setRequest(data);setOpen(false);
  } catch(error){setError(error.message||'No se pudo enviar la solicitud.');}finally{setBusy(false);}
 };
 return <section className="account-verification" aria-labelledby="account-verification-title">
  <h3 id="account-verification-title"><ShieldCheck size={18} aria-hidden="true" />Verificación de cuenta</h3>
  <p role="status">{request?labels[request.status]:'Consultando estado…'}</p>
  <p>Es un segundo paso opcional después del registro. El equipo revisará tu solicitud manualmente.</p>
  {error&&<p role="alert" className="verification-error">{error}</p>}
  {request?.status==='pending'&&<p>Recibimos tus datos. La insignia aparecerá cuando el equipo apruebe la solicitud.</p>}
  {request?.status==='approved'&&<p>Tu cuenta tiene una verificación manual aprobada.</p>}
  {request?.status==='rejected'&&<p>Motivo: {request.review_note}</p>}
  {request&&['unverified','rejected'].includes(request.status)&&<>
   <button type="button" className="verification-button" disabled={disabled||busy} aria-expanded={open} onClick={()=>setOpen(!open)}>{open?'Cerrar formulario':request.status==='rejected'?'Corregir solicitud':'Verificar cuenta'}</button>
   {open&&<form onSubmit={submit}>
    <label htmlFor="verification-name">Nombre completo como aparece en la cédula</label>
    <input id="verification-name" name="name" autoComplete="name" minLength={5} maxLength={150} required disabled={busy} defaultValue={request.full_name||''}/>
    <label htmlFor="verification-document">Número de cédula de ciudadanía</label>
    <input id="verification-document" name="document" type="text" inputMode="numeric" autoComplete="off" pattern="[0-9]{5,12}" maxLength={12} required disabled={busy} defaultValue={request.document_number||''} aria-describedby="verification-document-help"/>
    <p id="verification-document-help">Escribe solo números, sin puntos ni espacios.</p>
    <label htmlFor="verification-issued">Fecha de expedición</label>
    <input id="verification-issued" name="issued" type="date" min="1900-01-01" max={new Date().toLocaleDateString('en-CA',{timeZone:'America/Bogota'})} required disabled={busy} defaultValue={request.issue_date||''}/>
    <p>Estos datos serán privados y solo los consultará el equipo autorizado. No envíes fotos de tu documento por el chat. Esta revisión no se conecta con la Registraduría.</p>
    <label className="verification-consent"><input name="consent" type="checkbox" required disabled={busy}/>Autorizo a MiBatute a usar mi nombre completo, cédula y fecha de expedición para revisar manualmente esta solicitud y conservar su resultado. Puedo consultar mis derechos en la <a href="/privacidad" target="_blank" rel="noreferrer">política de privacidad en revisión</a>.</label>
    <button className="verification-button" type="submit" disabled={busy||disabled}>{busy?'Enviando…':'Enviar a revisión'}</button>
   </form>}
  </>}
 </section>;
}

export function AccountVerificationBadge({userId,refreshKey,showStatus=false}) {
 const [verification,setVerification]=useState(null);
 useEffect(()=>{
  let active=true;
  const refresh=()=>{if(userId&&document.visibilityState!=='hidden')supabase.rpc('account_is_verified',{p_user_id:userId}).then(({data,error})=>{if(active)setVerification({userId,verified:error?null:data===true,error:!!error});});};
  refresh();document.addEventListener('visibilitychange',refresh);
  return()=>{active=false;document.removeEventListener('visibilitychange',refresh);};
 },[userId,refreshKey]);
 const current=verification?.userId===userId?verification:null;
 if(showStatus&&current?.verified!==true)return <span className="text-xs font-semibold text-gray-500" role="status">{current?.error?'Verificación no disponible':current?.verified===false?'Cuenta no verificada':'Consultando verificación…'}</span>;
 return <VerificationMark verified={Boolean(userId&&current?.verified===true)}/>;
}
