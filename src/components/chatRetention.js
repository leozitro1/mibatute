export const CHAT_RETENTION_DAYS=30;
export function chatRetentionNotice({delete_after,held,cleanup_enabled},now=Date.now()) {
 if(!delete_after)return null;
 const deadline=Date.parse(delete_after);
 if(!Number.isFinite(deadline))return null;
 const date=new Date(deadline).toLocaleString('es-CO',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Bogota'});
 if(held)return {text:'Eliminación aplazada por un reporte en revisión',detail:`La fecha prevista era ${date}. Se conserva el chat mientras se resuelve el caso.`};
 if(!cleanup_enabled)return {text:'Eliminación automática pendiente de activación',detail:`Plazo previsto: ${date}. El borrado automático sigue desactivado en este entorno.`};
 const parts=new Intl.DateTimeFormat('es-CO',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'America/Bogota'}).formatToParts(new Date(deadline));
 const part=type=>parts.find(item=>item.type===type).value;
 const months=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
 const day=`${part('day')} ${months[Number(part('month'))-1]} ${part('year')}`;
 return {text:`Se elimina el ${day}`,
  detail:deadline<=now?`El plazo venció el ${date}. El chat y sus mensajes están pendientes de la siguiente limpieza. No se elimina la publicación.`
   :`El chat y sus mensajes se eliminarán a partir del ${date}, en la siguiente limpieza. No se elimina la publicación.`};
}
