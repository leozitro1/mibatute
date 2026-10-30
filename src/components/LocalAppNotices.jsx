import { createPortal } from 'react-dom';
import { Bell, X } from 'lucide-react';
import { LOCAL_NOTICE_TEXT } from './localAppNotices.js';
import './LocalAppNotices.css';

export function LocalNoticeSettings({controller}) {
  const {badge,banners,count,support,request,updatePreferences,enableBadge,previewBanner} = controller;
  return <details className="local-notice-settings">
    <summary>Avisos en este dispositivo</summary>
    <div>
      <label><span>Avisos mientras usas la app</span><input type="checkbox" checked={banners} onChange={event => updatePreferences({banners:event.target.checked})} /></label>
      <p>Solicitudes nuevas, aceptaciones y mensajes. Los mensajes muestran una vista previa del texto recibido.</p>
      <button type="button" disabled={!banners} onClick={previewBanner}>Probar aviso</button>
      {support.supported ? <>
        <button type="button" disabled={request?.busy} onClick={() => badge ? updatePreferences({badge:false}) : enableBadge()}>
          {request?.busy ? 'Activando…' : badge ? 'Desactivar contador del ícono' : 'Activar contador del ícono'}
        </button>
        <p>{badge ? `${count} grupo${count===1?'':'s'} de avisos pendientes.` : 'El contador se actualiza con los avisos que ya recibe la app.'} {support.needsPermission && 'iPhone pedirá permiso de notificaciones para mostrarlo.'}</p>
      </> : <p>Este navegador no permite modificar el contador del ícono. Puedes usar los avisos dentro de la app.</p>}
      <p>Funcionan mientras la app está activa. Al cerrarla, no llegan avisos nuevos; no activamos envío push.</p>
      {request?.error && <p role="alert">{request.error}</p>}
    </div>
  </details>;
}

export function LocalNoticeBanner({notice,onClose,onView}) {
  if (!notice) return null;
  return createPortal(<aside key={`${notice.uid}:${notice.group}:${notice.at}`} className="local-notice-banner" role="status" aria-live="polite" aria-atomic="true">
    <Bell size={22} aria-hidden="true" />
    <div>
      <strong>{notice.preview ? 'Mensaje de prueba' : notice.kind === 'message' ? 'Nuevo mensaje' : 'MiBatute'}</strong>
      {notice.context && <p className="local-notice-context">{notice.context}</p>}
      <p>{notice.body || LOCAL_NOTICE_TEXT[notice.kind]}</p>
      <button type="button" onClick={onView}>Ver avisos</button>
    </div>
    <button type="button" className="local-notice-dismiss" aria-label="Cerrar aviso breve" onClick={onClose}><X size={19} /></button>
  </aside>,document.body);
}
