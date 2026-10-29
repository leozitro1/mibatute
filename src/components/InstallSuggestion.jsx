import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { INSTALL_DISMISSED_KEY, INSTALLED_MODE, MOBILE_WIDTH, installSuggestionPlatform } from './installSuggestion.js';
import './InstallSuggestion.css';

export default function InstallSuggestion() {
  const [platform, setPlatform] = useState(installSuggestionPlatform);
  const [expanded, setExpanded] = useState(false);
  const instructionsId = useId();
  const dismissed = useRef(false);
  const dismiss = useCallback(() => {
    dismissed.current = true;
    try { window.sessionStorage.setItem(INSTALL_DISMISSED_KEY, '1'); } catch { /* Closing still works without storage. */ }
    setPlatform(null);
  }, []);

  useEffect(() => {
    const queries = [window.matchMedia(MOBILE_WIDTH), window.matchMedia(INSTALLED_MODE)];
    const update = () => { if (!dismissed.current) setPlatform(installSuggestionPlatform()); };
    queries.forEach(query => query.addEventListener('change', update));
    window.addEventListener('appinstalled', dismiss);
    return () => {
      queries.forEach(query => query.removeEventListener('change', update));
      window.removeEventListener('appinstalled', dismiss);
    };
  }, [dismiss]);

  if (!platform) return null;
  return <aside className="install-suggestion" aria-label="Agregar MiBatute a la pantalla de inicio">
    <div className="install-suggestion-row">
      <img src="/logo.png" alt="" width="32" height="32" />
      <p>Agrega MiBatute a tu inicio</p>
      <button type="button" className="install-suggestion-help" aria-expanded={expanded} aria-controls={instructionsId} onClick={() => setExpanded(value => !value)}>
        {expanded ? 'Ocultar pasos' : 'Cómo agregarla'}
      </button>
      <button type="button" className="site-icon-close install-suggestion-close" aria-label="Cerrar sugerencia de instalación" onClick={dismiss}><X size={18} aria-hidden="true" /></button>
    </div>
    <div id={instructionsId} className="install-suggestion-steps" hidden={!expanded}>
      {platform === 'ios' ? <ol>
        <li>En Safari, abre el menú Compartir.</li>
        <li>Toca «Añadir a pantalla de inicio»; puede estar dentro de «Más».</li>
        <li>Si aparece «Abrir como app web», actívalo y toca «Añadir».</li>
      </ol> : <p>Abre el menú ⋮ de tu navegador y elige «Instalar aplicación» o «Añadir a pantalla de inicio». Si no aparece, prueba abrir esta página en Chrome.</p>}
    </div>
  </aside>;
}
