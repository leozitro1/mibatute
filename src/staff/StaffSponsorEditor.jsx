import { useEffect,useRef,useState } from 'react';
import { ArrowDown,ArrowUp,Save,Trash2,Upload,X } from 'lucide-react';
import { staffClient,staffRpc } from './staffClient.js';
import { bogotaInput,bogotaIso,safeSponsorUrl } from '../sponsors/model.js';
import StaffSponsorTargeting from './StaffSponsorTargeting.jsx';

const empty={texto:'',descripcion:'',imagen_url:'',mobile_image_url:'',enlace:'',placement:'hero',position:0,badge:'Publicidad',button_text:'Visitar sitio',destination:'external',activo:false,starts_at:'',ends_at:''};
export default function StaffSponsorEditor({campaign,onClose,onSaved}) {
  const dialog=useRef(null),uploads=useRef([]),inFlight=useRef(false);
  const [draft,setDraft]=useState(()=>({...empty,...campaign,extra_assets:(campaign?.creative_assets||[]).slice(1),target_locations:campaign?.target_locations||[],target_categories:campaign?.target_categories||[],starts_at:bogotaInput(campaign?.starts_at),ends_at:bogotaInput(campaign?.ends_at)}));
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{if(!dialog.current.open)dialog.current.showModal();},[]);
  const change=(key,value)=>{setDraft(previous=>({...previous,[key]:value,...(key==='placement'&&value==='footer'?{destination:'external'}:{})}));setError('');};
  const cleanup=async(keep=[])=>{
    const paths=uploads.current.filter(item=>!keep.includes(item.url)).map(item=>item.path);
    if(paths.length)await staffClient.storage.from('sponsor-media').remove(paths);
  };
  const close=async()=>{if(busy||inFlight.current)return;inFlight.current=true;setBusy(true);await cleanup();onClose();};
  const changeAsset=(index,key,value)=>setDraft(previous=>({...previous,extra_assets:previous.extra_assets.map((asset,position)=>position===index?{...asset,[key]:value}:asset)}));
  const moveAsset=(index,direction)=>setDraft(previous=>{
    const assets=[...previous.extra_assets];[assets[index],assets[index+direction]]=[assets[index+direction],assets[index]];return {...previous,extra_assets:assets};
  });
  const upload=async(event,key,index=null)=>{
    const files=Array.from(event.target.files||[]);event.target.value='';if(!files.length||inFlight.current)return;
    if(key==='gallery'&&draft.extra_assets.length+files.length>11){setError('Puedes añadir hasta 12 imágenes por campaña, incluida la principal.');return;}
    if(files.some(file=>!['image/jpeg','image/png','image/webp','image/avif'].includes(file.type)||file.size>5*1024*1024)){setError('Selecciona imágenes JPG, PNG, WebP o AVIF de hasta 5 MB cada una.');return;}
    inFlight.current=true;setBusy(true);setError('');
    try {
      for(const file of files) {
      const bitmap=await createImageBitmap(file);
      if(bitmap.width*bitmap.height>40_000_000){bitmap.close();throw new Error('La imagen supera los 40 megapíxeles.');}
      const limit=key==='mobile_image_url'?1000:1800,scale=Math.min(1,limit/bitmap.width,limit/bitmap.height);
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.85));if(!blob)throw new Error('No se pudo preparar la imagen.');
      const path=`campaigns/${crypto.randomUUID()}.webp`,bucket=staffClient.storage.from('sponsor-media');
      const {error:uploadError}=await bucket.upload(path,blob,{contentType:'image/webp',cacheControl:'31536000'});if(uploadError)throw uploadError;
      const {data}=bucket.getPublicUrl(path);uploads.current.push({path,url:data.publicUrl});
      if(key==='gallery')setDraft(previous=>({...previous,extra_assets:[...previous.extra_assets,{imagen_url:data.publicUrl,mobile_image_url:''}]}));
      else if(index!==null)changeAsset(index,key,data.publicUrl);
      else change(key,data.publicUrl);
      }
    } catch(err){setError(err.message);}finally{inFlight.current=false;setBusy(false);}
  };
  const save=async event=>{
    event.preventDefault();if(inFlight.current)return;
    inFlight.current=true;setBusy(true);setError('');
    try {
      const data={...draft,imagen_url:safeSponsorUrl(draft.imagen_url,import.meta.env.DEV),mobile_image_url:draft.mobile_image_url?safeSponsorUrl(draft.mobile_image_url,import.meta.env.DEV):'',enlace:safeSponsorUrl(draft.enlace),starts_at:bogotaIso(draft.starts_at),ends_at:bogotaIso(draft.ends_at),position:Number(draft.position)};
      if(!data.imagen_url||(draft.mobile_image_url&&!data.mobile_image_url)||(data.destination==='external'&&!data.enlace))throw new Error('Revisa las direcciones de imágenes y del enlace.');
      data.creative_assets=[{imagen_url:data.imagen_url,mobile_image_url:data.mobile_image_url},...draft.extra_assets.map(asset=>({imagen_url:safeSponsorUrl(asset.imagen_url,import.meta.env.DEV),mobile_image_url:asset.mobile_image_url?safeSponsorUrl(asset.mobile_image_url,import.meta.env.DEV):''}))];
      if(data.creative_assets.some((asset,index)=>!asset.imagen_url||(index>0&&draft.extra_assets[index-1].mobile_image_url&&!asset.mobile_image_url)))throw new Error('Revisa las imágenes adicionales.');
      delete data.extra_assets;
      await staffRpc('staff_save_sponsor',{p_id:campaign?.id||null,p_data:data,p_version:campaign?.updated_at||null});
      await cleanup(data.creative_assets.flatMap(asset=>[asset.imagen_url,asset.mobile_image_url]));onSaved();
    } catch(err){setError(err.message);}finally{inFlight.current=false;setBusy(false);}
  };
  return <dialog ref={dialog} className="staff-modal staff-sponsor-editor" aria-labelledby="staff-sponsor-editor-title" onCancel={event=>{event.preventDefault();close();}}>
    <form onSubmit={save}><div className="staff-modal-heading"><h2 id="staff-sponsor-editor-title">{campaign?'Editar campaña':'Nueva campaña'}</h2><button type="button" className="site-icon-close inline-flex items-center justify-center staff-icon-button" aria-label="Cerrar campaña" title="Cerrar" disabled={busy} onClick={close}><X size={17} /></button></div>
      <label htmlFor="sponsor-name">Nombre / título</label><input id="sponsor-name" value={draft.texto} onChange={event=>change('texto',event.target.value)} minLength={2} maxLength={100} required disabled={busy} />
      <label htmlFor="sponsor-description">Descripción</label><textarea id="sponsor-description" value={draft.descripcion||''} onChange={event=>change('descripcion',event.target.value)} maxLength={250} disabled={busy} />
      <div className="staff-sponsor-fields"><div><label htmlFor="sponsor-placement">Espacio</label><select id="sponsor-placement" value={draft.placement} onChange={event=>change('placement',event.target.value)} disabled={busy}><option value="hero">Banner principal</option><option value="footer">Cuadro de patrocinadores</option></select></div><div><label htmlFor="sponsor-position">Orden</label><input id="sponsor-position" type="number" min={0} max={999} step={1} required value={draft.position} onChange={event=>change('position',event.target.value)} disabled={busy} /></div></div>
      {[['imagen_url','Imagen principal'],['mobile_image_url','Imagen móvil (opcional)']].map(([key,label])=><div key={key}>
        <label htmlFor={`sponsor-${key}`}>{label}</label><input id={`sponsor-${key}`} type="url" value={draft[key]||''} onChange={event=>change(key,event.target.value)} required={key==='imagen_url'} maxLength={2048} disabled={busy} />
        <label className="staff-upload-button"><Upload size={16} /><span>Subir {key==='imagen_url'?'imagen principal':'imagen móvil'}</span><input type="file" aria-label={`Subir ${label.toLowerCase()}`} accept="image/jpeg,image/png,image/webp,image/avif" onChange={event=>upload(event,key)} disabled={busy} /></label>
        {safeSponsorUrl(draft[key],import.meta.env.DEV)&&<img className="staff-sponsor-preview" src={safeSponsorUrl(draft[key],import.meta.env.DEV)} alt={`Vista previa: ${label}`} />}
      </div>)}
      <fieldset className="staff-sponsor-targeting" disabled={busy}><legend>Imágenes de la campaña · {1+draft.extra_assets.length} / 12</legend>
        <label className="staff-upload-button"><Upload size={16} /><span>Subir imágenes adicionales</span><input type="file" multiple aria-label="Subir imágenes adicionales" accept="image/jpeg,image/png,image/webp,image/avif" onChange={event=>upload(event,'gallery')} disabled={busy||draft.extra_assets.length>=11} /></label>
        <ol className="staff-sponsor-assets">{draft.extra_assets.map((asset,index)=><li key={index}>
          <div className="staff-sponsor-asset-heading"><strong>Imagen {index+2}</strong><div className="staff-actions"><button type="button" className="staff-icon-button" title="Mover antes" aria-label={`Mover antes imagen ${index+2}`} disabled={busy||index===0} onClick={()=>moveAsset(index,-1)}><ArrowUp size={16} /></button><button type="button" className="staff-icon-button" title="Mover después" aria-label={`Mover después imagen ${index+2}`} disabled={busy||index===draft.extra_assets.length-1} onClick={()=>moveAsset(index,1)}><ArrowDown size={16} /></button><button type="button" className="staff-icon-button" title="Quitar imagen" aria-label={`Quitar imagen ${index+2}`} disabled={busy} onClick={()=>change('extra_assets',draft.extra_assets.filter((_,position)=>position!==index))}><Trash2 size={16} /></button></div></div>
          <img className="staff-sponsor-preview" src={asset.imagen_url} alt={`Vista previa: imagen ${index+2}`} />
          <label htmlFor={`sponsor-extra-${index}`}>Imagen {index+2} · URL</label><input id={`sponsor-extra-${index}`} type="url" value={asset.imagen_url} onChange={event=>changeAsset(index,'imagen_url',event.target.value)} required maxLength={2048} />
          <label htmlFor={`sponsor-extra-mobile-${index}`}>Imagen {index+2} · móvil (opcional)</label><input id={`sponsor-extra-mobile-${index}`} type="url" value={asset.mobile_image_url||''} onChange={event=>changeAsset(index,'mobile_image_url',event.target.value)} maxLength={2048} />
          <label className="staff-upload-button"><Upload size={16} /><span>Subir versión móvil</span><input type="file" aria-label={`Subir versión móvil imagen ${index+2}`} accept="image/jpeg,image/png,image/webp,image/avif" onChange={event=>upload(event,'mobile_image_url',index)} /></label>
        </li>)}</ol>
      </fieldset>
      <StaffSponsorTargeting draft={draft} change={change} busy={busy} />
      <label htmlFor="sponsor-destination">Destino</label><select id="sponsor-destination" value={draft.destination} onChange={event=>change('destination',event.target.value)} disabled={busy}><option value="external">Enlace HTTPS</option>{draft.placement==='hero'&&<><option value="how">Cómo funciona MiBatute</option><option value="blog">Guías de MiBatute</option></>}</select>
      {draft.destination==='external'&&<><label htmlFor="sponsor-link">Enlace de destino</label><input id="sponsor-link" type="url" required value={draft.enlace||''} onChange={event=>change('enlace',event.target.value)} maxLength={2048} disabled={busy} /></>}
      <div className="staff-sponsor-fields"><div><label htmlFor="sponsor-badge">Etiqueta</label><input id="sponsor-badge" value={draft.badge||''} onChange={event=>change('badge',event.target.value)} maxLength={40} disabled={busy} /></div><div><label htmlFor="sponsor-button">Texto del botón</label><input id="sponsor-button" value={draft.button_text} onChange={event=>change('button_text',event.target.value)} required maxLength={40} disabled={busy} /></div></div>
      <div className="staff-sponsor-fields"><div><label htmlFor="sponsor-start">Inicio · hora Colombia</label><input id="sponsor-start" type="datetime-local" value={draft.starts_at} onChange={event=>change('starts_at',event.target.value)} disabled={busy} /></div><div><label htmlFor="sponsor-end">Fin · hora Colombia</label><input id="sponsor-end" type="datetime-local" value={draft.ends_at} onChange={event=>change('ends_at',event.target.value)} disabled={busy} /></div></div>
      <label className="staff-permission"><input type="checkbox" checked={draft.activo} onChange={event=>change('activo',event.target.checked)} disabled={busy} />Campaña habilitada</label>
      {error&&<p className="staff-error" role="alert">{error}</p>}
      <button type="submit" className="staff-button staff-button-primary" disabled={busy}><Save size={17} />{busy?'Guardando...':'Guardar campaña'}</button>
    </form>
  </dialog>;
}
