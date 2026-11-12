import {useState} from 'react';
import {Link} from 'react-router-dom';
import Footer from '../components/Footer.jsx';
import DataRightsInbox from '../components/DataRightsInbox.jsx';
import {LEGAL_DATE,LEGAL_VERSION,LEGAL_READY,LEGAL_LINKS} from '../legal/config.js';
import LegalOperator from '../components/LegalOperator.jsx';
import {policies} from '../legal/policies.js';
import {metricsAllowed,saveMetricsPreference} from '../legal/preferences.js';
import './LegalPage.css';

export default function LegalPage({path='/terminos'}){
 const page=policies[path]||{title:'Solicitudes de datos personales',intro:'Consulta cómo solicitar acceso, corrección o supresión de tus datos por el canal de atención.',sections:[]};
 const [metrics,setMetrics]=useState(()=>metricsAllowed(localStorage,navigator));
 return <div className="legal-page"><main className="legal-document">
  <Link className="legal-back" to="/">← Volver a MiBatute</Link>
  {!LEGAL_READY&&<p className="legal-draft" role="status">Borrador para revisión. Hay verificaciones y decisiones pendientes de aprobación. El sitio continúa en pruebas.</p>}
  <h1>{page.title}</h1><p className="legal-version">Versión {LEGAL_VERSION} · Revisión: {LEGAL_DATE}{LEGAL_READY?' · Vigente':' · Pendiente de aprobación'}</p><p>{page.intro}</p>
  <nav className="legal-nav" aria-label="Documentos legales">{LEGAL_LINKS.map(([url,label])=><Link key={url} to={url} aria-current={path===url?'page':undefined}>{label}</Link>)}</nav>
  <LegalOperator/>
  {!LEGAL_READY&&<aside className="legal-notice"><h2>Pendientes para la versión definitiva</h2><ul>
   <li>Recibir la copia del acuerdo de ImageKit, confirmar el alcance del acuerdo de Cloudflare y documentar los países de tratamiento, los subencargados y las medidas de seguridad aplicables.</li>
   <li>Validar los plazos de conservación restantes, completar la supresión de cuentas con registros asociados y definir cómo reaplicar las supresiones tras restaurar respaldos.</li>
   <li>Completar la revisión jurídica y publicar una nueva versión definitiva con aceptación expresa.</li>
  </ul>
   <p><strong>Registro de oferentes.</strong> El formulario voluntario está disponible en Mi perfil. Las solicitudes de identificación se reciben por soporte. Sigue pendiente completar la transición de los anuncios existentes.</p>
   <p><strong>Antes de habilitar recargas pagadas.</strong> Completar la revisión de Wompi y del proceso de devoluciones.</p>
  </aside>}
  {page.sections.map(([heading,text],i)=><section key={heading}><h2>{i+1}. {heading}</h2><p>{text}</p></section>)}
  {page.retentionMatrix&&<section><h2>Matriz de conservación y eliminación</h2><div className="legal-table-scroll"><table><caption>Plazos máximos por tipo de dato — versión {LEGAL_VERSION}</caption><thead><tr><th scope="col">Tipo de dato</th><th scope="col">Plazo y evento inicial</th><th scope="col">Acción al terminar</th></tr></thead><tbody>{page.retentionMatrix.map(([type,term,action])=><tr key={type}><th scope="row">{type}</th><td>{term}</td><td>{action}</td></tr>)}</tbody></table></div></section>}
  {path==='/cookies'&&<section className="legal-preferences"><h2>Métricas opcionales</h2><p>Estado: <strong>{metrics?'permitidas':'desactivadas'}</strong>. Puedes cambiar tu elección sin afectar la cuenta, las publicaciones o el chat.</p><div><button type="button" onClick={()=>{saveMetricsPreference(false);setMetrics(false);}}>Rechazar métricas opcionales</button><button type="button" onClick={()=>{saveMetricsPreference(true);setMetrics(metricsAllowed(localStorage,navigator));}}>Permitir métricas opcionales</button></div>{(navigator.doNotTrack==='1'||navigator.globalPrivacyControl===true)&&<p>Tu navegador solicita no hacer seguimiento; las métricas permanecen desactivadas.</p>}</section>}
  {path==='/datos-personales'&&<DataRightsInbox/>}
  <aside className="legal-sources"><h2>Marco de referencia</h2><p><a href="https://www.cancilleria.gov.co/normograma/compilacion/docs/ley_1581_2012.htm" target="_blank" rel="noopener noreferrer">Ley 1581 de 2012</a> · <a href="https://www.cancilleria.gov.co/normograma/compilacion/docs/ley_1480_2011.htm" target="_blank" rel="noopener noreferrer">Estatuto del Consumidor, con sus modificaciones</a>. La identificación de obligaciones y excepciones debe revisarse según la operación real de MiBatute.</p></aside>
 </main><Footer/></div>;
}
