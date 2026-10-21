import { useEffect,useRef,useState } from 'react';
import { ArrowLeft,ArrowRight,Eye,Star,X,Mail } from 'lucide-react';
import { staffRpc } from './staffClient.js';

const date=value=>value?new Date(value).toLocaleString('es-CO',{dateStyle:'short',timeStyle:'short',timeZone:'America/Bogota'}):'Sin registro';
const states={disponible:'Disponible',reservado:'Reservada',entregado:'Entregada',en_revision:'En revisión',pausado:'Pausada'};
const metrics=[['created','Creadas'],['active','Activas'],['reserved','Reservadas'],['delivered','Entregadas'],['deleted','Eliminadas'],['featured','Con destacado'],['reported','Con reportes'],['reviewing','En revisión / pausadas']];

export default function StaffUserDetail({user,onClose,onReady,onAccessExpired,onOpenArticle,onMessage}) {
  const dialog=useRef(null),request=useRef(null);
  const [data,setData]=useState(null),[page,setPage]=useState(1),[busy,setBusy]=useState(true),[error,setError]=useState('');
  useEffect(()=>{
    let active=true;
    if(!dialog.current.open)dialog.current.showModal();
    if(request.current?.page!==page)request.current={page,promise:staffRpc('staff_user_detail',{p_id:user.id,p_page:page})};
    request.current.promise.then(result=>{if(active){setData(result);setBusy(false);onReady();}}).catch(err=>{
      if(active){setError(err.message);setBusy(false);if(err.code==='42501')onAccessExpired('Verifica nuevamente tu acceso al panel.');}
    });
    return()=>{active=false;};
  },[user.id,page,onReady,onAccessExpired]);
  const changePage=value=>{setBusy(true);setError('');setPage(value);};
  const profile=data?.profile,stats=data?.stats;
  return <dialog ref={dialog} className="staff-modal staff-user-detail" aria-labelledby="staff-user-title" onCancel={onClose}>
    <div className="staff-modal-heading"><h2 id="staff-user-title">Ficha de usuario</h2><button type="button" className="staff-icon-button" aria-label="Cerrar ficha de usuario" title="Cerrar ficha" onClick={onClose}><X size={17} /></button></div>
    {error&&<p role="alert" className="staff-error">{error}</p>}
    {busy&&<p role="status">Cargando ficha...</p>}
    {profile&&<>
      <div className="staff-user-heading">{profile.foto_url&&<img src={profile.foto_url} alt="" />}<div><h3>{profile.nombre||'Usuario'}</h3><span className="staff-badge">{{blocked:'Bloqueado',suspended:'Suspendido',active:'Activo'}[profile.account_state]}</span>{profile.staff_role&&<span className="staff-badge">{profile.staff_role==='master'?'Super Admin':'Admin'}</span>}</div></div>
      {onMessage&&<div className="staff-user-message-action">{user.articleContext&&<p>Sobre la publicación: <strong>{user.articleContext.title}</strong></p>}<button type="button" className="staff-button staff-button-primary" disabled={busy} onClick={()=>onMessage({id:profile.id,nombre:profile.nombre||'Usuario'})}><Mail size={16} />{user.articleContext?'Enviar mensaje sobre esta publicación':'Enviar mensaje'}</button></div>}
      <div className="staff-user-rating"><Star size={16} aria-hidden="true" /><strong>{stats.rating===null?'Sin calificaciones':`${Number(stats.rating).toFixed(1)} / 5`}</strong><span>{stats.rating_count} calificaciones registradas</span></div>
      <dl className="staff-user-metrics">{metrics.map(([key,label])=><div key={key}><dt>{label}</dt><dd>{stats[key]}</dd></div>)}</dl>
      <h3 className="staff-user-section-title">Datos de la cuenta</h3>
      <dl className="staff-preview-facts">
        <dt>Correo</dt><dd>{profile.email||'Sin registrar'}</dd><dt>Teléfono</dt><dd>{profile.movil||'Sin registrar'}</dd>
        <dt>Dirección</dt><dd>{profile.direccion||'Sin registrar'}</dd><dt>Ciudad</dt><dd>{profile.ciudad||'Sin registrar'}</dd><dt>Barrio / localidad</dt><dd>{profile.localidad||'Sin registrar'}</dd>
        <dt>Registro</dt><dd>{date(profile.created_at)}</dd><dt>Último ingreso</dt><dd>{date(profile.last_sign_in_at)}</dd>
        <dt>Correo confirmado</dt><dd>{profile.email_confirmed_at?'Sí':'No'}</dd><dt>Créditos disponibles</dt><dd>{profile.credits}</dd>
        {profile.ban_until&&<><dt>Suspensión hasta</dt><dd>{date(profile.ban_until)}</dd></>}
        <dt>ID de cuenta</dt><dd>{profile.id}</dd>
      </dl>
      <h3 className="staff-user-section-title">Historial de publicaciones <span>({data.total})</span></h3>
      <dl className="staff-user-history-scope"><dt>Registro disponible desde</dt><dd>{date(data.history_since)}</dd></dl>
      <ul className="staff-user-history">{data.rows.map(article=><li key={article.article_id}>
        <div><strong>{article.title||'Sin título'}</strong><div className="staff-user-history-meta"><span>{article.mode==='venta'?'Venta':'Donación'}</span><time>{date(article.created_at)}</time><span className="staff-badge">{article.deleted_at?'Eliminada':states[article.status]||article.status}</span>{article.delivered_ever&&article.status!=='entregado'&&<span className="staff-badge">Entregada anteriormente</span>}{article.featured_ever&&<span className="staff-badge">Con destacado</span>}{Number(article.report_count)>0&&<span className="staff-badge staff-badge-warning">{article.report_count} reportes</span>}</div></div>
        {!article.deleted_at&&onOpenArticle&&<button type="button" className="staff-icon-button" aria-label={`Ver publicación: ${article.title}`} title="Ver publicación" disabled={busy} onClick={()=>onOpenArticle({id:article.article_id,title:article.title})}><Eye size={17} /></button>}
      </li>)}</ul>
      {!data.rows.length&&<p className="staff-empty">No hay publicaciones registradas.</p>}
      {data.pageCount>1&&<nav className="staff-pagination" aria-label="Paginación de historial de usuario"><button type="button" className="staff-icon-button" aria-label="Historial anterior" title="Historial anterior" disabled={busy||data.page<=1} onClick={()=>changePage(data.page-1)}><ArrowLeft size={17} /></button><span>{data.page} / {data.pageCount}</span><button type="button" className="staff-icon-button" aria-label="Historial siguiente" title="Historial siguiente" disabled={busy||data.page>=data.pageCount} onClick={()=>changePage(data.page+1)}><ArrowRight size={17} /></button></nav>}
    </>}
  </dialog>;
}
