import { useEffect,useRef,useState } from 'react';
import { Eye,X } from 'lucide-react';
import { staffRpc } from './staffClient.js';

const statuses={open:'Nuevo',reviewing:'En revisión',resolved:'Resuelto',dismissed:'Descartado'};
const date=value=>value?new Date(value).toLocaleString('es-CO',{timeZone:'America/Bogota'}):'';

export default function StaffReportDetail({report,onClose,onOpenArticle,onResolved}) {
  const dialog=useRef(null);
  const request=useRef(null);
  const [data,setData]=useState(null);
  const [error,setError]=useState('');
  const [decision,setDecision]=useState('resume');
  const [reason,setReason]=useState('');
  const [busy,setBusy]=useState(false);
  const working=useRef(false);
  const resolveSale=async event=>{
    event.preventDefault();
    if(working.current)return;
    working.current=true;setBusy(true);setError('');
    try{
      const result=await staffRpc('staff_resolve_sale_dispute',{p_case:data.sale_dispute.id,p_action:decision,p_reason:reason});
      setData(await staffRpc('staff_report_detail',{p_id:report.id,p_kind:report.kind}));
      onResolved?.(result);
    }catch(err){setError(err.message);}
    finally{working.current=false;setBusy(false);}
  };
  useEffect(()=>{
    let active=true;
    if(!dialog.current.open)dialog.current.showModal();
    if(!request.current)request.current=staffRpc('staff_report_detail',{p_id:report.id,p_kind:report.kind});
    request.current.then(result=>{if(active)setData(result);}).catch(err=>{if(active)setError(err.message);});
    return()=>{active=false;};
  },[report.id,report.kind]);
  return <dialog ref={dialog} className="staff-modal staff-report-detail" aria-labelledby="staff-report-title" onCancel={onClose}>
    <div className="staff-modal-heading"><h2 id="staff-report-title">Detalle del reporte</h2><button type="button" className="site-icon-close inline-flex items-center justify-center staff-icon-button" aria-label="Cerrar reporte" title="Cerrar reporte" onClick={onClose}><X size={17} /></button></div>
    {error&&<p role="alert" className="staff-error">{error}</p>}{!data?<p role="status">Cargando reporte...</p>:<>
      <p className="staff-item-title">{data.article_title||'Publicación no disponible'}</p>
      <dl className="staff-preview-facts"><dt>Tipo</dt><dd>{data.sale_dispute?'Revisión de venta':data.kind==='chat'?'Denuncia de chat':'Reporte de publicación'}</dd>
        <dt>Estado</dt><dd>{statuses[data.status]||data.status}</dd><dt>Motivo</dt><dd>{data.reason}</dd>
        <dt>Enviado por</dt><dd>{data.reporter_name||'Usuario'}</dd><dt>{data.sale_dispute?'Otra parte':'Usuario reportado'}</dt><dd>{data.reported_name||'Usuario'}</dd>
        <dt>Fecha</dt><dd>{date(data.created_at)}</dd>
      </dl>
      <p className="staff-preview-description mt-4">{data.details||'Sin detalles adicionales'}</p>
      {onOpenArticle&&data.articulo_id&&data.article_title&&<button type="button" className="staff-button" onClick={()=>onOpenArticle({id:data.articulo_id,title:data.article_title})}><Eye size={17} />Ver publicación</button>}
      {data.sale_dispute&&<section className="staff-status-band mt-4">
        <h3 className="font-bold">Revisión de venta · {data.sale_dispute.kind==='payment'?'Pago declarado':'Cancelación'}</h3>
        <p className="mt-2">Las declaraciones y capturas no confirman un pago. Revisar el contexto y escuchar a ambas partes antes de decidir. No se devuelven pagos externos desde este panel.</p>
        {data.sale_dispute.paymentDeclaredAt&&<p className="mt-2">Pago declarado el {date(data.sale_dispute.paymentDeclaredAt)} (sin verificar).</p>}
        {data.sale_dispute.cancelReason&&<p className="mt-2">Cancelación: {data.sale_dispute.cancelReason}</p>}
        {data.sale_dispute.status==='open'&&<form onSubmit={resolveSale} className="mt-3 grid gap-3">
          <label>Decisión<select className="staff-input" value={decision} onChange={event=>setDecision(event.target.value)} disabled={busy}>
            <option value="resume">Cerrar revisión y retirar la pausa de este caso</option>
            {data.sale_dispute.kind==='cancellation'&&<option value="restore_buyer">Cerrar y permitir que el comprador reserve de nuevo</option>}
            {data.sale_dispute.canCancel&&<option value="cancel_reservation">Cancelar esta reserva y volver a disponible</option>}
          </select></label>
          <p>Retirar la pausa recupera el estado anterior cuando no quedan otros casos de pago abiertos. No certifica pagos, no marca entregas ni aplica sanciones. Una cancelación autorizada devuelve únicamente el crédito adicional de reserva, si existía.</p>
          <label>Motivo de la decisión<textarea className="staff-input" value={reason} onChange={event=>setReason(event.target.value)} required minLength={8} maxLength={500} rows={3} /></label>
          <p>Esta respuesta será visible para ambos participantes en el estado de su reserva.</p>
          <button type="submit" className="staff-button" disabled={busy}>{busy?'Guardando…':'Resolver caso'}</button>
        </form>}
      </section>}
      {data.resolution&&<p className="staff-status-band">Respuesta de administración: {data.resolution}</p>}
      {data.kind==='chat'&&<section className="mt-6"><h3 className="font-bold text-sm">Contexto del chat al reportar</h3>
        <ol className="staff-chat-messages">{(data.messages_snapshot||[]).map(message=><li key={message.id}>
          <strong className="text-sm">{message.sender_name||'Usuario'}</strong><p>{message.body}</p><time dateTime={message.created_at}>{date(message.created_at)}</time>
        </li>)}</ol>{!data.messages_snapshot?.length&&<p className="staff-empty">No había mensajes al enviar esta denuncia.</p>}
      </section>}
    </>}
  </dialog>;
}
