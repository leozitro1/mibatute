import {saleCancellation,donationRejection} from '../supabase/rescatesQuery.js';
import {isPublicationUnavailable} from './articleLifetime.js';

export function rescateRequestNotice(row,userId,now=Date.now()) {
 const article=row?.articulo || {};
 const sale=String(article.mode || article.tipo || '').toLowerCase().includes('venta');
 const status=article.estado || article.status;
 const recipient=article.ganador_id || article.winner_id || article.recipient_id;
 const selected=!!userId && String(recipient || '')===String(userId);
 if(donationRejection(row))return {title:'Solicitud de donación rechazada',body:'El donante no seleccionó esta solicitud. Se retirará de Mis rescates a las 24 horas del rechazo.',tone:'neutral'};
 if(saleCancellation(row))return {title:'Compra cancelada',body:'La reserva fue cancelada. El estado del anuncio puede haber cambiado.',tone:'neutral'};
 if(status==='en_revision')return {title:sale?'Compra en revisión':'Donación en revisión',body:'La publicación está en revisión. Las acciones están temporalmente limitadas.',tone:'neutral'};
 if(status==='entregado')return {title:sale?'Compra completada':selected?'Donación recibida':'Donación finalizada',body:'La entrega ha finalizado. Puedes consultar el historial y calificar cuando corresponda.',tone:'success'};
 if(!sale&&row?._chatStatus==='closed'&&!recipient)return {title:'Reserva de donación cancelada',body:'La reserva anterior terminó. Consulta el estado actual del anuncio.',tone:'neutral'};
 if(sale&&row?._chatStatus==='pending')return {title:'Compra pendiente de aprobación',body:'Tu reserva fue enviada. El vendedor debe aprobar la compra para habilitar el chat.',tone:'pending'};
 if(status==='reservado'&&(sale||selected))return {title:sale?'Compra reservada':'Solicitud de donación aceptada',body:'Coordina la recogida con la otra persona desde el chat.',tone:'success'};
 if(status==='pausado'||isPublicationUnavailable(article,now))return {title:status==='pausado'?'Publicación pausada':'Publicación vencida',body:'Tu solicitud sigue en el historial. Consulta el estado del anuncio antes de coordinar la entrega.',tone:'neutral'};
 return {title:sale?'Solicitud de compra enviada':'Solicitud de donación enviada',body:sale?'Espera la respuesta del vendedor.':'El donante aún no ha elegido a quién entregar el artículo.',tone:'pending'};
}
