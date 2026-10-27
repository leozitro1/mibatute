import { useEffect,useRef,useState } from 'react';
import { ArrowLeft,ArrowRight,Eye,MousePointerClick,Pause,Pencil,Play,Plus,TrendingUp,X } from 'lucide-react';
import { staffRpc } from './staffClient.js';
import StaffSponsorEditor from './StaffSponsorEditor.jsx';
import { ctr,SPONSOR_STATES,sponsorCoverage } from '../sponsors/model.js';

const date=value=>value?new Date(value).toLocaleString('es-CO',{dateStyle:'short',timeStyle:'short',timeZone:'America/Bogota'}):'Sin límite';
export default function StaffSponsors({query,revision,onReady,onAccessExpired}) {
  const [data,setData]=useState(null),[pagination,setPagination]=useState({query,page:1}),[days,setDays]=useState(30),[placement,setPlacement]=useState(''),[state,setState]=useState('');
  const page=pagination.query===query?pagination.page:1;
  const setPage=value=>setPagination({query,page:value});
  const [busy,setBusy]=useState(true),[error,setError]=useState(''),[editor,setEditor]=useState(null),[action,setAction]=useState(null),[refresh,setRefresh]=useState(0);
  const request=useRef(null),dialog=useRef(null),inFlight=useRef(false);
  useEffect(()=>{
    let active=true;const key=JSON.stringify([query,revision,page,days,placement,state,refresh]);
    if(request.current?.key!==key)request.current={key,promise:staffRpc('staff_sponsor_dashboard',{p_search:query,p_page:page,p_days:days,p_placement:placement,p_state:state})};
    request.current.promise.then(result=>{if(active){setData(result);setBusy(false);onReady();}}).catch(err=>{if(active){setError(err.message);setBusy(false);if(err.code==='42501')onAccessExpired('Acceso no autorizado.');}});
    return()=>{active=false;};
  },[query,revision,page,days,placement,state,refresh,onReady,onAccessExpired]);
  useEffect(()=>{if(action&&!dialog.current.open)dialog.current.showModal();},[action]);
  const filter=(setter,value)=>{setBusy(true);setError('');setter(value);setPage(1);};
  const reload=()=>{setBusy(true);setRefresh(previous=>previous+1);};
  const toggle=async event=>{
    event.preventDefault();if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');
    try {
      await staffRpc('staff_save_sponsor',{p_id:action.id,p_data:{...action,activo:!action.activo},p_version:action.updated_at});
      setAction(null);onReady();reload();
    } catch(err){setError(err.message);setBusy(false);}finally{inFlight.current=false;}
  };
  const trend=data?.trend||[],max=Math.max(1,...trend.map(item=>Number(item.impressions)));
  return <section aria-label="Gestión de campañas">
    <div className="staff-filters"><div><label htmlFor="sponsors-slot">Espacio publicitario</label><select id="sponsors-slot" value={placement} onChange={event=>filter(setPlacement,event.target.value)}><option value="">Todos los espacios</option><option value="hero">Banner principal</option><option value="footer">Cuadro de patrocinadores</option></select></div><div><label htmlFor="sponsors-state">Estado de campaña</label><select id="sponsors-state" value={state} onChange={event=>filter(setState,event.target.value)}><option value="">Todos los estados</option>{Object.entries(SPONSOR_STATES).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></div><div><label htmlFor="sponsors-period">Período</label><select id="sponsors-period" value={days} onChange={event=>filter(setDays,Number(event.target.value))}><option value={7}>Últimos 7 días</option><option value={30}>Últimos 30 días</option><option value={90}>Últimos 90 días</option></select></div></div>
    <div className="staff-sponsor-toolbar"><span role="status">{data?.total??0} campañas</span><button type="button" className="staff-button staff-button-primary" onClick={()=>setEditor({})}><Plus size={17} />Nueva campaña</button></div>
    {error&&!action&&<p role="alert" className="staff-error">{error}</p>}{busy&&<p role="status" className="staff-item-detail">Actualizando campañas...</p>}
    {data&&<>
      <dl className="staff-sponsor-metrics"><div><dt><Eye size={16} />Impresiones</dt><dd>{new Intl.NumberFormat('es-CO').format(data.totals.impressions)}</dd></div><div><dt><MousePointerClick size={16} />Clics</dt><dd>{new Intl.NumberFormat('es-CO').format(data.totals.clicks)}</dd></div><div><dt><TrendingUp size={16} />CTR</dt><dd>{ctr(data.totals.impressions,data.totals.clicks)}</dd></div><div><dt>Campañas activas</dt><dd>{data.active}</dd></div></dl>
      <figure className="staff-sponsor-chart"><figcaption>Impresiones por día</figcaption><div className="staff-sponsor-bars" role="img" aria-label={`Impresiones diarias en los últimos ${days} días`}>{trend.map(item=><div key={item.day} title={`${item.day}: ${item.impressions} impresiones · ${item.clicks} clics`} style={{height:`${Math.max(2,Number(item.impressions)/max*100)}%`}} />)}</div><div className="staff-sponsor-chart-range"><span>{trend[0]?.day}</span><span>{trend.at(-1)?.day}</span></div></figure>
      <table className="staff-table staff-sponsor-table"><thead><tr><th>Campaña</th><th>Estado / vigencia</th><th>Impresiones</th><th>Clics</th><th>CTR</th><th>Acciones</th></tr></thead><tbody>{data.rows.map(row=><tr key={row.id}><td><button type="button" className="staff-item staff-article-link" aria-label={`Editar campaña: ${row.texto}`} onClick={()=>setEditor(row)}>{row.imagen_url&&<img src={row.imagen_url} alt="" />}<span><strong className="staff-item-title">{row.texto}</strong><span className="staff-item-detail">{row.placement==='hero'?'Banner principal':'Cuadro de patrocinadores'} · {Math.max(1,row.creative_assets?.length||0)} imágenes</span><span className="staff-item-detail staff-sponsor-coverage" title={sponsorCoverage(row)}>{sponsorCoverage(row)}</span></span></button></td><td data-label="Estado / vigencia"><span className="staff-badge">{SPONSOR_STATES[row.campaign_state]}</span><span className="staff-item-detail">{row.starts_at?date(row.starts_at):'Desde ahora'}</span><span className="staff-item-detail">{date(row.ends_at)}</span></td><td data-label="Impresiones">{row.period_impressions}</td><td data-label="Clics">{row.period_clicks}</td><td data-label="CTR">{ctr(row.period_impressions,row.period_clicks)}</td><td><div className="staff-actions staff-report-actions"><button type="button" className="staff-icon-button" title="Editar campaña" aria-label={`Editar ${row.texto}`} onClick={()=>setEditor(row)}><Pencil size={17} /></button><button type="button" className="staff-icon-button" title={row.activo?'Pausar campaña':'Activar campaña'} aria-label={row.activo?'Pausar campaña':'Activar campaña'} disabled={busy} onClick={()=>{setAction(row);setError('');}}>{row.activo?<Pause size={17} />:<Play size={17} />}</button></div></td></tr>)}</tbody></table>
      {!data.rows.length&&<p className="staff-empty">No hay campañas que coincidan.</p>}
      {data.pageCount>1&&<nav className="staff-pagination" aria-label="Paginación de campañas"><button type="button" className="staff-icon-button" aria-label="Campañas anteriores" title="Anterior" disabled={busy||data.page<=1} onClick={()=>{setBusy(true);setPage(data.page-1);}}><ArrowLeft size={17} /></button><span>{data.page} / {data.pageCount}</span><button type="button" className="staff-icon-button" aria-label="Campañas siguientes" title="Siguiente" disabled={busy||data.page>=data.pageCount} onClick={()=>{setBusy(true);setPage(data.page+1);}}><ArrowRight size={17} /></button></nav>}
      <p className="staff-sponsor-measurement-note">Medición orientativa por carga de página · hora de Colombia</p>
    </>}
    {editor&&<StaffSponsorEditor key={editor.id||'new'} campaign={editor.id?editor:null} onClose={()=>setEditor(null)} onSaved={()=>{setEditor(null);onReady();reload();}} />}
    {action&&<dialog ref={dialog} className="staff-modal" aria-labelledby="sponsor-toggle-title" onCancel={event=>{event.preventDefault();if(!busy)setAction(null);}}><form onSubmit={toggle}><div className="staff-modal-heading"><h2 id="sponsor-toggle-title">{action.activo?'Pausar campaña':'Activar campaña'}</h2><button type="button" className="site-icon-close inline-flex items-center justify-center staff-icon-button" aria-label="Cerrar acción de campaña" title="Cerrar" disabled={busy} onClick={()=>setAction(null)}><X size={17} /></button></div><p>{action.texto}</p>{error&&<p role="alert" className="staff-error">{error}</p>}<button type="submit" className="staff-button staff-button-primary" disabled={busy}>Confirmar</button></form></dialog>}
  </section>;
}
