import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Mail, Plus, RefreshCw, Send, Trash2 } from 'lucide-react';
import { supabase } from '../supabase/supabaseClient';
import { SUPPORT_NOTICE_EVENT } from './supportSignals.js';
import './SupportInbox.css';

const date=value=>new Date(value).toLocaleString('es-CO',{dateStyle:'short',timeStyle:'short',timeZone:'America/Bogota'});
const newList={rows:[],total:0,page:1,pages:1,next_thread_at:null};

export default function SupportInbox({client=supabase,isStaff=false,isActive=true,userId,query='',revision=0,targetThreadId=null,targetVersion=null,onSeen,onRemoved,onActivity,onAccessExpired}) {
  const [list,setList]=useState(newList),[pageSelection,setPageSelection]=useState({query,page:1}),[refresh,setRefresh]=useState(0),[threadRefresh,setThreadRefresh]=useState(0);
  const page=pageSelection.query===query?pageSelection.page:1;
  const setPage=value=>setPageSelection({query,page:value});
  const [deleteTarget,setDeleteTarget]=useState(null);
  const [activeId,setActiveId]=useState(null),[thread,setThread]=useState(null),[composing,setComposing]=useState(false);
  const [subject,setSubject]=useState(''),[body,setBody]=useState(''),[reply,setReply]=useState('');
  const [loading,setLoading]=useState(false),[threadLoading,setThreadLoading]=useState(false),[sending,setSending]=useState(false),[error,setError]=useState('');
  const [ready,setReady]=useState(!isStaff),[,tick]=useState(0);
  const callbacks=useRef({onSeen,onRemoved,onActivity,onAccessExpired});callbacks.current={onSeen,onRemoved,onActivity,onAccessExpired};
  const alive=useRef(false),listVersion=useRef(0),threadVersion=useRef(0),inFlight=useRef(false),request=useRef(null),drafts=useRef(new Map());
  const selected=useRef(null);selected.current=activeId;
  const invalidate=useCallback((threadId=null)=>{setRefresh(value=>value+1);if(!threadId||selected.current===threadId)setThreadRefresh(value=>value+1);},[]);
  const report=useCallback(err=>{if(!alive.current)return;setError(err.message||'No se pudo completar la operación.');if(isStaff&&err.code==='42501')callbacks.current.onAccessExpired?.();},[isStaff]);
  const rpc=useCallback(async(name,args)=>{const result=await client.rpc(name,args);if(result.error)throw result.error;if(alive.current)callbacks.current.onActivity?.();return result.data;},[client]);
  useEffect(()=>{const listCounter=listVersion,threadCounter=threadVersion;alive.current=true;return()=>{alive.current=false;listCounter.current++;threadCounter.current++;};},[]);

  useEffect(()=>{
    if(!isActive)return;
    if(!isStaff){
      let dirty=false;
      const notice=event=>{if(event.detail?.removed&&selected.current===event.detail.threadId){setActiveId(null);setThread(null);drafts.current.delete(event.detail.threadId);}if(inFlight.current)return;if(document.visibilityState==='visible')invalidate(event.detail?.threadId);else dirty=true;};
      const visible=()=>{if(dirty&&document.visibilityState==='visible'){dirty=false;invalidate();}};
      window.addEventListener(SUPPORT_NOTICE_EVENT,notice);document.addEventListener('visibilitychange',visible);
      return()=>{window.removeEventListener(SUPPORT_NOTICE_EVENT,notice);document.removeEventListener('visibilitychange',visible);};
    }
    let disposed=false,channel,joined=false,fallbackRan=false,dirty=false;
    const changed=event=>{if(inFlight.current)return;if(document.visibilityState==='visible')invalidate(event?.payload?.thread_id);else dirty=true;};
    const visible=()=>{if(dirty&&document.visibilityState==='visible'){dirty=false;invalidate();}};
    const fallback=setTimeout(()=>{fallbackRan=true;if(!disposed)setReady(true);},1500);
    document.addEventListener('visibilitychange',visible);
    Promise.resolve(client.realtime.setAuth()).then(()=>{
      if(disposed)return;
      channel=client.channel('mb:support:staff',{config:{private:true}}).on('broadcast',{event:'support_changed'},changed)
        .subscribe(status=>{if(status==='SUBSCRIBED'&&!disposed){clearTimeout(fallback);if(joined||fallbackRan)changed();else setReady(true);joined=true;}});
    }).catch(()=>{if(!disposed)setReady(true);});
    return()=>{disposed=true;clearTimeout(fallback);document.removeEventListener('visibilitychange',visible);if(channel)client.removeChannel(channel);};
  },[client,isStaff,isActive,invalidate]);

  useEffect(()=>{
    if(!ready||!isActive)return;
    const version=++listVersion.current;setLoading(true);
    rpc('support_inbox',{p_staff:isStaff,p_search:query,p_page:page}).then(data=>{
      if(alive.current&&version===listVersion.current){setList(data);}
    }).catch(err=>{if(version===listVersion.current)report(err);}).finally(()=>{if(alive.current&&version===listVersion.current)setLoading(false);});
  },[rpc,isStaff,query,page,refresh,revision,ready,isActive,report]);

  useEffect(()=>{
    if(!isActive){threadVersion.current++;return;}
    if(!activeId){threadVersion.current++;setThread(null);return;}
    const version=++threadVersion.current;setThreadLoading(true);
    rpc('support_thread',{p_thread:activeId,p_staff:isStaff,p_before:null}).then(data=>{
      if(!alive.current||version!==threadVersion.current)return;
      setThread(data);setList(old=>({...old,rows:old.rows.map(row=>row.id===activeId?{...row,unread:false}:row)}));
      if(!isStaff)callbacks.current.onSeen?.(data.id,data.last_staff_at);
    }).catch(err=>{if(version===threadVersion.current){if(!isStaff&&err.code==='42501'){setActiveId(null);setThread(null);}report(err);}}).finally(()=>{if(alive.current&&version===threadVersion.current)setThreadLoading(false);});
  },[activeId,rpc,isStaff,threadRefresh,revision,isActive,report]);

  useEffect(()=>{if(targetThreadId){setActiveId(targetThreadId);setComposing(false);setReply(drafts.current.get(targetThreadId)||'');}},[targetThreadId,targetVersion]);
  const deadline=Date.parse(list.next_thread_at||'');
  const canStart=!Number.isFinite(deadline)||deadline<=Date.now();
  useEffect(()=>{
    if(canStart)return;
    const timer=setTimeout(()=>tick(value=>value+1),Math.min(2147483647,Math.max(50,deadline-Date.now()+50)));
    return()=>clearTimeout(timer);
  },[deadline,canStart]);

  const select=row=>{if(sending)return;setDeleteTarget(null);setActiveId(row.id);setThread(null);setReply(drafts.current.get(row.id)||'');setComposing(false);setError('');};
  const send=async event=>{
    event.preventDefault();if(inFlight.current)return;
    const text=(composing?body:reply).trim();if(!text||text.length>500||(!composing&&!activeId))return;
    const signature=JSON.stringify([composing?subject.trim():activeId,text]);
    if(request.current?.signature!==signature)request.current={signature,id:crypto.randomUUID()};
    inFlight.current=true;setSending(true);setError('');
    try{
      const threadId=composing?await rpc('support_start_thread',{p_request:request.current.id,p_subject:subject.trim(),p_body:text}):activeId;
      if(!composing)await rpc('support_reply',{p_thread:activeId,p_request:request.current.id,p_body:text,p_staff:isStaff});
      if(!alive.current)return;
      if(composing){setSubject('');setBody('');setComposing(false);setActiveId(threadId);}
      else{setReply('');drafts.current.delete(activeId);}
      request.current=null;
    }catch(err){report(err);}finally{inFlight.current=false;if(alive.current){setSending(false);invalidate();}}
  };
  const remove=async id=>{
    if(isStaff||inFlight.current)return;
    if(deleteTarget!==id)return;
    inFlight.current=true;setSending(true);setError('');
    try{
      await rpc('support_hide_thread',{p_thread:id});
      if(!alive.current)return;
      listVersion.current++;threadVersion.current++;
      drafts.current.delete(id);if(selected.current===id){setActiveId(null);setThread(null);setReply('');}
      setList(old=>({...old,rows:old.rows.filter(row=>row.id!==id)}));
      setDeleteTarget(null);callbacks.current.onRemoved?.(id);
    }catch(err){report(err);}finally{inFlight.current=false;if(alive.current){setSending(false);invalidate();}}
  };
  const older=async()=>{
    if(!thread?.messages?.length||threadLoading)return;
    const id=thread.id,version=threadVersion.current;setThreadLoading(true);
    try{
      const data=await rpc('support_thread',{p_thread:id,p_staff:isStaff,p_before:thread.messages[0].seq});
      if(alive.current&&version===threadVersion.current&&selected.current===id)setThread(old=>({...old,messages:[...data.messages,...old.messages],more:data.more}));
    }catch(err){report(err);}finally{if(alive.current&&version===threadVersion.current)setThreadLoading(false);}
  };
  const deletePrompt=<div className="support-delete-prompt" role="group" aria-label="Confirmar eliminación de conversación">
    <p>Se eliminará de tu buzón. El equipo de MiBatute conservará el historial.</p>
    <div className="support-actions"><button type="button" className="support-button" disabled={sending} onClick={()=>setDeleteTarget(null)}>Cancelar</button><button type="button" className="support-button support-delete" disabled={sending} onClick={()=>remove(deleteTarget)}><Trash2 size={16} />{sending?'Eliminando…':'Confirmar eliminación'}</button></div>
  </div>;
  return <section className={`support-inbox ${isStaff?'support-inbox--staff':''}`} aria-label={isStaff?'Buzón de soporte':'Conversaciones con MiBatute'}>
    <div className="support-heading"><div><h2>{isStaff?'Mensajes de usuarios':'Contacta a MiBatute'}</h2><p>{isStaff?'Admin y superadmin comparten estas conversaciones.':'Una conversación nueva cada 24 horas. Puedes responder en los hilos existentes.'}</p></div>
      <button type="button" className="support-icon-button" onClick={()=>invalidate()} disabled={loading||sending} aria-label="Actualizar conversaciones" title="Actualizar conversaciones"><RefreshCw size={17} /></button>
    </div>
    {!isStaff&&<><button type="button" className="support-button support-button--primary" disabled={!canStart||sending||loading} onClick={()=>{setComposing(true);setActiveId(null);setError('');}}><Plus size={16} />Enviar mensaje a MiBatute</button>
      {!canStart&&<p className="support-hint">Puedes iniciar otra conversación el {date(list.next_thread_at)}. Tus respuestas siguen disponibles.</p>}</>}
    {error&&<p role="alert" className="support-error">{error}</p>}
    {composing?<form className="support-compose" onSubmit={send}>
      <label htmlFor={`support-subject-${userId}`}>Asunto</label><input id={`support-subject-${userId}`} required minLength={3} maxLength={120} value={subject} onChange={event=>setSubject(event.target.value)} disabled={sending} />
      <label htmlFor={`support-body-${userId}`}>¿En qué podemos ayudarte?</label><textarea id={`support-body-${userId}`} rows={5} required minLength={10} maxLength={500} value={body} onChange={event=>setBody(event.target.value)} disabled={sending} />
      <p className="support-hint">Tu mensaje será privado y lo podrá atender el equipo de administración.</p>
      <div className="support-actions"><button type="button" className="support-button" disabled={sending} onClick={()=>setComposing(false)}>Cancelar</button><button type="submit" className="support-button support-button--primary" disabled={sending||subject.trim().length<3||body.trim().length<10||!canStart}><Send size={16} />{sending?'Enviando…':'Enviar mensaje'}</button></div>
    </form>:activeId?<div className="support-thread">
      <div className="support-thread-toolbar"><button type="button" className="support-back" disabled={sending} onClick={()=>{setActiveId(null);setError('');}}><ArrowLeft size={16} />Todas las conversaciones</button>
        {!isStaff&&thread&&<button type="button" className="support-button support-delete" disabled={sending||threadLoading} onClick={()=>setDeleteTarget(activeId)}><Trash2 size={16} />Eliminar conversación</button>}
      </div>
      {deleteTarget===activeId&&deletePrompt}
      <h3>{thread?.subject||'Cargando conversación…'}</h3>{isStaff&&thread?.user_name&&<p className="support-hint">{thread.user_name}</p>}
      {threadLoading&&!thread&&<p role="status">Cargando mensajes…</p>}
      {thread?.more&&<button type="button" className="support-button" onClick={older} disabled={threadLoading}>Ver mensajes anteriores</button>}
      <div className="support-messages" role="log" aria-label="Mensajes de la conversación">
        {(thread?.messages||[]).map(message=><article key={message.seq} className={`support-message support-message--${message.author_role==='user'?'user':'staff'}`}>
          <div><strong>{message.author_name}</strong><time dateTime={message.created_at}>{date(message.created_at)}</time></div><p>{message.body}</p>
        </article>)}
      </div>
      {thread?.user_hidden_at&&isStaff&&<p className="support-hint">Eliminada por el usuario. El historial completo se conserva para administración.</p>}
      {thread&&!thread.user_hidden_at&&<form className="support-compose" onSubmit={send}>
        <label htmlFor={`support-reply-${userId}`}>Responder</label><textarea id={`support-reply-${userId}`} rows={3} maxLength={500} required value={reply} onChange={event=>{setReply(event.target.value);drafts.current.set(activeId,event.target.value);}} disabled={sending} />
        <div className="support-actions"><span className="support-hint">{reply.length}/500</span><button type="submit" className="support-button support-button--primary" disabled={sending||!reply.trim()}><Send size={16} />{sending?'Enviando…':'Responder'}</button></div>
      </form>}
    </div>:<>
      {loading&&!list.rows.length?<p role="status">Cargando conversaciones…</p>:!list.rows.length?<p className="support-empty"><Mail size={22} />{isStaff?'No hay conversaciones con ese filtro.':'Aquí aparecerán tus conversaciones con MiBatute.'}</p>:<div className="support-list">
        {list.rows.map(row=><div key={row.id} className="support-list-row"><button type="button" className="support-list-item" onClick={()=>select(row)}>
          <div><strong>{row.subject}</strong>{row.unread&&<span className="support-unread">Sin leer</span>}</div>
          <p>{isStaff?`${row.user_name}${row.user_hidden_at?' · Eliminada por el usuario':''}`:row.last_author==='staff'?'Respuesta de MiBatute':'Mensaje enviado a MiBatute'}</p><time dateTime={row.updated_at}>{date(row.updated_at)}</time>
        </button>{!isStaff&&<button type="button" className="support-icon-button support-delete" disabled={sending} aria-label={`Eliminar conversación: ${row.subject}`} title="Eliminar conversación" onClick={()=>setDeleteTarget(row.id)}><Trash2 size={16} /></button>}{deleteTarget===row.id&&deletePrompt}</div>)}
      </div>}
      {list.pages>1&&<nav className="support-pagination" aria-label="Páginas de conversaciones"><button type="button" className="support-icon-button" disabled={loading||list.page<=1} onClick={()=>setPage(list.page-1)} aria-label="Conversaciones anteriores"><ChevronLeft size={17} /></button><span>{list.page} de {list.pages}</span><button type="button" className="support-icon-button" disabled={loading||list.page>=list.pages} onClick={()=>setPage(list.page+1)} aria-label="Conversaciones siguientes"><ChevronRight size={17} /></button></nav>}
    </>}
  </section>;
}
