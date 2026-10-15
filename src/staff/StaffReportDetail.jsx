import { useEffect,useRef,useState } from 'react';
import { Eye,X } from 'lucide-react';
import { staffRpc } from './staffClient.js';

const statuses={open:'Nuevo',reviewing:'En revisión',resolved:'Resuelto',dismissed:'Descartado'};
const date=value=>value?new Date(value).toLocaleString('es-CO',{timeZone:'America/Bogota'}):'';

export default function StaffReportDetail({report,onClose,onOpenArticle}) {
  const dialog=useRef(null);
  const request=useRef(null);
  const [data,setData]=useState(null);
  const [error,setError]=useState('');
  useEffect(()=>{
    let active=true;
    if(!dialog.current.open)dialog.current.showModal();
    if(!request.current)request.current=staffRpc('staff_report_detail',{p_id:report.id,p_kind:report.kind});
    request.current.then(result=>{if(active)setData(result);}).catch(err=>{if(active)setError(err.message);});
    return()=>{active=false;};
  },[report.id,report.kind]);
  return <dialog ref={dialog} className="staff-modal staff-report-detail" aria-labelledby="staff-report-title" onCancel={onClose}>
    <div className="staff-modal-heading"><h2 id="staff-report-title">Detalle del reporte</h2><button type="button" className="staff-icon-button" aria-label="Cerrar reporte" title="Cerrar reporte" onClick={onClose}><X size={17} /></button></div>
    {error?<p role="alert" className="staff-error">{error}</p>:!data?<p role="status">Cargando reporte...</p>:<>
      <p className="staff-item-title">{data.article_title||'Publicación no disponible'}</p>
      <dl className="staff-preview-facts"><dt>Tipo</dt><dd>{data.kind==='chat'?'Denuncia de chat':'Reporte de publicación'}</dd>
        <dt>Estado</dt><dd>{statuses[data.status]||data.status}</dd><dt>Motivo</dt><dd>{data.reason}</dd>
        <dt>Enviado por</dt><dd>{data.reporter_name||'Usuario'}</dd><dt>Usuario reportado</dt><dd>{data.reported_name||'Usuario'}</dd>
        <dt>Fecha</dt><dd>{date(data.created_at)}</dd>
      </dl>
      <p className="staff-preview-description mt-4">{data.details||'Sin detalles adicionales'}</p>
      {onOpenArticle&&data.articulo_id&&data.article_title&&<button type="button" className="staff-button" onClick={()=>onOpenArticle({id:data.articulo_id,title:data.article_title})}><Eye size={17} />Ver publicación</button>}
      {data.resolution&&<p className="staff-status-band">Respuesta de administración: {data.resolution}</p>}
      {data.kind==='chat'&&<section className="mt-6"><h3 className="font-bold text-sm">Contexto del chat al reportar</h3>
        <ol className="staff-chat-messages">{(data.messages_snapshot||[]).map(message=><li key={message.id}>
          <strong className="text-sm">{message.sender_name||'Usuario'}</strong><p>{message.body}</p><time dateTime={message.created_at}>{date(message.created_at)}</time>
        </li>)}</ol>{!data.messages_snapshot?.length&&<p className="staff-empty">No había mensajes al enviar esta denuncia.</p>}
      </section>}
    </>}
  </dialog>;
}
