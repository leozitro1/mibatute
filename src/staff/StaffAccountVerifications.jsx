import { useCallback, useEffect, useState } from 'react';
import { staffRpc } from './staffClient.js';
import '../components/AccountVerification.css';

const labels={pending:'Pendientes',approved:'Aprobadas',rejected:'Rechazadas',history:'Historial de decisiones'};
const date=value=>new Date(value).toLocaleString('es-CO',{timeZone:'America/Bogota'});
const historyDecision=row=>row.decision==='approved'?'Verificación aprobada':row.previous_status==='approved'?'Verificación retirada':'Solicitud rechazada';
const requestList=(filter,page,userId)=>filter==='history'
 ?staffRpc('staff_account_verification_history',{p_user_id:userId,p_page:page})
 :staffRpc('staff_account_verifications',{p_status:filter,p_page:page});
export default function StaffAccountVerifications({userId,onAccessExpired,onReady}) {
 const [filter,setFilter]=useState('pending'),[page,setPage]=useState(1),[data,setData]=useState(null),[busy,setBusy]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [historyUser,setHistoryUser]=useState(null);
 const load=useCallback(async()=>{
  setBusy(true);setError('');
  try {setData(await requestList(filter,page,historyUser?.id||null));onReady();}
  catch(error){setError(error.message);if(error.code==='42501')onAccessExpired('Verifica nuevamente tu acceso al panel.');}
  finally{setBusy(false);}
 },[filter,page,historyUser,onAccessExpired,onReady]);
 useEffect(()=>{let active=true;setBusy(true);setData(null);setError('');
  requestList(filter,page,historyUser?.id||null).then(result=>{if(active){setData(result);setBusy(false);onReady();}}).catch(error=>{if(active){setError(error.message);setBusy(false);if(error.code==='42501')onAccessExpired('Verifica nuevamente tu acceso al panel.');}});
  return()=>{active=false;};
 },[filter,page,historyUser,onAccessExpired,onReady]);
 const review=async(event,row)=>{
  event.preventDefault();if(busy)return;
  const form=new FormData(event.currentTarget),decision=event.nativeEvent.submitter?.value;
  if(!decision)return;setBusy(true);setError('');setNotice('');
  try {
   await staffRpc('staff_review_account_verification',{p_user_id:row.user_id,p_revision:row.revision,p_decision:decision,p_note:String(form.get('note')).trim()});
   setNotice('Decisión guardada.');onReady();await load();
  }catch(error){setError(error.message);if(error.code==='42501')onAccessExpired('Verifica nuevamente tu acceso al panel.');}finally{setBusy(false);}
 };
 return <section aria-label="Revisión manual de cuentas">
  <p>Compara el nombre del perfil con el nombre legal y comprueba los datos mediante el procedimiento de revisión del equipo. Este panel no consulta la Registraduría. Recibir estos datos no acredita por sí solo la identidad del solicitante.</p>
  <div className="staff-tools mt-4"><label htmlFor="verification-filter">Solicitudes e historial</label><select id="verification-filter" disabled={busy} value={filter} onChange={event=>{setFilter(event.target.value);setPage(1);setHistoryUser(null);setNotice('');}}>{Object.entries(labels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><button type="button" className="staff-button" disabled={busy} onClick={load}>Actualizar</button></div>
  {filter==='history'&&<div className="mt-4"><p>Registro de aprobaciones, rechazos y retiros de verificación. Cada decisión anterior se conserva aunque la cuenta cambie de estado.</p>{historyUser&&<p>Historial de {historyUser.name||'esta cuenta'} <button type="button" className="staff-button" disabled={busy} onClick={()=>{setHistoryUser(null);setPage(1);}}>Ver todas las cuentas</button></p>}</div>}
  {busy&&<p role="status">Cargando…</p>}{error&&<p role="alert" className="staff-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
  <div className="verification-review-list">{filter==='history'?data?.rows.map(row=><article key={row.id}>
   <h2 className="font-bold">{row.profile_name||'Cuenta sin nombre'}</h2>
   <p className="font-semibold">{historyDecision(row)}</p>
   <dl className="staff-preview-facts"><dt>Fecha de la decisión</dt><dd>{date(row.created_at)}</dd><dt>Revisada por</dt><dd>{row.reviewer_name||'Miembro del equipo'}<span className="staff-item-detail">{row.actor_id}</span></dd><dt>Cuenta</dt><dd>{row.user_id}</dd><dt>Estado actual de la solicitud</dt><dd>{{pending:'En revisión',approved:'Verificada',rejected:'Rechazada'}[row.current_status]||'Sin solicitud actual'}</dd></dl>
   {!historyUser&&<button type="button" className="staff-button" disabled={busy} onClick={()=>{setHistoryUser({id:row.user_id,name:row.profile_name});setPage(1);}}>Ver historial de esta cuenta</button>}
  </article>):data?.rows.map(row=><article key={`${row.user_id}-${row.revision}`}>
   <h2 className="font-bold">{row.full_name}</h2>
   <dl className="staff-preview-facts"><dt>Nombre del perfil</dt><dd>{row.profile_name||'Sin nombre'}</dd><dt>Cédula</dt><dd>{row.document_number}</dd><dt>Fecha de expedición</dt><dd>{row.issue_date}</dd><dt>Solicitud</dt><dd>{new Date(row.submitted_at).toLocaleString('es-CO',{timeZone:'America/Bogota'})}</dd></dl>
   {row.review_note&&<p>Resultado anterior: {row.review_note}</p>}
   {row.reviewed_at&&<p>Última decisión: {date(row.reviewed_at)}</p>}
   <button type="button" className="staff-button my-3" disabled={busy} onClick={()=>{setHistoryUser({id:row.user_id,name:row.profile_name});setFilter('history');setPage(1);setNotice('');}}>Ver historial de esta cuenta</button>
   {row.user_id===userId?<p>No puedes revisar tu propia cuenta.</p>:['pending','approved'].includes(row.status)&&<form onSubmit={event=>review(event,row)}>
    <label htmlFor={`verification-note-${row.user_id}`}>{row.status==='approved'?'Motivo para retirar la verificación':'Comprobación realizada o motivo del rechazo'} (visible para el usuario)</label>
    <textarea id={`verification-note-${row.user_id}`} name="note" minLength={10} maxLength={500} required disabled={busy} placeholder="Describe la comprobación y el resultado. No copies el número de cédula ni otros datos privados aquí."/>
    <label className="verification-consent"><input type="checkbox" required disabled={busy}/>Confirmo que revisé los datos y que el motivo documenta mi decisión.</label>
    <div className="staff-actions mt-3">{row.status==='pending'&&<button type="submit" name="decision" value="approved" className="staff-button staff-button-primary" disabled={busy}>Aprobar verificación</button>}<button type="submit" name="decision" value="rejected" className="staff-button staff-danger" disabled={busy}>{row.status==='approved'?'Retirar verificación':'Rechazar solicitud'}</button></div>
   </form>}
  </article>)}</div>
  {!busy&&data?.total===0&&<p>{filter==='history'?'No hay decisiones registradas.':`No hay solicitudes ${labels[filter].toLowerCase()}.`}</p>}
  {data&&<nav className="staff-pagination" aria-label="Paginación de verificaciones"><button type="button" className="staff-button" disabled={busy||page===1} onClick={()=>setPage(page-1)}>Anterior</button><span>{page} / {Math.max(1,Math.ceil(data.total/20))}</span><button type="button" className="staff-button" disabled={busy||page*20>=data.total} onClick={()=>setPage(page+1)}>Siguiente</button></nav>}
 </section>;
}
