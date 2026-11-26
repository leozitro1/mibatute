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
 const isTerms=path==='/terminos';
 const [metrics,setMetrics]=useState(()=>metricsAllowed(localStorage,navigator));
 return <div className="legal-page"><main className="legal-document">
  <Link className="legal-back" to="/">← Volver a MiBatute</Link>
  {!LEGAL_READY&&!isTerms&&<p className="legal-draft" role="status">Borrador para revisión. Hay verificaciones y decisiones pendientes de aprobación. El sitio continúa en pruebas.</p>}
  <h1>{page.title}</h1><p className="legal-version">Versión {LEGAL_VERSION} · Revisión: {LEGAL_DATE}{LEGAL_READY?' · Vigente':''}</p><p>{page.intro}</p>
  <nav className="legal-nav" aria-label="Documentos legales">{LEGAL_LINKS.map(([url,label])=><Link key={url} to={url} aria-current={path===url?'page':undefined}>{label}</Link>)}</nav>
  <LegalOperator/>
  {page.sections.map(([heading,text],i)=><section key={heading}><h2>{i+1}. {heading}</h2><p>{text}</p></section>)}
  {page.retentionMatrix&&<section><h2>Matriz de conservación y eliminación</h2><div className="legal-table-scroll"><table><caption>Plazos máximos por tipo de dato — versión {LEGAL_VERSION}</caption><thead><tr><th scope="col">Tipo de dato</th><th scope="col">Plazo y evento inicial</th><th scope="col">Acción al terminar</th></tr></thead><tbody>{page.retentionMatrix.map(([type,term,action])=><tr key={type}><th scope="row">{type}</th><td>{term}</td><td>{action}</td></tr>)}</tbody></table></div></section>}
  {path==='/cookies'&&<section className="legal-preferences"><h2>Métricas opcionales</h2><p>Estado: <strong>{metrics?'permitidas':'desactivadas'}</strong>. Incluyen estadísticas propias y Google Analytics, que puede usar cookies y recibir datos de navegación y del dispositivo. Puedes rechazar estas métricas y seguir usando la cuenta, las publicaciones y el chat. Si retiras el permiso con Google activo, la página se recargará para detenerlo.</p><div><button type="button" onClick={()=>{saveMetricsPreference(false);setMetrics(false);}}>Rechazar métricas opcionales</button><button type="button" onClick={()=>{saveMetricsPreference(true);setMetrics(metricsAllowed(localStorage,navigator));}}>Permitir métricas opcionales</button></div>{(navigator.doNotTrack==='1'||navigator.globalPrivacyControl===true)&&<p>Tu navegador solicita no hacer seguimiento; las métricas permanecen desactivadas.</p>}</section>}
  {path==='/datos-personales'&&<DataRightsInbox/>}
  <aside className="legal-sources"><h2>Marco de referencia</h2><p><a href="https://www.cancilleria.gov.co/normograma/compilacion/docs/ley_1581_2012.htm" target="_blank" rel="noopener noreferrer">Ley 1581 de 2012</a> · <a href="https://www.cancilleria.gov.co/normograma/compilacion/docs/ley_1480_2011.htm" target="_blank" rel="noopener noreferrer">Estatuto del Consumidor, con sus modificaciones</a>. La identificación de obligaciones y excepciones debe revisarse según la operación real de MiBatute.</p></aside>
  {!LEGAL_READY&&isTerms&&<footer className="legal-draft"><strong>Aviso.</strong> MiBatute sigue en desarrollo y sus Términos y Condiciones están en revisión.</footer>}
 </main><Footer/></div>;
}
