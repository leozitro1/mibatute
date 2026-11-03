import {useEffect,useRef} from 'react';
import ProductDetail from './ProductDetail.jsx';
import useDetailScroll from './useDetailScroll.js';
import {rescateRequestNotice} from './rescateRequestNotice.js';
import './RescateArticleDetail.css';

export default function RescateArticleDetail({row,user,onClose,actions,busy=false}) {
 const surface=useRef(null);
 useDetailScroll(true);
 useEffect(()=>{
  const previous=document.activeElement;
  surface.current?.focus();
  return()=>{if(previous?.isConnected)previous.focus({preventScroll:true});};
 },[]);
 const notice=rescateRequestNotice(row,user?.id);
 const content=<section className="rescate-request-summary" data-tone={notice.tone} aria-label="Estado de tu solicitud">
  <h3>{notice.title}</h3><p>{notice.body}</p>
  {row.justificacion && <div className="rescate-request-message"><h4>Tu mensaje</h4><p>{row.justificacion}</p></div>}
  {actions}
 </section>;
 return <ProductDetail item={row.articulo} user={user} isOpen onClose={onClose} closeDisabled={busy}
  requestContent={content} surfaceRef={surface} onSurfaceKeyDown={event=>{
   if(event.key==='Escape'&&!busy)onClose();
   if(event.key!=='Tab')return;
   const controls=[...event.currentTarget.querySelectorAll('button:not(:disabled), [href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]')];
   const first=controls[0],last=controls.at(-1);
   if(event.shiftKey&&(document.activeElement===first||document.activeElement===event.currentTarget)){event.preventDefault();last?.focus();}
   else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===event.currentTarget)){event.preventDefault();first?.focus();}
  }}/>;
}
