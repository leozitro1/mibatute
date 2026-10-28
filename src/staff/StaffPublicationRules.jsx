import {useCallback,useEffect,useState} from 'react';
import {ShieldCheck,Plus,RefreshCw,Pencil,Pause,Play,X} from 'lucide-react';
import {staffRpc} from './staffClient.js';
import {invalidatePublicationRules} from '../supabase/publicationRules.js';

export default function StaffPublicationRules({onReady,onAccessExpired}){
 const [rows,setRows]=useState([]),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[term,setTerm]=useState(''),[editing,setEditing]=useState(null);
 const load=useCallback(async()=>{
  setBusy(true);setError('');
  try{setRows(await staffRpc('staff_publication_rules')||[]);setLoaded(true);onReady?.();}
  catch(err){if(err.code==='42501')onAccessExpired?.('Verifica nuevamente tu acceso.');else setError(err.message||'No se pudo cargar el filtro.');}
  finally{setBusy(false);}
 },[onReady,onAccessExpired]);
 useEffect(()=>{void load();},[load]);
 const save=async(event,row=null)=>{
  event?.preventDefault();if(busy)return;
  const target=row||editing;
  setBusy(true);setError('');setNotice('');
  try{
   const result=await staffRpc('staff_save_publication_rule',{p_id:target?.id||null,p_term:row?row.term:term,p_active:row?!row.active:editing?.active??true,p_version:target?.updated_at||null});
   invalidatePublicationRules();setRows(previous=>[...previous.filter(item=>item.id!==result.id),result].sort((a,b)=>a.term.localeCompare(b.term,'es')));
   if(!row){setEditing(null);setTerm('');}setNotice('Filtro guardado. Se aplicará al crear o modificar textos, sin sancionar automáticamente.');onReady?.();
  }catch(err){if(err.code==='42501')onAccessExpired?.('Verifica nuevamente tu acceso.');else setError(err.message||'No se pudo guardar la regla.');}
  finally{setBusy(false);}
 };
 return <section className="staff-publication-rules" aria-labelledby="publication-rules-title">
  <div className="staff-location-list-heading"><h2 id="publication-rules-title"><ShieldCheck size={19} aria-hidden="true"/>Filtro de publicaciones</h2><button type="button" className="staff-button" disabled={busy} onClick={load}><RefreshCw size={15}/>Actualizar</button></div>
  <p>Los contactos, correos, enlaces y usuarios de redes sociales se comprueban automáticamente en título y descripción. Aquí puedes añadir palabras o frases. Se revisan palabras completas, tildes, caracteres invisibles y algunas variantes disimuladas.</p>
  <p>No añadas marcas ni términos ambiguos. No se aplican sanciones automáticas ni se modifican publicaciones anteriores. Las fotos necesitan revisión del equipo.</p>
  {error&&<p role="alert" className="staff-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
  <form onSubmit={save} className="staff-rule-form">
   <label htmlFor="publication-rule-term">{editing?'Editar palabra o frase':'Nueva palabra o frase'}</label>
   <div><input id="publication-rule-term" type="text" value={term} minLength={3} maxLength={80} required disabled={busy||!loaded} autoComplete="off" placeholder="Escribe una palabra o frase concreta" onChange={event=>setTerm(event.target.value)}/><button type="submit" disabled={busy||!loaded||(!editing&&rows.length>=200)} className="staff-button staff-button-primary"><Plus size={16}/>{editing?'Guardar':'Agregar'}</button>{editing&&<button type="button" className="staff-button" disabled={busy} onClick={()=>{setEditing(null);setTerm('');}}><X size={15}/>Cancelar</button>}</div>
   <small>3–80 caracteres, hasta 8 palabras. No se aceptan patrones ni expresiones regulares. Máximo 200 reglas.</small>
  </form>
  {loaded&&!rows.length&&<p>Aún no hay palabras adicionales. La protección contra contactos ya está activa.</p>}
  <ul className="staff-rule-list">{rows.map(row=><li key={row.id}><div><strong>{row.term}</strong><span className={`staff-badge ${row.active?'':'staff-badge-muted'}`}>{row.active?'Activa':'Desactivada'}</span></div><div><button type="button" className="staff-button" disabled={busy} onClick={()=>{setEditing(row);setTerm(row.term);}} aria-label={`Editar regla ${row.term}`}><Pencil size={15}/>Editar</button><button type="button" className="staff-button" disabled={busy||!!editing} onClick={event=>save(event,row)}>{row.active?<Pause size={15}/>:<Play size={15}/>} {row.active?'Desactivar':'Activar'}</button></div></li>)}</ul>
 </section>;
}
