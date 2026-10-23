import {useState} from 'react';
import {Monitor,Smartphone,Eye,ChevronDown} from 'lucide-react';
import StyledSelect from '../components/StyledSelect.jsx';
import {EMAIL_PREVIEWS,renderActivityEmail} from '../email/templates.js';

export default function StaffEmailPreview(){
 const [index,setIndex]=useState('0'),[mobile,setMobile]=useState(false),[expanded,setExpanded]=useState(false);
 const item=EMAIL_PREVIEWS[Number(index)]||EMAIL_PREVIEWS[0];
 const email=renderActivityEmail(item);
 return <details className="staff-email-preview" onToggle={event=>setExpanded(event.currentTarget.open)}>
  <summary className="staff-email-preview-toggle"><Eye size={18} aria-hidden="true"/><span>Vista previa de los correos</span><ChevronDown size={18} aria-hidden="true"/></summary>
  {expanded&&<>
  <p>Ejemplos ficticios. Puedes revisarlos aunque el envío esté apagado; no consumen correos de Resend.</p>
  <div className="staff-email-preview-tools">
   <div><label htmlFor="email-preview-event">Correo a revisar</label><StyledSelect id="email-preview-event" aria-label="Correo a revisar" value={index} onChange={event=>setIndex(event.target.value)}>{EMAIL_PREVIEWS.map((preview,position)=><option key={position} value={String(position)}>{preview.title}</option>)}</StyledSelect></div>
   <div className="staff-email-preview-sizes" role="group" aria-label="Ancho de vista previa"><button type="button" className="staff-button" aria-pressed={!mobile} onClick={()=>setMobile(false)}><Monitor size={16}/>Escritorio</button><button type="button" className="staff-button" aria-pressed={mobile} onClick={()=>setMobile(true)}><Smartphone size={16}/>Móvil</button></div>
  </div>
  <p className="staff-email-preview-subject"><strong>Asunto:</strong> {email.subject}</p>
  <div className="staff-email-preview-frame"><iframe title={`Vista previa: ${item.title}`} srcDoc={email.html} sandbox="" referrerPolicy="no-referrer" style={{width:mobile?'375px':'100%'}} /></div>
  <p className="staff-item-detail">Los enlaces están desactivados en esta vista. El correo real abre MiBatute y pide iniciar sesión. El aspecto puede variar en Gmail, Outlook y otras aplicaciones; la recepción real se comprobará cuando autorices una prueba de envío.</p>
  <details><summary>Ver versión de texto sin formato</summary><pre className="staff-email-preview-text">{email.text}</pre></details>
  </>}
 </details>;
}
