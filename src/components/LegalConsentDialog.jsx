import {useEffect,useRef,useState} from 'react';
import {supabase} from '../supabase/supabaseClient';
import './SupportInbox.css';
import './LegalConsentDialog.css';
import {LEGAL_READY,LEGAL_VERSION,LEGAL_OPERATOR} from '../legal/config.js';

export default function LegalConsentDialog({userId,onLogout}){
 const [status,setStatus]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [terms,setTerms]=useState(false),[privacy,setPrivacy]=useState(false),[adult,setAdult]=useState(false);const dialog=useRef(null),flight=useRef(false);
 useEffect(()=>{
  if(!LEGAL_READY||!userId)return;let active=true;
  supabase.rpc('legal_consent_status').then(({data,error})=>{if(active){if(error){setError('No se pudo verificar la versión de las políticas. Intenta de nuevo antes de continuar.');setStatus({required:true});}else setStatus(data);}});
  return()=>{active=false;};
 },[userId]);
 useEffect(()=>{if(status?.required&&dialog.current&&!dialog.current.open)dialog.current.showModal();},[status]);
 if(!LEGAL_READY||!userId||!status?.required)return null;
 const accept=async event=>{
  event.preventDefault();if(flight.current||!terms||!privacy||!adult||status.version!==LEGAL_VERSION)return;
  flight.current=true;setBusy(true);setError('');
  try{const {error}=await supabase.rpc('accept_legal_release',{p_version:LEGAL_VERSION,p_terms:terms,p_privacy:privacy,p_adult:adult});if(error)throw error;dialog.current?.close();setStatus({required:false});}
  catch(err){setError(err.message||'No se pudo registrar la autorización.');}finally{flight.current=false;setBusy(false);}
 };
 return <dialog ref={dialog} className="legal-consent-dialog" aria-labelledby="legal-renewal-title" onCancel={event=>event.preventDefault()}><form className="support-compose" onSubmit={accept}>
  <h2 id="legal-renewal-title">Revisa las políticas de MiBatute</h2><p>Solicitamos tu elección expresa. El uso anterior de la cuenta no se registra como una aceptación de esta versión.</p>
  {status.version&&status.version!==LEGAL_VERSION&&<p role="alert">Hay una versión más reciente. Actualiza la página para revisarla.</p>}
  <label><input type="checkbox" checked={terms} onChange={event=>setTerms(event.target.checked)} disabled={busy}/> Acepto los <a href="/terminos" target="_blank" rel="noopener noreferrer">términos y condiciones</a>.</label>
  <label><input type="checkbox" checked={privacy} onChange={event=>setPrivacy(event.target.checked)} disabled={busy}/> Autorizo los tratamientos necesarios explicados en <a href="/privacidad" target="_blank" rel="noopener noreferrer">Privacidad</a>. No incluye publicidad comercial.</label>
  <label><input type="checkbox" checked={adult} onChange={event=>setAdult(event.target.checked)} disabled={busy}/> Confirmo que tengo 18 años o más.</label>
  <p>Si no deseas autorizar, puedes <a href="/datos-personales">solicitar revisión o cierre y supresión</a>, o escribir a <a href={`mailto:${LEGAL_OPERATOR.email}`}>{LEGAL_OPERATOR.email}</a>.</p>
  {error&&<p role="alert">{error}</p>}
  <div className="support-actions"><button type="button" className="support-button" disabled={busy} onClick={onLogout}>Salir</button><button className="support-button support-button--primary" disabled={busy||!terms||!privacy||!adult||status.version!==LEGAL_VERSION}>Guardar mi elección</button></div>
 </form></dialog>;
}
