import {useCallback,useEffect,useId,useRef,useState} from 'react';
import {MessageCircle,RefreshCw,LockKeyhole,ArrowLeft,ArrowRight, CircleHelp} from 'lucide-react';
import {supabase} from '../supabase/supabaseClient';
import {listenMarketSignals} from './marketSignals.js';
import useMobileApp from './useMobileApp.js';

export default function UserConversationInbox({userId,isActive,onOpenChat}){
 const [page,setPage]=useState(1),[data,setData]=useState({rows:[],hasMore:false}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[opening,setOpening]=useState(null);
 const [onlyOpen,setOnlyOpen]=useState(true);
 const mobileApp=useMobileApp(),helpId=useId();
 const [helpOpen,setHelpOpen]=useState(false);
 useEffect(()=>{
  if(!helpOpen)return;
  const timer=setTimeout(()=>setHelpOpen(false),10000);
  return()=>clearTimeout(timer);
 },[helpOpen]);
 const filterKey=JSON.stringify([userId,page,onlyOpen]);
 const sequence=useRef(0),loaded=useRef(null),[revision,setRevision]=useState(0);
 const load=useCallback(async()=>{
  const request=++sequence.current;setBusy(true);setError('');
  try{
   const {data:result,error:failure}=await supabase.rpc('profile_chat_history',{p_page:page,p_open_only:onlyOpen});
   if(failure)throw failure;
   if(sequence.current===request){setData(result||{rows:[],hasMore:false});loaded.current=filterKey;}
  }catch{if(sequence.current===request)setError('No se pudieron cargar las conversaciones. Intenta actualizar.');}
  finally{if(sequence.current===request)setBusy(false);}
 },[page,onlyOpen,filterKey]);
 useEffect(()=>{if(isActive&&loaded.current!==filterKey)load();},[isActive,filterKey,load,revision]);
 useEffect(()=>()=>{sequence.current++;},[]);
 useEffect(()=>listenMarketSignals(signal=>{
  if(signal.uid!==userId)return;
  if(signal.kind==='article'&&signal.article?.id){
   setData(previous=>({...previous,rows:signal.action==='DELETE'?previous.rows.filter(row=>row.article_id!==signal.article.id):previous.rows.map(row=>row.article_id===signal.article.id?{...row,title:signal.article.title??row.title,article_status:signal.article.status??row.article_status}:row)}));
   loaded.current=null;
  }
  if(signal.kind==='chat'&&signal.chat?.id){
   setData(previous=>({...previous,rows:signal.action==='DELETE'?previous.rows.filter(row=>row.chat_id!==signal.chat.id):previous.rows.map(row=>row.chat_id===signal.chat.id?{...row,chat_status:signal.chat.status??row.chat_status}:row)}));
   loaded.current=null;
   if(signal.action==='INSERT')setRevision(value=>value+1);
  }
  if(signal.kind==='reconnect'){loaded.current=null;setRevision(value=>value+1);}
 }),[userId]);
 const rows=onlyOpen?data.rows.filter(row=>row.chat_status==='open'&&!['entregado','delivered'].includes(row.article_status)):data.rows;
 const open=async row=>{
  setOpening(row.chat_id);setError('');
  try{await onOpenChat?.({article:{id:row.article_id},buyerId:row.buyer_id,chatId:row.chat_id,fromInbox:true});}
  catch{setError('No se pudo abrir la conversación. Es posible que el artículo ya no exista.');}
  finally{setOpening(null);}
 };
 return <section className="user-conversations" aria-label="Conversaciones de ventas y rescates">
  <div className={`user-conversations-heading${mobileApp?' user-conversations-heading-mobile':''}`}><div className="user-conversations-intro">
   <h3 className={mobileApp?'user-conversations-title':undefined}>{mobileApp?'Conversaciones':'Conversaciones de usuarios'}
    {mobileApp&&<button type="button" className="user-conversations-help-button" aria-label="Ayuda sobre conversaciones de usuarios" aria-expanded={helpOpen} aria-controls={helpId} onClick={()=>setHelpOpen(value=>!value)}><CircleHelp size={19} aria-hidden="true"/></button>}
   </h3>
   <p id={helpId} hidden={mobileApp&&!helpOpen} className={mobileApp?'user-conversations-help':undefined}>Chats de ventas y rescates. Desmarca el filtro para ver también pendientes y cerrados. Los cerrados son de solo lectura; al eliminar el artículo desaparecen sus chats.</p>
  </div><div className="user-conversations-tools"><label className="user-conversations-open-filter"><input type="checkbox" aria-label="Solo chats abiertos" checked={onlyOpen} onChange={event=>{sequence.current++;loaded.current=null;setOnlyOpen(event.target.checked);setPage(1);}}/>{mobileApp?'Abiertos':'Solo chats abiertos'}</label><button type="button" onClick={load} disabled={busy} title="Actualizar conversaciones" aria-label="Actualizar conversaciones"><RefreshCw size={17} className={busy?'animate-spin':''}/></button></div></div>
  {error&&<p role="alert" className="text-red-700">{error}</p>}
  {busy?<p role="status">Cargando conversaciones…</p>:rows.length? <ul className="user-conversations-list">{rows.map(row=>{
   const closed=row.chat_status==='closed'||row.article_status==='entregado';
   const pending=row.chat_status==='pending';
   return <li key={row.chat_id}><button type="button" onClick={()=>open(row)} disabled={!!opening}>
    {row.image_url?<img src={row.image_url} alt="" loading="lazy"/>:<span className="user-conversation-placeholder"><MessageCircle size={24}/></span>}
    <span className="user-conversation-copy"><strong>{row.title||'Artículo'}</strong><span>{row.other_name} · {row.mode==='venta'?'Venta':'Rescate'}</span><small>{new Date(row.activity_at).toLocaleDateString('es-CO',{day:'numeric',month:'short',year:'numeric'})}</small></span>
    <span className={`user-conversation-state ${closed?'is-closed':''}`}>{closed?<><LockKeyhole size={13}/>Solo lectura</>:pending?'Pendiente':row.article_status==='en_revision'?'En revisión':'Abierta'}<span>{opening===row.chat_id?'Abriendo…':'Ver chat'}</span></span>
   </button></li>;
  })}</ul>:!error&&<p className="user-conversations-empty"><MessageCircle size={28}/>{onlyOpen?'No tienes chats abiertos. Desmarca el filtro para consultar los demás.':'Aún no tienes conversaciones con otros usuarios.'}</p>}
  {(page>1||data.hasMore)&&<div className="user-conversations-pages"><button type="button" disabled={busy||page===1} onClick={()=>setPage(value=>value-1)} aria-label="Conversaciones anteriores"><ArrowLeft size={16}/></button><span>Página {page}</span><button type="button" disabled={busy||!data.hasMore} onClick={()=>setPage(value=>value+1)} aria-label="Más conversaciones"><ArrowRight size={16}/></button></div>}
 </section>;
}
