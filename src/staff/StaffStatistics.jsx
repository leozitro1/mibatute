import StyledSelect from "../components/StyledSelect.jsx";
import { createElement,useEffect,useRef,useState } from 'react';
import { RefreshCw,Search,Eye,ShoppingBag,Gift,Package,MapPin,Tag,TrendingUp } from 'lucide-react';
import { staffRpc } from './staffClient.js';
import useLocations from "../data/useLocations.js";
import { ARTICLE_CATEGORIES } from './moderation.js';
import './StaffStatistics.css';

const number=value=>new Intl.NumberFormat('es-CO').format(value??0);
const date=value=>new Date(value).toLocaleDateString('es-CO',{timeZone:'America/Bogota',day:'numeric',month:'short',year:'numeric'});
const series={searches:'Búsquedas',views:'Fichas abiertas',sales:'Ventas entregadas'};

function Ranking({title,icon,rows,secondary}) {
  const max=Math.max(1,...rows.map(row=>Number(row.value)));
  return <section className="staff-stat-ranking"><h2>{createElement(icon,{size:17,'aria-hidden':true})}{title}</h2>
    {!rows.length?<p className="staff-stat-empty">Sin datos para estos filtros.</p>:<ol>{rows.map((row,index)=><li key={row.id||`${row.city||''}:${row.label}`}>
      <span className="staff-stat-position">{index+1}</span><div className="staff-stat-rank-name"><span>{row.label}</span>
        {secondary&&<small>{secondary(row)}</small>}<div className="staff-stat-meter" aria-hidden="true"><i style={{width:`${Number(row.value)/max*100}%`}} /></div></div>
      <strong>{number(row.value)}</strong></li>)}</ol>}
  </section>;
}

export default function StaffStatistics({revision,onReady,onAccessExpired}) {
  const { COLOMBIA_DATA } = useLocations();
  const [filters,setFilters]=useState({days:30,city:'',locality:'',category:''});
  const [refresh,setRefresh]=useState(0),[metric,setMetric]=useState('searches');
  const [result,setResult]=useState(null),[busy,setBusy]=useState(true),[error,setError]=useState('');
  const cache=useRef(new Map());
  const key=JSON.stringify([filters,revision,refresh]);
  const data=result?.key===key?result.data:null;
  useEffect(()=>{
    let active=true;
    const timer=setTimeout(()=>{
      const previous=cache.current.get(key);
      let promise=previous?.promise;
      if(!promise||previous.expires<Date.now()){
        promise=staffRpc('staff_market_dashboard',{p_days:filters.days,p_city:filters.city,p_locality:filters.locality,p_category:filters.category});
        cache.current.set(key,{promise,expires:Date.now()+60_000});
        if(cache.current.size>10)cache.current.delete(cache.current.keys().next().value);
      }
      promise.then(value=>{if(active){setResult({key,data:value});setBusy(false);onReady();}})
        .catch(err=>{cache.current.delete(key);if(active){setError(err.message);setBusy(false);if(err.code==='42501')onAccessExpired('Acceso no autorizado.');}});
    },250);
    return()=>{active=false;clearTimeout(timer);};
  },[key,filters,revision,refresh,onReady,onAccessExpired]);
  const change=(name,value)=>{setBusy(true);setError('');setFilters(previous=>({...previous,[name]:value,...(name==='city'?{locality:''}:{})}));};
  const trend=data?.trend||[],max=Math.max(1,...trend.map(row=>Number(row[metric])));
  const points=trend.map((row,index)=>`${40+index/Math.max(1,trend.length-1)*920},${190-Number(row[metric])/max*160}`).join(' ');
  const totals=data?.totals;
  const indicators=[['Búsquedas',totals?.searches,Search],['Fichas abiertas',totals?.views,Eye],['Ventas entregadas',totals?.sales,ShoppingBag],
    ['Donaciones entregadas',totals?.donations,Gift],['Publicaciones creadas',totals?.publications,Package],['Búsquedas sin resultados',totals?.no_results,Search]];
  return <section className="staff-statistics" aria-label="Estadísticas de MiBatute" aria-busy={busy}>
    <div className="staff-filters">
      <div><label htmlFor="stats-period">Período</label><select id="stats-period" value={filters.days} onChange={event=>change('days',Number(event.target.value))}>
        <option value={7}>Últimos 7 días</option><option value={30}>Últimos 30 días</option><option value={90}>Últimos 90 días</option></select></div>
      <div><label htmlFor="stats-city">Ciudad</label><StyledSelect id="stats-city" value={filters.city} onChange={event=>change('city',event.target.value)}><option value="">Todas las ciudades</option>{COLOMBIA_DATA.map(item=><option key={item.city}>{item.city}</option>)}</StyledSelect></div>
      <div><label htmlFor="stats-locality">Localidad</label><select id="stats-locality" value={filters.locality} disabled={!filters.city} onChange={event=>change('locality',event.target.value)}><option value="">Todas las localidades</option>{(COLOMBIA_DATA.find(item=>item.city===filters.city)?.localities||[]).map(item=><option key={item}>{item}</option>)}</select></div>
      <div><label htmlFor="stats-category">Categoría</label><select id="stats-category" value={filters.category} onChange={event=>change('category',event.target.value)}><option value="">Todas las categorías</option>{ARTICLE_CATEGORIES.map(item=><option key={item}>{item}</option>)}</select></div>
      <button type="button" className="staff-icon-button" title="Actualizar estadísticas" aria-label="Actualizar estadísticas" disabled={busy} onClick={()=>{setBusy(true);setError('');setRefresh(value=>value+1);}}><RefreshCw size={17} /></button>
    </div>
    {error&&<p className="staff-error" role="alert">{error}</p>}
    {busy&&<p role="status" className="staff-item-detail">Consultando estadísticas...</p>}
    <dl className="staff-stat-totals">{indicators.map(([label,value,icon])=><div key={label}><dt>{createElement(icon,{size:16,'aria-hidden':true})}{label}</dt><dd>{value===undefined?'—':number(value)}</dd></div>)}</dl>
    {data&&<>
      <section className="staff-stat-trend"><div className="staff-stat-chart-heading"><h2><TrendingUp size={17} aria-hidden="true" />Actividad por día</h2>
        <div className="staff-stat-tabs" role="group" aria-label="Métrica de la gráfica">{Object.entries(series).map(([id,label])=><button type="button" key={id} aria-pressed={metric===id} onClick={()=>setMetric(id)}>{label}</button>)}</div></div>
        <div className="staff-stat-plot"><div className="staff-stat-axis" aria-hidden="true"><span>{number(max)}</span><span>{number(Math.round(max/2))}</span><span>0</span></div>
          <svg className="staff-stat-chart" viewBox="40 26 920 168" preserveAspectRatio="none" role="img" aria-label={`${series[metric]} por día. Total: ${number(trend.reduce((sum,row)=>sum+Number(row[metric]),0))}`}>
            <title>{series[metric]} por día</title>{[0,.5,1].map(value=><line key={value} x1="40" x2="960" y1={190-value*160} y2={190-value*160} stroke="#e4e9e6" vectorEffect="non-scaling-stroke" />)}
            <polyline points={points} fill="none" stroke={metric==='sales'?'#bd5c36':metric==='views'?'#28749a':'#26734d'} strokeWidth="3" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
        </div><div className="staff-stat-range"><span>{date(`${trend[0]?.day}T12:00:00Z`)}</span><span>{date(`${trend.at(-1)?.day}T12:00:00Z`)}</span></div>
        <details className="staff-stat-daily"><summary>Detalle diario</summary><div><table><thead><tr><th>Fecha</th><th>Búsquedas</th><th>Fichas</th><th>Ventas</th></tr></thead><tbody>{trend.map(row=><tr key={row.day}><td>{date(`${row.day}T12:00:00Z`)}</td><td>{number(row.searches)}</td><td>{number(row.views)}</td><td>{number(row.sales)}</td></tr>)}</tbody></table></div></details>
      </section>
      <div className="staff-stat-rankings">
        <Ranking title="Lo más buscado" icon={Search} rows={data.searches} secondary={row=>row.no_results?`${number(row.no_results)} sin resultados`:''} />
        <Ranking title="Localidades más consultadas" icon={MapPin} rows={data.localities} secondary={row=>row.city} />
        <Ranking title="Artículos más vistos" icon={Eye} rows={data.articles} secondary={row=>row.deleted?'Publicación eliminada':''} />
        <Ranking title="Usuarios con más ventas" icon={ShoppingBag} rows={data.sellers} secondary={()=>'Ventas entregadas en el período'} />
        <Ranking title="Categorías más consultadas" icon={Tag} rows={data.categories} />
      </div>
      <footer className="staff-stat-notes"><p>Medición de búsquedas y vistas desde el {date(data.started_at)} · Hora de Colombia.</p>
        <p>{number(totals.consultations)} consultas al catálogo, incluidos filtros sin palabras de búsqueda. Ventas y donaciones según entrega registrada en la plataforma.</p>
        {Number(totals.undated_sales)>0&&<p>{number(totals.undated_sales)} ventas antiguas sin fecha de entrega no se incluyen en los períodos.</p>}
        <p>Actividad orientativa, sin identificar visitantes. Respeta las preferencias de no seguimiento.</p></footer>
    </>}
  </section>;
}
