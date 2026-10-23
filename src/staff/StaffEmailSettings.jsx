import {useCallback,useEffect,useState} from 'react';
import {Mail,RefreshCw,Save,Send} from 'lucide-react';
import {staffClient,staffRpc} from './staffClient.js';
import StaffEmailPreview from './StaffEmailPreview.jsx';
import {EMAIL_EVENTS} from '../config/emailNotifications.js';

export default function StaffEmailSettings({onReady,onAccessExpired}){
 const [data,setData]=useState(null),[form,setForm]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=useCallback(async()=>{
  setBusy(true);setError('');
  try{const value=await staffRpc('staff_email_settings');setData(value);setForm(value.settings);onReady?.();}
  catch(err){if(err.code==='42501')onAccessExpired?.('Verifica nuevamente tu acceso.');else setError('No se pudo cargar la configuración. Comprueba que la migración de correos esté instalada.');}
  finally{setBusy(false);}
 },[onReady,onAccessExpired]);
 useEffect(()=>{load();},[load]);
 const change=patch=>{setForm(previous=>({...previous,...patch}));setNotice('');};
 const dirty=form&&data&&JSON.stringify(form)!==JSON.stringify(data.settings);
 const save=async event=>{
  event.preventDefault();setBusy(true);setError('');setNotice('');
  try{const value=await staffRpc('staff_email_save',{p_enabled:form.enabled,p_limit:Number(form.daily_limit),p_events:form.events,p_version:data.settings.updated_at});setData(value);setForm(value.settings);onReady?.();setNotice('Configuración guardada.');}
  catch(err){setError(err.message||'No se pudo guardar.');}finally{setBusy(false);}
 };
 const dispatch=async()=>{
  setBusy(true);setError('');setNotice('');
  try{
   const {data:session}=await staffClient.auth.getSession();
   const response=await fetch('/api/email-dispatch',{method:'POST',headers:{Authorization:`Bearer ${session?.session?.access_token||''}`}});
   const result=await response.json();if(!response.ok)throw new Error(result.error||'No se pudo procesar la cola.');
   await load();onReady?.();setNotice(result.configured?`Aceptados por Resend: ${result.sent}. Fallidos o por comprobar: ${result.failed}.`:result.error);
  }catch(err){setError(err.message);}finally{setBusy(false);}
 };
 return <section aria-labelledby="staff-email-title">
  <div className="staff-location-list-heading"><h2 id="staff-email-title"><Mail size={19} aria-hidden="true"/> Correos de actividad</h2><button type="button" className="staff-button" disabled={busy} onClick={load}><RefreshCw size={15}/>Actualizar</button></div>
  <p>Controla los avisos de la página. Registro, activación y recuperación de contraseña se gestionan aparte en Supabase y comparten la cuota de Resend.</p>
  <StaffEmailPreview/>
  {error&&<p className="staff-error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {form&&<form onSubmit={save}>
   <fieldset disabled={busy} className="staff-email-controls">
    <label><input type="checkbox" checked={form.enabled} onChange={event=>change({enabled:event.target.checked})}/> Activar correos de actividad</label>
    <label htmlFor="email-daily-limit">Tope de avisos en cualquier período de 24 horas (1–80)</label>
    <input id="email-daily-limit" type="number" min="1" max="80" step="1" required value={form.daily_limit} onChange={event=>change({daily_limit:event.target.value})}/>
    <p>Recomendado para pruebas: 50. Este contador no incluye los correos de autenticación. Dejar margen no garantiza que la cuenta nunca alcance el límite global del proveedor.</p>
    {EMAIL_EVENTS.map(([key,title,description])=><label className="staff-email-option" key={key}><input type="checkbox" checked={form.events[key]} onChange={event=>change({events:{...form.events,[key]:event.target.checked}})}/><span><strong>{title}</strong><small>{description}</small></span></label>)}
    <p>Desactivar una opción descarta sus avisos pendientes. Al reactivarla solo se consideran eventos nuevos. Los pendientes vencen a las 24 horas. Un envío que ya comenzó puede completarse.</p>
    <button className="staff-button staff-button-primary" disabled={!dirty}><Save size={16}/>Guardar configuración</button>
   </fieldset>
  </form>}
  {data&&<><div className="staff-summary"><div><span>Intentos en 24 h</span><strong>{data.attempts24h} / {data.settings.daily_limit}</strong></div><div><span>Aceptados por Resend en 24 h</span><strong>{data.sent24h}</strong></div><div><span>Pendientes</span><strong>{data.pending}</strong></div><div><span>Fallidos o por comprobar en 24 h</span><strong>{data.failed24h}</strong></div></div>
  <p>El procesamiento automático propuesto es cada 15 minutos, en lotes de hasta 3. Requiere configurar y habilitar el servidor al publicar. Sin consultas periódicas desde tu navegador. Los errores de cuota o credenciales pausan los avisos; una entrega incierta no se reenvía automáticamente.</p>
  <button type="button" className="staff-button" onClick={dispatch} disabled={busy||dirty||!data.settings.enabled||!data.pending}><Send size={16}/>Procesar hasta 3 pendientes</button></>}
 </section>;
}
