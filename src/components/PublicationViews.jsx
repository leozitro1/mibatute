import {Eye} from 'lucide-react';
export default function PublicationViews({article}){
 const count=Number(article?.article_view_totals?.view_count||0);
 return <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-medium text-gray-500" title="Aperturas del detalle. Excluye visitas propias y de administradores; no son personas únicas."><Eye size={13} aria-hidden="true"/>{new Intl.NumberFormat('es-CO').format(count)} {count===1?'vista':'vistas'}</span>;
}
