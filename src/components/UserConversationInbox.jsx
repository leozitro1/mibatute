import {useCallback,useEffect,useId,useRef,useState} from 'react';
import {MessageCircle,RefreshCw,LockKeyhole,ArrowLeft,ArrowRight, CircleHelp} from 'lucide-react';
import {supabase} from '../supabase/supabaseClient';
import {listenMarketSignals} from './marketSignals.js';
import useMobileApp from './useMobileApp.js';
import SaleSafetyButton from './SaleSafetyButton.jsx';
import { USER_CHAT_FILTERS, userChatType } from './userChatType.js';
import ChatRetentionNotice from './ChatRetentionNotice.jsx';
import useChatRetentionClock from './useChatRetentionClock.js';

export default function UserConversationInbox({userId,isActive,onOpenChat,suspended=false}){
 const [page,setPage]=useState(1),[data,setData]=useState({rows:[],hasMore:false}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[opening,setOpening]=useState(null);
 const [onlyOpen,setOnlyOpen]=useState(true);
 const [kind,setKind]=useState('all');
 const mobileApp=useMobileApp(),helpId=useId();
 const selectedKind=kind;
 const [helpOpen,setHelpOpen]=useState(false);
 useEffect(()=>{
  if(!helpOpen)return;
  const timer=setTimeout(()=>setHelpOpen(false),10000);
  return()=>clearTimeout(timer);
 },[helpOpen]);
 const filterKey=JSON.stringify([userId,page,onlyOpen,selectedKind]);
 const sequence=useRef(0),loaded=useRef(null),[revision,setRevision]=useState(0);
 const load=useCallback(async()=>{
  const request=++sequence.current;setBusy(true);setError('');
  try{
   const args={p_page:page,p_open_only:onlyOpen,p_kind:selectedKind};
   const {data:result,error:failure}=await supabase.rpc('profile_chat_history',args);
   if(failure)throw failure;
   if(sequence.current===request){setData({...result,rows:result?.rows||[],hasMore:!!result?.hasMore,key:filterKey});loaded.current=filterKey;}
  }catch{if(sequence.current===request)setError('No se pudieron cargar las conversaciones. Intenta actualizar.');}
  finally{if(sequence.current===request)setBusy(false);}
 },[page,onlyOpen,selectedKind,filterKey]);
 useEffect(()=>{if(isActive&&loaded.current!==filterKey)load();},[isActive,filterKey,load,revision]);
 useEffect(()=>()=>{sequence.current++;},[]);
 useEffect(()=>listenMarketSignals(signal=>{
  if(signal.uid!==userId)return;
  if(signal.kind==='article'&&signal.article?.id){
   setData(previous=>({...previous,rows:signal.action==='DELETE'?previous.rows.filter(row=>row.article_id!==signal.article.id):previous.rows.map(row=>row.article_id===signal.article.id?{...row,title:signal.article.title??row.title,mode:signal.article.mode??row.mode,article_status:signal.article.status??row.article_status}:row)}));
   loaded.current=null;
   if(['entregado','delivered'].includes(signal.article.status))setRevision(value=>value+1);
  }
  if(signal.kind==='chat'&&signal.chat?.id){
   setData(previous=>({...previous,rows:signal.action==='DELETE'?previous.rows.filter(row=>row.chat_id!==signal.chat.id):previous.rows.map(row=>row.chat_id===signal.chat.id?{...row,chat_status:signal.chat.status??row.chat_status,...(['open','pending'].includes(signal.chat.status)&&!['entregado','delivered'].includes(row.article_status)?{deletion_after:null,deletion_held:false}:{})}:row)}));
   loaded.current=null;
   if(signal.action==='INSERT'||signal.chat.status==='closed')setRevision(value=>value+1);
  }
  if(signal.kind==='reconnect'){loaded.current=null;setRevision(value=>value+1);}
 }),[userId]);
 const currentData=data.key===filterKey?data:{rows:[],hasMore:false};
 const waiting=busy||(isActive&&data.key!==filterKey&&!error);
 const rows=currentData.rows.filter(row=>(!onlyOpen||(row.chat_status==='open'&&!['entregado','delivered'].includes(row.article_status)))
  &&(selectedKind==='all'||userChatType(row,userId)?.key===selectedKind));
 const retentionNow=useChatRetentionClock(isActive&&rows.some(row=>row.deletion_after));
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
   <p id={helpId} hidden={mobileApp&&!helpOpen} className={mobileApp?'user-conversations-help':undefined}>Chats de ventas y rescates. Desmarca el filtro para ver también pendientes y cerrados. Los cerrados son de solo lectura y se eliminan 30 días después de su cierre o entrega. Una revisión temporal o solicitud pendiente no inicia ese contador. También pueden desaparecer al eliminar el artículo.</p>
  </div><div className="user-conversations-tools"><label className="user-conversations-open-filter"><input type="checkbox" aria-label="Solo chats abiertos" checked={onlyOpen} onChange={event=>{sequence.current++;loaded.current=null;setOnlyOpen(event.target.checked);setPage(1);}}/>{mobileApp?'Abiertos':'Solo chats abiertos'}</label><button type="button" onClick={load} disabled={busy} title="Actualizar conversaciones" aria-label="Actualizar conversaciones"><RefreshCw size={17} className={busy?'animate-spin':''}/></button></div></div>
  <div className="user-chat-type-filters" role="group" aria-label="Tipo de conversación">
   {USER_CHAT_FILTERS.map(filter=><button key={filter.key} type="button" aria-pressed={selectedKind===filter.key} onClick={()=>{
    if(kind===filter.key)return;
    sequence.current++;loaded.current=null;setError('');setKind(filter.key);setPage(1);
   }}>{filter.label}</button>)}
  </div>
  {suspended&&<p role="status">Durante la suspensión puedes consultar tus conversaciones en modo de solo lectura.</p>}
  {error&&<p role="alert" className="text-red-700">{error}</p>}
  {waiting?<p role="status">Cargando conversaciones…</p>:rows.length? <ul className="user-conversations-list">{rows.map(row=>{
   const closed=suspended||row.chat_status==='closed'||['entregado','delivered'].includes(row.article_status);
   const pending=row.chat_status==='pending';
   const stateLabel=closed?'Solo lectura':pending?'Pendiente':row.article_status==='en_revision'?'En revisión':'Abierta';
   return <li key={row.chat_id} className="user-conversation-card"><button className="user-conversation-main" type="button" onClick={()=>open(row)} disabled={!!opening}>
    {row.image_url?<img src={row.image_url} alt="" loading="lazy"/>:<span className="user-conversation-placeholder"><MessageCircle size={24}/></span>}
    <span className="user-conversation-copy"><strong title={row.title||'Artículo'}>{row.title||'Artículo'}</strong><span>{row.other_name} · {userChatType(row,userId)?.label||'Conversación'}</span><small>{new Date(row.activity_at).toLocaleDateString('es-CO',{day:'numeric',month:'short',year:'numeric'})}<span className="user-conversation-mobile-state"> · {stateLabel}</span></small></span>
   </button><ChatRetentionNotice compact status={{delete_after:row.deletion_after,held:row.deletion_held,cleanup_enabled:row.cleanup_enabled}} now={retentionNow}/>{row.mode==='venta'&&<SaleSafetyButton articleId={row.article_id} chatId={row.chat_id} title={row.title} iconOnly
     onOpenChat={!opening ? ()=>open(row) : undefined} canMarkDelivered={!suspended}
     className="user-conversation-security" onUpdated={result=>{
       loaded.current=null;
       if(result.article||result.chat)setData(previous=>({...previous,rows:previous.rows.map(item=>item.chat_id===row.chat_id
         ?{...item,article_status:result.article?.status??item.article_status,chat_status:result.chat?.status??item.chat_status}:item)}));
     }} />}
    <button type="button" className="user-conversation-status-button" onClick={()=>open(row)} disabled={!!opening} aria-label={`Ver chat: ${row.title||'Artículo'}`}>
      <span className={`user-conversation-state ${closed?'is-closed':''}`}><span className="user-conversation-state-label">{closed&&<LockKeyhole size={13}/>} {stateLabel}</span><span className="user-conversation-open-label">{opening===row.chat_id?'Abriendo…':'Ver chat'}</span></span>
    </button></li>;
  })}</ul>:!error&&<p className="user-conversations-empty"><MessageCircle size={28}/>{selectedKind!=='all'
   ? `No tienes chats${onlyOpen?' abiertos':''} en ${USER_CHAT_FILTERS.find(filter=>filter.key===selectedKind)?.label.toLowerCase()}.${onlyOpen?' Desmarca «Abiertos» para ver también pendientes y cerrados.':''}`
   :onlyOpen?'No tienes chats abiertos. Desmarca el filtro para consultar los demás.':'Aún no tienes conversaciones con otros usuarios.'}</p>}
  {(page>1||currentData.hasMore)&&<div className="user-conversations-pages"><button type="button" disabled={waiting||page===1} onClick={()=>setPage(value=>value-1)} aria-label="Conversaciones anteriores"><ArrowLeft size={16}/></button><span>Página {page}</span><button type="button" disabled={waiting||!currentData.hasMore} onClick={()=>setPage(value=>value+1)} aria-label="Más conversaciones"><ArrowRight size={16}/></button></div>}
 </section>;
}
