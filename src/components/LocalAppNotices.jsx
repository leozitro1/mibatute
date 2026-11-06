import { createPortal } from 'react-dom';
import { useEffect, useEffectEvent, useRef } from 'react';
import { CheckCheck, HandHeart, MessageCircle, X } from 'lucide-react';
import { LOCAL_NOTICE_TEXT } from './localAppNotices.js';
import './LocalAppNotices.css';

export function LocalNoticeSettings({controller,inline=false}) {
  const {badge,banners,count,support,request,updatePreferences,enableBadge,previewBanner} = controller;
  const content = <div>
      <label><span>Avisos mientras usas la app</span><input type="checkbox" checked={banners} onChange={event => updatePreferences({banners:event.target.checked})} /></label>
      <p>Solicitudes nuevas, aceptaciones y mensajes. Los mensajes muestran una vista previa del texto recibido.</p>
      <div className="local-notice-settings-actions">
        <button type="button" disabled={!banners} onClick={previewBanner}>Probar aviso</button>
        {support.supported && <button type="button" disabled={request?.busy} onClick={() => badge ? updatePreferences({badge:false}) : enableBadge()}>
          {request?.busy ? 'Activando…' : badge ? 'Desactivar contador del ícono' : 'Activar contador del ícono'}
        </button>}
      </div>
      {support.supported ? <>
        <p>{badge ? `${count} grupo${count===1?'':'s'} de avisos pendientes.` : 'El contador se actualiza con los avisos que ya recibe la app.'} {support.needsPermission && 'iPhone pedirá permiso de notificaciones para mostrarlo.'}</p>
      </> : <p>Este navegador no permite modificar el contador del ícono. Puedes usar los avisos dentro de la app.</p>}
      <p>Funcionan mientras la app está activa. Al cerrarla, no llegan avisos nuevos; no activamos envío push.</p>
      {request?.error && <p role="alert">{request.error}</p>}
    </div>;
  return inline ? <div className="local-notice-settings local-notice-settings-inline">{content}</div> :
    <details className="local-notice-settings"><summary>Avisos en este dispositivo</summary>{content}</details>;
}

export function LocalNoticeBanner({notice,onClose,onView}) {
  const panel = useRef(null);
  const close = useEffectEvent(() => onClose());
  useEffect(() => {
    const element = panel.current;
    if (!notice || !element) return;
    let remaining = 8000, started, timer, hovering = false, focused = false;
    const pause = () => {
      clearTimeout(timer);
      if (started != null) remaining = Math.max(0, remaining - (performance.now() - started));
      started = null;
    };
    const resume = () => {
      if (hovering || focused || started != null) return;
      started = performance.now();
      timer = setTimeout(() => close(), remaining);
    };
    const enter = event => { if (event.pointerType === 'touch') return; hovering = true; pause(); };
    const leave = () => { hovering = false; resume(); };
    const focus = () => { focused = true; pause(); };
    const blur = event => { if (element.contains(event.relatedTarget)) return; focused = false; resume(); };
    const escape = event => { if (event.key === 'Escape') close(); };
    element.addEventListener('pointerenter', enter);
    element.addEventListener('pointerleave', leave);
    element.addEventListener('focusin', focus);
    element.addEventListener('focusout', blur);
    element.addEventListener('keydown', escape);
    hovering = element.matches(':hover') && window.matchMedia('(hover: hover)').matches;
    focused = element.contains(document.activeElement);
    resume();
    return () => {
      clearTimeout(timer);
      element.removeEventListener('pointerenter', enter);
      element.removeEventListener('pointerleave', leave);
      element.removeEventListener('focusin', focus);
      element.removeEventListener('focusout', blur);
      element.removeEventListener('keydown', escape);
    };
  }, [notice]);
  if (!notice) return null;
  const accepted = notice.kind === 'accepted', message = notice.kind === 'message';
  const Icon = message ? MessageCircle : accepted ? CheckCheck : HandHeart;
  return createPortal(<aside ref={panel} key={`${notice.uid}:${notice.group}:${notice.at}`} className="local-notice-banner" data-kind={notice.kind} role="status" aria-live="polite" aria-atomic="true">
    <span className="local-notice-icon"><Icon size={22} aria-hidden="true" /></span>
    <div className="local-notice-content">
      <span className="local-notice-eyebrow">MiBatute <span>· Ahora</span></span>
      <strong>{notice.preview ? 'Así se verá un mensaje' : message ? 'Te llegó un mensaje' : accepted ? '¡Tu solicitud fue aceptada!' : 'Alguien está interesado'}</strong>
      {notice.context && <p className="local-notice-context">{notice.context}</p>}
      <p>{notice.body || LOCAL_NOTICE_TEXT[notice.kind]}</p>
    </div>
    <button type="button" className="local-notice-open" aria-label={notice.preview ? 'Abrir notificaciones' : message ? 'Abrir conversación' : 'Abrir solicitud'} onClick={onView} />
    <button type="button" className="local-notice-dismiss" aria-label="Cerrar aviso breve" onClick={onClose}><X size={19} /></button>
  </aside>,document.body);
}
