import { useEffect,useRef,useState } from 'react';
import { ArrowLeft,Eye,Send,X } from 'lucide-react';
import { staffRpc } from './staffClient.js';

export default function StaffMessageComposer({recipients,all=false,initialTitle='',initialBody='',onClose,onSent,onReady}) {
  const dialog=useRef(null),request=useRef(null),inFlight=useRef(false),attempt=useRef(null);
  const [audience,setAudience]=useState(null),[title,setTitle]=useState(initialTitle),[body,setBody]=useState(initialBody);
  const [preview,setPreview]=useState(false),[confirmation,setConfirmation]=useState(''),[busy,setBusy]=useState(true),[error,setError]=useState('');
  useEffect(()=>{
    if(!dialog.current.open)dialog.current.showModal();let active=true;
    if(!request.current)request.current=staffRpc('staff_prepare_message',{p_all:all,p_ids:recipients.map(user=>user.id)});
    request.current.then(data=>{if(active){setAudience(data);setBusy(false);onReady();}}).catch(err=>{if(active){setError(err.message);setBusy(false);}});
    return()=>{active=false;};
  },[all,recipients,onReady]);
  const submit=async event=>{
    event.preventDefault();if(busy||inFlight.current||!audience)return;
    if(!preview){setPreview(true);setError('');return;}
    if(all&&confirmation!=='ENVIAR A TODOS')return;
    inFlight.current=true;setBusy(true);setError('');
    const payload={p_all:all,p_ids:recipients.map(user=>user.id),p_cutoff:audience.cutoff,p_expected:audience.count,p_title:title.trim(),p_body:body.trim()};
    const key=JSON.stringify(payload);
    if(attempt.current?.key!==key)attempt.current={key,id:crypto.randomUUID()};
    try {const result=await staffRpc('staff_send_message',{...payload,p_request:attempt.current.id});onReady();onSent(result);}
    catch(err){setError(err.message);}finally{inFlight.current=false;setBusy(false);}
  };
  return <dialog ref={dialog} className="staff-modal" aria-labelledby="staff-message-title" onCancel={event=>{event.preventDefault();if(!busy)onClose();}}>
    <form onSubmit={submit}><div className="staff-modal-heading"><h2 id="staff-message-title">{all?'Comunicado general':'Mensaje al buzón'}</h2><button type="button" className="site-icon-close inline-flex items-center justify-center staff-icon-button" title="Cerrar mensaje" aria-label="Cerrar mensaje" disabled={busy} onClick={onClose}><X size={17} /></button></div>
      {audience&&<p className="staff-message-audience"><strong>{audience.count} {audience.count===1?'destinatario':'destinatarios'}</strong>{!all&&<span>{recipients.map(user=>user.nombre||'Usuario').join(', ')}</span>}</p>}
      {busy&&!audience&&<p role="status">Consultando destinatarios...</p>}
      {error&&<p role="alert" className="staff-error">{error}</p>}
      {preview?<><div className="staff-message-preview"><h3>{title.trim()}</h3><p>{body.trim()}</p></div>
        {all&&<><label htmlFor="staff-message-confirm">Escribe ENVIAR A TODOS para confirmar</label><input id="staff-message-confirm" value={confirmation} onChange={event=>setConfirmation(event.target.value)} required pattern="ENVIAR A TODOS" disabled={busy} autoComplete="off" /></>}
        <div className="staff-message-buttons"><button type="button" className="staff-button" disabled={busy} onClick={()=>{setPreview(false);setConfirmation('');}}><ArrowLeft size={16} />Volver</button><button type="submit" className="staff-button staff-button-primary" disabled={busy||(all&&confirmation!=='ENVIAR A TODOS')}><Send size={16} />{busy?'Enviando...':'Confirmar envío'}</button></div>
      </>:<><label htmlFor="staff-message-subject">Asunto</label><input id="staff-message-subject" value={title} onChange={event=>setTitle(event.target.value)} minLength={3} maxLength={120} required disabled={busy} />
        <label htmlFor="staff-message-body">Mensaje</label><textarea id="staff-message-body" rows={7} value={body} onChange={event=>setBody(event.target.value)} minLength={5} maxLength={4000} required disabled={busy} />
        <button type="submit" className="staff-button staff-button-primary" disabled={busy||!audience||title.trim().length<3||body.trim().length<5}><Eye size={16} />Revisar mensaje</button></>}
    </form>
  </dialog>;
}
