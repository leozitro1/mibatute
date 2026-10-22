import {useCallback,useEffect,useId,useRef,useState} from 'react';
import {RefreshCw,Send} from 'lucide-react';
import {supabase} from '../supabase/supabaseClient';
import {LEGAL_OPERATOR,LEGAL_ATTENTION} from '../legal/config.js';
import RetentionPreview from './RetentionPreview.jsx';
import {finalResponseBlockers} from './dataRightsActions.js';
import './SupportInbox.css';
import './DataRightsInbox.css';
import { AttentionDot } from '../staff/StaffAttention.jsx';

const kinds={consultation:'Consultar mis datos o mi autorización',correction:'Corregir o actualizar datos',deletion:'Cerrar mi cuenta y solicitar supresión',revocation:'Revocar una autorización',complaint:'Reclamo sobre mis datos'};
const statuses={open:'Recibida',reviewing:'En revisión',answered:'Respondida'};
const stamp=value=>new Date(value).toLocaleString('es-CO',{dateStyle:'short',timeStyle:'short',timeZone:'America/Bogota'});
export default function DataRightsInbox({client=supabase,isStaff=false,userId:staffUserId,revision:externalRevision=0,onActivity,onAccessExpired}){
 const [uid,setUid]=useState(isStaff?staffUserId:null),[authReady,setAuthReady]=useState(isStaff);
 const [kind,setKind]=useState('consultation'),[body,setBody]=useState(''),[page,setPage]=useState(1),[filter,setFilter]=useState(isStaff?'pending':'');
 const [data,setData]=useState({rows:[],pages:1,page:1}),[loading,setLoading]=useState(false),[sending,setSending]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[revision,setRevision]=useState(0);
 const [drafts,setDrafts]=useState({}),[workDrafts,setWorkDrafts]=useState({}),[caseFeedback,setCaseFeedback]=useState(null);
 const [external,setExternal]=useState({kind:'consultation',contact:'',received:'',body:''});const externalRequest=useRef(null);const controlId=useId(),request=useRef(null),flight=useRef(false),alive=useRef(false),sequence=useRef(0);
 const callbacks=useRef({onActivity,onAccessExpired});callbacks.current={onActivity,onAccessExpired};
 useEffect(()=>{const counter=sequence;alive.current=true;return()=>{alive.current=false;counter.current++;};},[]);
 useEffect(()=>{
  if(isStaff)return;
  let active=true;
  const change=session=>{if(active){sequence.current++;setUid(session?.user?.id||null);setAuthReady(true);setData({rows:[],pages:1,page:1});setDrafts({});setBody('');setNotice('');request.current=null;}};
  client.auth.getSession().then(({data})=>change(data?.session)).catch(()=>{if(active)setAuthReady(true);});
  const {data}=client.auth.onAuthStateChange((event,session)=>{if(['SIGNED_IN','SIGNED_OUT','USER_DELETED'].includes(event))change(session);});
  return()=>{active=false;data?.subscription?.unsubscribe();};
 },[client,isStaff]);
 const report=useCallback(err=>{if(!alive.current)return;setError(err.message||'No se pudo completar la operación.');if(isStaff&&err.code==='42501')callbacks.current.onAccessExpired?.();},[isStaff]);
 const rpc=useCallback(async(name,args)=>{const result=await client.rpc(name,args);if(result.error)throw result.error;if(alive.current)callbacks.current.onActivity?.();return result.data;},[client]);
 useEffect(()=>{
  if(!uid)return;const current=++sequence.current;setLoading(true);setError('');
  rpc('data_requests_inbox',{p_staff:isStaff,p_page:page,p_status:filter}).then(value=>{if(alive.current&&current===sequence.current)setData(value);}).catch(err=>{if(current===sequence.current)report(err);}).finally(()=>{if(alive.current&&current===sequence.current)setLoading(false);});
 },[uid,rpc,isStaff,page,filter,revision,externalRevision,report]);
 const submit=async event=>{
  event.preventDefault();if(flight.current)return;const text=body.trim();if(text.length<10||text.length>500)return;
  const signature=JSON.stringify([uid,kind,text]);if(request.current?.signature!==signature)request.current={signature,id:crypto.randomUUID()};
  flight.current=true;setSending(true);setError('');
  try{const id=await rpc('submit_data_request',{p_request:request.current.id,p_kind:kind,p_body:text});if(alive.current){setBody('');request.current=null;setNotice(`Solicitud registrada. Radicado: ${id}. Consulta aquí su estado y la respuesta. El registro no ejecuta cambios automáticos sobre tu cuenta o tus datos.`);setRevision(value=>value+1);}}
  catch(err){report(err);}finally{flight.current=false;if(alive.current)setSending(false);}
 };
 const action=async(name,args,success,target=null)=>{
  if(flight.current)return;flight.current=true;setSending(true);setError('');setCaseFeedback(null);
  try{await rpc(name,args);if(alive.current){success?.();if(target)setCaseFeedback({...target,type:'success',message:target.scope==='work'?'Seguimiento interno guardado.':'Caso asignado correctamente.'});setRevision(value=>value+1);}}
  catch(err){report(err);if(alive.current&&target)setCaseFeedback({...target,type:'error',message:err.message||'No se pudo guardar. Tu texto se conserva; revisa e intenta nuevamente.'});}finally{flight.current=false;if(alive.current)setSending(false);}
 };
 const saveWork=(row,event)=>{
  event.preventDefault();const work=workDrafts[row.id]||{};
  action('update_data_request_work',{p_request:row.id,p_revision:row.work_revision,p_verification:work.verification??row.verification,p_notes:work.notes??row.internal_notes,p_delivery:work.delivery??row.delivery_confirmed},()=>setWorkDrafts(old=>{const next={...old};delete next[row.id];return next;}),{id:row.id,scope:'work'});
 };
 const registerEmail=event=>{
  event.preventDefault();const received=new Date(external.received);if(!Number.isFinite(received.getTime()))return;
  const payload={p_kind:external.kind,p_contact:external.contact.trim(),p_received:received.toISOString(),p_body:external.body.trim()};
  const signature=JSON.stringify(payload);if(externalRequest.current?.signature!==signature)externalRequest.current={signature,id:crypto.randomUUID()};
  action('register_external_data_request',{p_request:externalRequest.current.id,...payload},()=>{setNotice(`Correo radicado: ${externalRequest.current.id}. El panel no envía correos ni respuestas automáticamente.`);externalRequest.current=null;setExternal({kind:'consultation',contact:'',received:'',body:''});});
 };
 const answer=async(row,event)=>{
  event.preventDefault();if(flight.current)return;const draft=drafts[row.id]||{};setCaseFeedback(null);
  if(draft.status==='answered'){const blockers=finalResponseBlockers(row,workDrafts[row.id]);if(blockers.length){setCaseFeedback({id:row.id,scope:'answer',type:'error',message:blockers.join(' ')});return;}}
  flight.current=true;setSending(true);setError('');
  try{await rpc('respond_data_request',{p_request:row.id,p_status:draft.status||'reviewing',p_response:draft.text??row.response??''});if(alive.current){setDrafts(old=>{const next={...old};delete next[row.id];return next;});setCaseFeedback({id:row.id,scope:'answer',type:'success',message:draft.status==='answered'?'Respuesta final guardada. El caso aparecerá en Respondida.':'Respuesta guardada. El caso continúa En revisión; todavía no tiene una respuesta final.'});setRevision(value=>value+1);}}
  catch(err){report(err);if(alive.current)setCaseFeedback({id:row.id,scope:'answer',type:'error',message:err.message||'No se pudo guardar la respuesta. El texto se conserva para reintentar.'});}finally{flight.current=false;if(alive.current)setSending(false);}
 };
 return <section className="support-inbox" aria-label="Solicitudes de datos personales">
  <div className="support-heading"><div><h2>{isStaff?'Solicitudes de datos personales':'Consulta, corrección y supresión de datos'}</h2><p>{isStaff?'Revisar el radicado no ejecuta una eliminación. Documenta las acciones y el fundamento de cualquier conservación.':'Este canal es independiente del soporte común y no tiene el límite de una conversación cada 24 horas.'}</p></div>{uid&&<button className="support-icon-button" type="button" aria-label="Actualizar solicitudes de datos" disabled={loading||sending} onClick={()=>setRevision(value=>value+1)}><RefreshCw size={16}/></button>}</div>
  {isStaff&&<p className="legal-notice">Responsable de atención: {LEGAL_ATTENTION.lead}. Apoyo: {LEGAL_ATTENTION.backup} ({LEGAL_ATTENTION.backupEmail}). Revisión: {LEGAL_ATTENTION.frequency}. El panel avisa de solicitudes pendientes; la revisión del correo es manual y estos avisos no calculan vencimientos legales.</p>}
  <p className="support-hint">Consultas: plazo general de 10 días hábiles. Reclamos: 15 días hábiles, según el trámite legal aplicable. No publiques contraseñas, datos bancarios ni documentos completos.</p>
  {isStaff&&<RetentionPreview client={client} onActivity={onActivity} onAccessExpired={onAccessExpired}/>}
  {!isStaff&&<p className="support-hint">Si no tienes acceso a tu cuenta, escribe a <a href={`mailto:${LEGAL_OPERATOR.email}`}>{LEGAL_OPERATOR.email}</a>. Indica qué solicitas y un medio de respuesta; la identidad se verificará cuando corresponda. No es necesario crear una cuenta para usar ese canal.</p>}
  {!authReady&&<p role="status">Revisando tu sesión…</p>}
  {authReady&&!uid&&<p className="support-hint">Inicia sesión desde la página principal para registrar y consultar solicitudes aquí, o utiliza el correo de atención.</p>}
  {error&&<p role="alert" className="support-error">{error}</p>}{notice&&<p role="status" className="legal-notice">{notice}</p>}
  {caseFeedback?.scope==='answer'&&caseFeedback.type==='success'&&!data.rows.some(row=>row.id===caseFeedback.id)&&<p role="status" className="legal-notice">{caseFeedback.message}</p>}
  {!isStaff&&uid&&<form className="support-compose" onSubmit={submit}>
   <label htmlFor={`${controlId}-kind`}>Tipo de solicitud</label><select id={`${controlId}-kind`} value={kind} onChange={event=>setKind(event.target.value)} disabled={sending}>{Object.entries(kinds).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
   <label htmlFor={`${controlId}-body`}>¿Qué necesitas? (10 a 500 caracteres)</label><textarea id={`${controlId}-body`} required minLength={10} maxLength={500} rows={4} value={body} disabled={sending} onChange={event=>setBody(event.target.value)}/>
   <div className="support-actions"><span className="support-hint">{body.length}/500</span><button className="support-button support-button--primary" disabled={sending||body.trim().length<10||body.length>500}><Send size={16}/>{sending?'Registrando…':'Registrar solicitud'}</button></div>
  </form>}
  {isStaff&&uid&&<details className="legal-external"><summary>Radicar una solicitud recibida por correo</summary><form className="support-compose" onSubmit={registerEmail}>
   <p className="support-hint">Registra el resumen y conserva el correo original en la carpeta de atención. La respuesta al remitente se envía manualmente por correo.</p>
   <label htmlFor={`${controlId}-email`}>Correo del solicitante</label><input id={`${controlId}-email`} type="email" maxLength={254} required disabled={sending} value={external.contact} onChange={event=>setExternal(old=>({...old,contact:event.target.value}))}/>
   <label htmlFor={`${controlId}-received`}>Fecha y hora de recepción (hora local de tu dispositivo)</label><input id={`${controlId}-received`} type="datetime-local" required disabled={sending} value={external.received} onChange={event=>setExternal(old=>({...old,received:event.target.value}))}/>
   <label htmlFor={`${controlId}-email-kind`}>Tipo de solicitud recibida</label><select id={`${controlId}-email-kind`} disabled={sending} value={external.kind} onChange={event=>setExternal(old=>({...old,kind:event.target.value}))}>{Object.entries(kinds).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
   <label htmlFor={`${controlId}-email-body`}>Resumen del correo (10 a 500 caracteres)</label><textarea id={`${controlId}-email-body`} minLength={10} maxLength={500} required disabled={sending} value={external.body} onChange={event=>setExternal(old=>({...old,body:event.target.value}))}/><button className="support-button" disabled={sending||external.body.trim().length<10}>Radicar correo</button>
  </form></details>}
  {uid&&<>
   <label className="legal-filter">Estado <select value={filter} disabled={sending} onChange={event=>{setFilter(event.target.value);setPage(1);}}><option value="">Todos</option>{isStaff&&<option value="pending">Pendientes (recibidas y en revisión)</option>}{Object.entries(statuses).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
   {loading&&<p role="status">Cargando solicitudes…</p>}
   {!loading&&!data.rows.length&&<p className="support-empty">No hay solicitudes con ese filtro.</p>}
   <div className="support-list">{data.rows.map(row=>{const responseText=drafts[row.id]?.text??row.response??'';const finalSelected=drafts[row.id]?.status==='answered';const blockers=finalSelected?finalResponseBlockers(row,workDrafts[row.id]):[];return <article className="support-message" key={row.id}>
    <h3>{isStaff&&['open','reviewing'].includes(row.status)&&<AttentionDot label="Solicitud de datos pendiente" />}{kinds[row.kind]} · {statuses[row.status]}</h3><p className="support-hint">Radicado: {row.id}<br/>Recibida: {stamp(row.received_at||row.created_at)}{isStaff&&<><br/>Usuario: {row.user_id}</>}</p><p>{row.body}</p>
    {row.response&&<><h4>Respuesta {row.responded_at&&`· ${stamp(row.responded_at)}`}</h4><p>{row.response}</p></>}
    {isStaff&&<section className="legal-case-work" aria-label="Seguimiento interno del caso">
     <p className="support-hint">Origen: {row.source==='email'?`Correo · ${row.requester_contact}`:'Formulario web'}<br/>A cargo de: {row.assigned_to===uid?'Tú':row.assignee_name||row.assigned_to||'Sin asignar'}</p>
     {row.status!=='answered'&&row.assigned_to!==uid&&<button className="support-button" type="button" disabled={sending} onClick={()=>action('claim_data_request',{p_request:row.id,p_revision:row.work_revision},()=>{setWorkDrafts(old=>{const next={...old};delete next[row.id];return next;});setDrafts(old=>{const next={...old};delete next[row.id];return next;});},{id:row.id,scope:'claim'})}>{row.assigned_to?'Reasignarme este caso':'Tomar caso'}</button>}
     {caseFeedback?.id===row.id&&caseFeedback.scope==='claim'&&<p role={caseFeedback.type==='error'?'alert':'status'} className={caseFeedback.type==='error'?'support-error':'legal-save-success'}>{caseFeedback.message}</p>}
     {row.assigned_to===uid&&row.status!=='answered'?<form className="support-compose" onSubmit={event=>saveWork(row,event)}>
      <label htmlFor={`${controlId}-${row.id}-verification`}>Verificación de identidad</label><select id={`${controlId}-${row.id}-verification`} disabled={sending} value={workDrafts[row.id]?.verification??row.verification} onChange={event=>setWorkDrafts(old=>({...old,[row.id]:{...old[row.id],verification:event.target.value}}))}><option value="pending">Pendiente</option><option value="verified">Verificada con evidencia proporcional</option><option value="not_required">No requerida para esta respuesta; justificar en notas</option></select>
      <label htmlFor={`${controlId}-${row.id}-notes`}>Notas internas: verificación, acciones y fundamento (máximo 500 caracteres)</label><textarea id={`${controlId}-${row.id}-notes`} maxLength={500} rows={3} disabled={sending} value={workDrafts[row.id]?.notes??row.internal_notes??''} onChange={event=>setWorkDrafts(old=>({...old,[row.id]:{...old[row.id],notes:event.target.value}}))}/>
      {row.source==='email'&&<label className="legal-delivery"><input type="checkbox" disabled={sending} checked={workDrafts[row.id]?.delivery??row.delivery_confirmed??false} onChange={event=>setWorkDrafts(old=>({...old,[row.id]:{...old[row.id],delivery:event.target.checked}}))}/> Confirmo que envié la respuesta por correo y dejé constancia en las notas. Este panel no la envía.</label>}
      <button className="support-button" disabled={sending}>{sending?'Guardando…':'Guardar seguimiento interno'}</button>
      {caseFeedback?.id===row.id&&caseFeedback.scope==='work'&&<p role={caseFeedback.type==='error'?'alert':'status'} className={caseFeedback.type==='error'?'support-error':'legal-save-success'}>{caseFeedback.message}</p>}
     </form>:<><p className="support-hint">Verificación: {row.verification==='verified'?'Verificada':row.verification==='not_required'?'No requerida para esta respuesta':'Pendiente'}</p>{row.internal_notes&&<p>{row.internal_notes}</p>}</>}
    </section>}
    {isStaff&&row.assigned_to===uid&&row.status!=='answered'&&<form className="support-compose" onSubmit={event=>answer(row,event)}>
     <label htmlFor={`${controlId}-${row.id}-status`}>Estado de atención</label><select id={`${controlId}-${row.id}-status`} disabled={sending} value={drafts[row.id]?.status||'reviewing'} onChange={event=>setDrafts(old=>({...old,[row.id]:{...old[row.id],status:event.target.value}}))}><option value="reviewing">En revisión</option><option value="answered">Respuesta final</option></select>
     <label htmlFor={`${controlId}-${row.id}-answer`}>Respuesta al titular (10 a 500 caracteres)</label><textarea id={`${controlId}-${row.id}-answer`} rows={3} minLength={10} maxLength={500} required disabled={sending} value={responseText} onChange={event=>setDrafts(old=>({...old,[row.id]:{...old[row.id],text:event.target.value}}))}/><p className="support-hint">Antes de responder, guarda el seguimiento interno. Una respuesta final exige verificación resuelta y constancia de las acciones; no ejecuta el borrado ni un reembolso. La respuesta final no se puede sobrescribir. Si hay una ampliación de plazo, explica su motivo y la fecha prevista antes del vencimiento.</p>{blockers.length>0&&<div className="legal-save-requirements"><strong>Antes de guardar la respuesta final:</strong><ul>{blockers.map(reason=><li key={reason}>{reason}</li>)}</ul></div>}
     <button className="support-button" disabled={sending||loading||blockers.length>0||responseText.trim().length<10}>{sending?'Guardando…':finalSelected?'Guardar respuesta final':'Guardar respuesta en revisión'}</button>
     {caseFeedback?.id===row.id&&caseFeedback.scope==='answer'&&<p role={caseFeedback.type==='error'?'alert':'status'} className={caseFeedback.type==='error'?'support-error':'legal-save-success'}>{caseFeedback.message}</p>}
    </form>}
   </article>;})}</div>
   {data.pages>1&&<nav className="support-pagination" aria-label="Páginas de solicitudes"><button className="support-button" type="button" disabled={loading||data.page<=1} onClick={()=>setPage(data.page-1)}>Anterior</button><span>{data.page}/{data.pages}</span><button className="support-button" type="button" disabled={loading||data.page>=data.pages} onClick={()=>setPage(data.page+1)}>Siguiente</button></nav>}
  </>}
 </section>;
}
