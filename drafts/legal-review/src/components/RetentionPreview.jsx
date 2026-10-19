import {useRef,useState} from 'react';
import './RetentionPreview.css';
const labels={chats:'Chats de artículos · 90 días',support:'Soporte cerrado · 180 días',data_requests:'Solicitudes con respuesta final · 24 meses'};
const stamp=value=>new Date(value).toLocaleString('es-CO',{dateStyle:'short',timeStyle:'short',timeZone:'America/Bogota'});
export default function RetentionPreview({client,onActivity,onAccessExpired}){
 const [data,setData]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');const flight=useRef(false);
 const run=async()=>{
  if(flight.current)return;flight.current=true;setBusy(true);setError('');
  try{const result=await client.rpc('preview_retention',{p_limit:20});if(result.error)throw result.error;setData(result.data);onActivity?.();}
  catch(err){setError(err.message||'No se pudo consultar la simulación.');if(err.code==='42501')onAccessExpired?.();}
  finally{flight.current=false;setBusy(false);}
 };
 return <details className="retention-preview"><summary>Simulación de conservación — sin borrar datos</summary>
  <p>Consulta qué registros superarían los plazos propuestos. Este resultado no autoriza eliminarlos ni verifica disputas, fundamento legal, excepciones o respaldos. Se consulta solo al pulsar el botón.</p>
  <button className="support-button" type="button" disabled={busy} onClick={run}>{busy?'Consultando…':'Consultar simulación'}</button>
  {error&&<p role="alert" className="support-error">{error}</p>}
  {data&&<div aria-live="polite"><p>Consulta: {stamp(data.as_of)}. <strong>No se eliminó ni modificó información de usuarios.</strong></p>
   <dl>{Object.entries(labels).map(([key,label])=><div key={key}><dt>{label}</dt><dd>{data.counts[key]||0} superan el plazo · {data.without_event[key]||0} sin evento válido de cierre/finalización</dd></div>)}</dl>
   <p>Se muestran hasta 20 referencias para revisión manual. Los registros sin fecha válida no se consideran vencidos.</p>
   {!!data.sample.length&&<div className="retention-table"><table><thead><tr><th>Tipo</th><th>Referencia</th><th>Fecha base</th><th>Límite propuesto</th></tr></thead><tbody>{data.sample.map(row=><tr key={`${row.category}-${row.id}`}><td>{labels[row.category]}</td><td>{row.id}</td><td>{stamp(row.event_at)}</td><td>{stamp(row.proposed_limit)}</td></tr>)}</tbody></table></div>}
  </div>}
 </details>;
}
