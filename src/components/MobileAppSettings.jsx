import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Settings, X, Type, Bell } from 'lucide-react';
import { LocalNoticeSettings } from './LocalAppNotices.jsx';
import './MobileAppSettings.css';

export default function MobileAppSettings({textSize,onTextSize,notices,userId,onLogin,onClose}) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  },[]);
  const controls = {...notices,previewBanner:() => {onClose();notices.previewBanner();}};
  return createPortal(<dialog ref={dialogRef} className="mobile-app-settings-dialog" aria-labelledby="mobile-settings-title"
    onCancel={event => {event.preventDefault();onClose();}}
    onClick={event => {if (event.target === event.currentTarget) onClose();}}>
    <div className="mobile-settings-panel">
      <header><h2 id="mobile-settings-title"><Settings size={22} aria-hidden="true" />Configuración</h2>
        <button type="button" data-mobile-back className="mobile-settings-close" aria-label="Cerrar configuración" onClick={onClose}><X size={22} /></button>
      </header>
      <div className="mobile-settings-content">
        <fieldset>
          <legend><Type size={20} aria-hidden="true" />Tamaño del texto</legend>
          <p>Elige cómo prefieres leer la app en este teléfono.</p>
          <div className="mobile-text-size-options">
            {[['normal','Normal'],['large','Grande'],['largest','Muy grande']].map(([value,label]) =>
              <label key={value} className={textSize === value ? 'is-selected' : ''}>
                <input type="radio" name="mobile-text-size" value={value} checked={textSize === value} onChange={() => onTextSize(value)} />
                <span>{label}</span>
              </label>)}
          </div>
          <p className="mobile-text-example">Así se verá el texto de MiBatute.</p>
          {textSize !== 'normal' && <button type="button" className="mobile-settings-reset" onClick={() => onTextSize('normal')}>Volver al tamaño normal</button>}
        </fieldset>
        <section aria-labelledby="mobile-settings-notifications">
          <h3 id="mobile-settings-notifications"><Bell size={20} aria-hidden="true" />Notificaciones</h3>
          {userId ? <LocalNoticeSettings controller={controls} inline /> : <>
            <p>Inicia sesión para configurar tus avisos y el contador del ícono.</p>
            <button type="button" className="mobile-settings-login" onClick={() => {onClose();onLogin();}}>Iniciar sesión</button>
          </>}
        </section>
        <p className="mobile-settings-device-note">Estas preferencias se guardan en este teléfono.</p>
      </div>
      <footer><button type="button" onClick={onClose}>Listo</button></footer>
    </div>
  </dialog>,document.body);
}
