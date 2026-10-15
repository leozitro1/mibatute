import { useEffect,useRef,useState } from 'react';
import { ArrowLeft,ArrowRight,MessageSquare,X,Loader2 } from 'lucide-react';
import { staffRpc } from './staffClient.js';

const statuses={open:'Abierto',pending:'Pendiente',closed:'Cerrado'};
const date=value=>new Date(value).toLocaleString('es-CO',{timeZone:'America/Bogota'});

export default function StaffChatAudit({article,onClose,onAccessExpired}) {
  const dialog=useRef(null);
  const [reason,setReason]=useState('');
  const [data,setData]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const inFlight=useRef(false);
  useEffect(()=>{if(!dialog.current.open)dialog.current.showModal();},[]);

  const read=async(chat=null,page=1,snapshot=data?.snapshot)=>{
    if(inFlight.current)return;
    inFlight.current=true;setBusy(true);setError('');
    try {
      const result=await staffRpc('staff_article_chat_audit',{
        p_article:article.id,p_reason:reason.trim(),p_chat:chat,p_page:page,p_snapshot:snapshot||null,
      });
      setData(result);
    } catch(err) {if(err.code==='42501')onAccessExpired();else setError(err.message);}
    finally {inFlight.current=false;setBusy(false);}
  };

  return <dialog ref={dialog} className="staff-modal staff-chat-audit" aria-labelledby="staff-chat-audit-title" onCancel={onClose}>
    <div className="staff-modal-heading"><h2 id="staff-chat-audit-title">Auditoría de chats</h2><button type="button" className="staff-icon-button" title="Cerrar auditoría" aria-label="Cerrar auditoría" onClick={onClose}><X size={17} /></button></div>
    <p className="staff-item-title">{article.title}</p>
    {!data?<form onSubmit={event=>{event.preventDefault();read();}}>
      <label htmlFor="staff-chat-audit-reason">Motivo de acceso</label><textarea id="staff-chat-audit-reason" value={reason} onChange={event=>setReason(event.target.value)} minLength={8} maxLength={500} required disabled={busy} />
      <button type="submit" className="staff-button staff-button-primary" disabled={busy||reason.trim().length<8}>{busy?<Loader2 size={17} className="animate-spin" />:<MessageSquare size={17} />}Consultar chats</button>
    </form>:<>
      <div className="staff-chat-summary"><span>{data.chat_id?`${data.total} mensajes · ${statuses[data.status]||data.status}`:`${data.total} conversaciones`}</span>
        {data.chat_id&&<button type="button" className="staff-button" disabled={busy} onClick={()=>read()}><ArrowLeft size={16} />Conversaciones</button>}
      </div>
      {data.chat_id?<ol className="staff-chat-messages">{[...data.rows].reverse().map(message=><li key={message.id}>
        <div><strong>{message.sender_name||'Usuario'}</strong><span>{message.sender_role}</span></div><p>{message.body}</p><time dateTime={message.created_at}>{date(message.created_at)}</time>
      </li>)}</ol>:<ul className="staff-chat-list">{data.rows.map(chat=><li key={chat.id}><button type="button" disabled={busy} onClick={()=>read(chat.id)} aria-label={`Abrir conversación ${chat.id}`}>
        <MessageSquare size={18} /><span><strong>{chat.buyer_name||'Interesado'} / {chat.seller_name||'Vendedor'}</strong><small>{date(chat.created_at)} · {statuses[chat.status]||chat.status}</small></span><ArrowRight size={16} />
      </button></li>)}</ul>}
      {!data.rows.length&&<p className="staff-empty">{data.chat_id?'Esta conversación no tiene mensajes.':'Esta publicación no tiene conversaciones.'}</p>}
      {data.pageCount>1&&<nav className="staff-pagination" aria-label="Paginación de auditoría">
        <button type="button" className="staff-icon-button" aria-label={data.chat_id?'Mensajes más recientes':'Conversaciones anteriores'} title={data.chat_id?'Mensajes más recientes':'Conversaciones anteriores'} disabled={busy||data.page<=1} onClick={()=>read(data.chat_id||null,data.page-1)}><ArrowLeft size={17} /></button>
        <span>{data.page} de {data.pageCount}</span>
        <button type="button" className="staff-icon-button" aria-label={data.chat_id?'Mensajes más antiguos':'Más conversaciones'} title={data.chat_id?'Mensajes más antiguos':'Más conversaciones'} disabled={busy||data.page>=data.pageCount} onClick={()=>read(data.chat_id||null,data.page+1)}><ArrowRight size={17} /></button>
      </nav>}
    </>}
    {error&&<p role="alert" className="staff-error">{error}</p>}
    {busy&&data&&<p role="status" className="mt-4 text-sm">Cargando...</p>}
  </dialog>;
}
