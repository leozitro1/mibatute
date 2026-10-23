import {CREDIT_UNIT_PRICE_COP,formatCOP} from '../config/creditPricing.js';

const SITE = 'https://www.mibatute.com/';
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const content = {
 published: {
  label:'Tu publicación', action:'Ver mi publicación en MiBatute',
  next:'Revisa que las fotos, el estado del artículo y la ubicación sean correctos. Las personas interesadas podrán contactarte desde la plataforma.',
  tip:'Conversa por el chat interno. Comparte teléfono o dirección solo si lo decides y cuando sea necesario para acordar la entrega.',
 },
 request: {
  label:'Alguien está interesado', action:'Revisar la solicitud',
  next:'Entra a MiBatute para revisar la solicitud y conversar con la persona interesada. Este correo no confirma una reserva ni una entrega.',
  tip:'No pagues por liberar una solicitud. Desconfía de enlaces externos y de capturas de transferencias: verifica el dinero directamente en tu banco.',
 },
 sale: {
  label:'Estado de tu operación', action:'Revisar mi operación',
  next:'La operación se marcó como entregada en la plataforma. MiBatute sirve de puente de comunicación; este aviso no certifica el pago, el estado del artículo ni la entrega.',
  tip:'Acuerden la entrega en un lugar seguro. Verifica el artículo y el pago por tus propios medios; no envíes anticipos si no tienes certeza de la operación.',
 },
 suspension: {
  label:'Información sobre tu cuenta', action:'Consultar mi buzón',
  next:'En tu buzón encontrarás el motivo, la duración y cómo solicitar una revisión si consideras que hay un error. No necesitas pagar para pedir esa revisión.',
  tip:'Nadie necesita tu contraseña, códigos de verificación o dinero para revisar una sanción. Accede escribiendo www.mibatute.com en tu navegador.',
 },
 review: {
  label:'Revisión de tu publicación', action:'Consultar el aviso en mi buzón',
  next:'El aviso del equipo explica el motivo y los pasos a seguir. Estar en revisión no confirma un incumplimiento. Mientras se revisa, la publicación no recibe nuevas compras ni postulaciones.',
  tip:'Realiza cualquier aclaración desde MiBatute. No envíes documentos, claves ni pagos a personas que prometan reactivar tu publicación por fuera de la plataforma.',
 },
 credits_purchase: {
  label:'Recarga confirmada', action:'Consultar mis créditos',
  next:'Los créditos de esta compra ya fueron abonados. Puedes utilizarlos para destacar, publicar una venta adicional o realizar una postulación adicional, según las reglas de cada función. Los créditos comprados no vencen.',
  tip:'No vuelvas a pagar para intentar corregir un saldo. Si notas una diferencia, conserva la referencia y consulta al equipo desde tu cuenta; nunca compartas datos de tarjeta ni códigos de verificación.',
 },
 credits_gift: {
  label:'Créditos sin costo para ti', action:'Ver mis créditos',
  next:'Puedes usarlos para destacar una publicación o para otras funciones que requieren créditos, respetando sus límites. Consulta el movimiento y su motivo en tu cuenta. No es una compra ni genera un cobro.',
  tip:'No debes pagar, transferir dinero ni compartir claves para recibir estos créditos. Comprueba siempre tu saldo entrando directamente a MiBatute.',
 },

 deleted: {
  label:'Actualización de tu publicación', action:'Consultar el motivo en mi buzón',
  next:'Consulta el motivo y el detalle en tu buzón. Si consideras que hubo un error, contacta al equipo desde MiBatute para solicitar una revisión.',
  tip:'No pagues a terceros que prometan recuperar tu publicación. MiBatute no te pedirá contraseñas ni códigos de verificación por correo.',
 },
};

// Shared by the delivery worker and preview. No external images, fonts or tracking pixels.
export function renderActivityEmail(item) {
 const design=content[item.kind]||{label:'Actividad de tu cuenta',action:'Entrar a MiBatute',next:'Consulta los detalles dentro de tu cuenta.',tip:'No compartas contraseñas ni códigos de verificación. Entra siempre desde www.mibatute.com.'};
 const title=String(item.title||'Aviso de actividad').replace(/[\r\n]/g,' ').slice(0,160);
 const detail=String(item.detail||'Hay una actualización en tu cuenta.').slice(0,500);
 const subject=`MiBatute · ${title}`;
 const promotion=item.kind==='published'?`Si aún no está destacada, puedes destacar tu publicación por solo ${formatCOP(CREDIT_UNIT_PRICE_COP)} COP (1 crédito al precio individual). Ayudas a darle más visibilidad y a sostener MiBatute. Es opcional y no garantiza una venta ni solicitudes.`:null;
 const warning=['suspension','review','deleted'].includes(item.kind);
 const accent=warning?'#8a5428':'#315e2c';
 const text=`${title}\n\n${detail}\n\n${design.next}${promotion?'\n\n'+promotion:''}\n\n${design.action}: ${SITE}\nAccede con tu cuenta y abre el apartado correspondiente.\n\nTu seguridad primero\n${design.tip}\n\nMiBatute no comparte automáticamente tus datos de contacto con la contraparte. Tú decides qué compartir por el chat.\n\nAviso automático de actividad de MiBatute. Para recibir ayuda, entra en la plataforma y contacta al equipo desde tu buzón. No respondas a este correo.\nwww.mibatute.com`;
 const html=`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHTML(subject)}</title>
<style>@media screen and (max-width:600px){.email-pad{padding:24px 20px!important}.email-title{font-size:25px!important}.email-shell{padding:12px 8px!important}.email-cta{display:block!important;text-align:center!important}}</style></head>
<body style="margin:0;padding:0;background:#f5f7f2;color:#253126;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">
<div style="display:none;font-size:1px;color:#f5f7f2;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${escapeHTML(detail)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7f2"><tr><td class="email-shell" align="center" style="padding:32px 16px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #dfe6d9;border-radius:20px;border-spacing:0">
<tr><td class="email-pad" style="padding:28px 36px;border-bottom:1px solid #e5eadf"><span style="font-size:25px;line-height:32px;font-weight:800;color:#315e2c">MiBatute</span><span style="font-size:11px;color:#596653;padding-left:10px;letter-spacing:1px">BETA</span><div style="font-size:13px;color:#596653;margin-top:4px">Una segunda oportunidad para tus artículos</div></td></tr>
<tr><td class="email-pad" style="padding:32px 36px">
<p style="margin:0 0 12px;font-size:12px;line-height:18px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${accent}">${escapeHTML(design.label)}</p>
<h1 class="email-title" style="margin:0 0 20px;font-size:30px;line-height:1.2;font-weight:700;color:#253126">${escapeHTML(title)}</h1>
<p style="margin:0 0 18px;font-size:16px;line-height:1.7;overflow-wrap:anywhere;word-break:break-word">${escapeHTML(detail)}</p>
<p style="margin:0 0 26px;font-size:15px;line-height:1.7;color:#4b5947">${escapeHTML(design.next)}</p>
${promotion?`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f5ec;border:1px solid #dce7d3;border-radius:12px;margin-bottom:24px"><tr><td style="padding:18px 20px"><p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#315e2c">Dale más visibilidad a tu publicación</p><p style="margin:0;font-size:14px;line-height:1.7;color:#3e5237">${escapeHTML(promotion)}</p></td></tr></table>`:''}
<table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td><a class="email-cta" href="${SITE}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:15px 22px;background:#315e2c;border:1px solid #315e2c;border-radius:10px;color:#ffffff;font-size:15px;line-height:22px;font-weight:700;text-decoration:none">${escapeHTML(design.action)}</a></td></tr></table>
<p style="margin:12px 0 26px;font-size:12px;line-height:18px;color:#596653">Accede con tu cuenta y abre el apartado correspondiente. También puedes escribir <strong>www.mibatute.com</strong> en tu navegador.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff6ec;border:1px solid #eed9bd;border-radius:12px"><tr><td style="padding:18px 20px"><p style="margin:0 0 8px;font-size:14px;line-height:20px;font-weight:700;color:#744517">Tu seguridad primero</p><p style="margin:0;font-size:14px;line-height:1.7;color:#654c32">${escapeHTML(design.tip)}</p></td></tr></table>
<p style="margin:22px 0 0;font-size:13px;line-height:1.7;color:#596653">MiBatute no comparte automáticamente tus datos de contacto con la contraparte. Tú decides qué compartir por el chat.</p>
</td></tr><tr><td class="email-pad" style="padding:22px 36px;border-top:1px solid #e5eadf;background:#fafbf8;border-radius:0 0 20px 20px"><p style="margin:0;font-size:12px;line-height:1.8;color:#596653">Aviso automático de actividad de MiBatute. Para recibir ayuda, entra en la plataforma y contacta al equipo desde tu buzón. No respondas a este correo.</p><p style="margin:10px 0 0;font-size:12px;line-height:18px;color:#315e2c;font-weight:700">www.mibatute.com</p></td></tr>
</table></td></tr></table></body></html>`;
 return {subject,text,html};
}

// Fictitious examples only; never read real accounts to generate a preview.
export const EMAIL_PREVIEWS = [
 {kind:'published',title:'Publicación creada',detail:'Tu publicación «Bicicleta urbana» se creó en MiBatute. Consulta su estado en tu cuenta.'},
 {kind:'request',title:'Nueva solicitud de donación',detail:'Hay una nueva postulación para «Escritorio de madera». Revísala en MiBatute.'},
 {kind:'request',title:'Nueva solicitud de compra',detail:'Hay una nueva solicitud para «Bicicleta urbana». Revísala en MiBatute.'},
 {kind:'sale',title:'Venta finalizada',detail:'La venta de «Bicicleta urbana» se marcó como entregada. Este aviso no acredita un pago ni una entrega verificada por MiBatute.'},
 {kind:'sale',title:'Compra finalizada',detail:'La compra de «Bicicleta urbana» se marcó como entregada. Consulta el detalle en tu cuenta.'},
 {kind:'suspension',title:'Suspensión temporal de tu cuenta',detail:'Ejemplo: tu cuenta tiene una suspensión temporal de 3 días. En el aviso real aparecerá su fecha de finalización, en hora de Colombia. Consulta el motivo y las opciones de revisión en tu buzón de MiBatute.'},
 {kind:'review',title:'Publicación en revisión',detail:'El equipo puso tu publicación en revisión. Consulta el motivo y el detalle en tu buzón de MiBatute.'},
 {kind:'credits_purchase',title:'Compra de créditos confirmada',detail:'Se abonaron 3 créditos a tu cuenta. Total pagado: $7.000 COP. Referencia de ejemplo: MB-EJEMPLO. Revisa tu saldo y el movimiento en MiBatute.'},
 {kind:'credits_gift',title:'Recibiste créditos sin costo',detail:'MiBatute te otorgó 2 créditos de regalo o compensación, sin costo para ti. Consulta el movimiento y el motivo en tu cuenta.'},
 {kind:'deleted',title:'Publicación eliminada',detail:'El equipo eliminó tu publicación después de su revisión. Consulta el motivo y el detalle en tu buzón de MiBatute.'},
];
