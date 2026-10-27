import { useEffect,useRef,useState } from 'react';
import { ArrowLeft,ArrowRight,Save,Trash2,X } from 'lucide-react';
import { staffRpc } from './staffClient.js';
import { articleImages, CORRECTION_REASONS, correctionReason } from './moderation.js';
import { detectContactoProhibido } from '../components/articleValidation.js';

export default function StaffArticleEditor({article,onClose,onSaved,onReady}) {
  const dialog=useRef(null),request=useRef(null),inFlight=useRef(false);
  const [data,setData]=useState(null),[title,setTitle]=useState(''),[description,setDescription]=useState('');
  const [images,setImages]=useState([]),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [details,setDetails]=useState('');
  useEffect(()=>{
    let active=true;
    if(!dialog.current.open)dialog.current.showModal();
    if(!request.current)request.current=staffRpc('staff_article_detail',{p_id:article.id});
    request.current.then(result=>{if(active){setData(result);setTitle(result.title||'');setDescription(result.description||'');setImages(articleImages(result));onReady();}}).catch(err=>{if(active)setError(err.message);});
    return()=>{active=false;};
  },[article.id,onReady]);
  const contactError=detectContactoProhibido(title)||detectContactoProhibido(description);
  const protectedArticle=['reservado','entregado'].includes(data?.status);
  const selectedReason=correctionReason(reason);
  const fullReason=correctionReason(reason,details);
  const detailsLimit=500-selectedReason.length-2;
  const changed=data&&(title.trim()!==(data.title||'')||description.trim()!==(data.description||'')||JSON.stringify(images)!==JSON.stringify(articleImages(data)));
  const move=(index,step)=>setImages(previous=>{
    const next=[...previous];[next[index],next[index+step]]=[next[index+step],next[index]];return next;
  });
  const save=async event=>{
    event.preventDefault();if(inFlight.current||!data||protectedArticle||contactError||!changed||!selectedReason||fullReason.length>500)return;
    inFlight.current=true;setBusy(true);setError('');
    try {
      const result=await staffRpc('staff_edit_article',{p_id:article.id,p_title:title.trim(),p_description:description.trim(),p_images:images,p_version:data.content_version,p_reason:selectedReason,p_details:details.trim()});
      onSaved(result);
    } catch(err) {setError(err.message);}
    finally {inFlight.current=false;setBusy(false);}
  };
  return <dialog ref={dialog} className="staff-modal staff-article-editor" aria-labelledby="staff-edit-title" onCancel={event=>{event.preventDefault();if(!busy)onClose();}}>
    <div className="staff-modal-heading"><h2 id="staff-edit-title">Corregir publicación</h2><button type="button" className="site-icon-close inline-flex items-center justify-center staff-icon-button" aria-label="Cerrar edición" title="Cerrar edición" disabled={busy} onClick={onClose}><X size={17} /></button></div>
    {!data&&!error&&<p role="status">Cargando publicación...</p>}
    {data&&<form onSubmit={save}>
      {protectedArticle&&<p role="alert" className="staff-error">Las publicaciones reservadas o entregadas están protegidas.</p>}
      <label htmlFor="staff-edit-article-title">Título</label><input id="staff-edit-article-title" value={title} onChange={event=>{setTitle(event.target.value);setError('');}} minLength={3} maxLength={150} required disabled={busy||protectedArticle} />
      <label htmlFor="staff-edit-description">Descripción</label><textarea id="staff-edit-description" value={description} onChange={event=>{setDescription(event.target.value);setError('');}} maxLength={5000} disabled={busy||protectedArticle} />
      {contactError&&<p role="alert" className="staff-error">Retira los datos de contacto del título y la descripción.</p>}
      <h3 className="mt-6 text-sm font-bold">Fotos</h3>
      <ul className="staff-editor-gallery">{images.map((src,index)=><li key={src}>
        <img src={src} alt={`Foto ${index+1} de la publicación`} loading="lazy" /><span className="staff-item-detail">{index===0?'Principal':`Foto ${index+1}`}</span>
        <div className="staff-actions">
          <button type="button" className="staff-icon-button" aria-label={`Mover foto ${index+1} hacia antes`} title="Mover hacia antes" disabled={busy||protectedArticle||index===0} onClick={()=>move(index,-1)}><ArrowLeft size={17} /></button>
          <button type="button" className="staff-icon-button" aria-label={`Mover foto ${index+1} hacia después`} title="Mover hacia después" disabled={busy||protectedArticle||index===images.length-1} onClick={()=>move(index,1)}><ArrowRight size={17} /></button>
          <button type="button" className="staff-icon-button staff-danger" aria-label={`Retirar foto ${index+1}`} title="Retirar foto" disabled={busy||protectedArticle} onClick={()=>setImages(previous=>previous.filter(value=>value!==src))}><Trash2 size={17} /></button>
        </div>
      </li>)}</ul>{!images.length&&<p className="staff-item-detail mt-2">Sin fotos</p>}
      <label htmlFor="staff-edit-reason">Motivo de la corrección</label><select id="staff-edit-reason" value={reason} onChange={event=>{setReason(event.target.value);setError('');}} required disabled={busy||protectedArticle}><option value="">Selecciona un motivo</option>{CORRECTION_REASONS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
      <label htmlFor="staff-edit-details">Nota interna (opcional)</label><textarea id="staff-edit-details" value={details} onChange={event=>setDetails(event.target.value)} maxLength={detailsLimit} disabled={busy||protectedArticle} />
      {fullReason.length>500&&<p role="alert" className="staff-error">Acorta los detalles adicionales para no superar los 500 caracteres con el motivo seleccionado.</p>}
      <button type="submit" className="staff-button staff-button-primary" disabled={busy||protectedArticle||!changed||!!contactError||!selectedReason||fullReason.length>500}><Save size={17} />{busy?'Guardando...':'Guardar y notificar'}</button>
    </form>}
    {error&&<p role="alert" className="staff-error">{error}</p>}
  </dialog>;
}
