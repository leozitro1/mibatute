import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { X, Share, SquarePlus, Ellipsis, EllipsisVertical, Compass, Chrome, Check } from 'lucide-react';
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
      <div className="install-suggestion-copy"><p>Prueba la versión móvil</p><span>Como una app, sin descargar nada.</span></div>
      <button type="button" className="install-suggestion-help" aria-expanded={expanded} aria-controls={instructionsId} onClick={() => setExpanded(value => !value)}>
        {expanded ? 'Ocultar pasos' : 'Cómo agregarla'}
      </button>
      <button type="button" className="site-icon-close install-suggestion-close" aria-label="Cerrar sugerencia de instalación" onClick={dismiss}><X size={18} aria-hidden="true" /></button>
    </div>
    <div id={instructionsId} className="install-suggestion-steps" hidden={!expanded}>
      <div className="install-suggestion-platform">{platform === 'ios' ? <Compass size={20} aria-hidden="true" /> : <Chrome size={20} aria-hidden="true" />}<strong>{platform === 'ios' ? 'En iPhone o iPad · Safari' : 'En Android · Chrome'}</strong></div>
      <p className="install-suggestion-browser">Abre esta página en {platform === 'ios' ? 'Safari' : 'Chrome'} y sigue estos pasos:</p>
      {platform === 'ios' ? <ol>
        <li><span className="install-step-icon"><Share size={21} aria-hidden="true" /></span><div><strong>1. Toca Compartir</strong><p>Busca el cuadrado con la flecha hacia arriba. Si no lo ves, abre primero Más <Ellipsis size={17} aria-hidden="true" /> en el menú de Safari.</p></div></li>
        <li><span className="install-step-icon"><SquarePlus size={21} aria-hidden="true" /></span><div><strong>2. Agrega MiBatute a tu inicio</strong><p>Desliza la lista y toca «Agregar a inicio» o «Añadir a pantalla de inicio». Si falta la opción, búscala en «Editar acciones».</p></div></li>
        <li><span className="install-step-icon"><Check size={21} aria-hidden="true" /></span><div><strong>3. Confirma Agregar</strong><p>Si aparece «Abrir como app web», déjalo activado y toca «Agregar» o «Añadir».</p></div></li>
      </ol> : <ol>
        <li><span className="install-step-icon"><EllipsisVertical size={21} aria-hidden="true" /></span><div><strong>1. Abre el menú de Chrome</strong><p>Toca los tres puntos verticales junto a la barra de direcciones.</p></div></li>
        <li><span className="install-step-icon"><SquarePlus size={21} aria-hidden="true" /></span><div><strong>2. Agrega la app a tu inicio</strong><p>Busca «Agregar a pantalla principal» o «Instalar aplicación». También puede estar dentro de «Instalar y crear acceso directo».</p></div></li>
        <li><span className="install-step-icon"><Check size={21} aria-hidden="true" /></span><div><strong>3. Confirma en tu teléfono</strong><p>Toca «Agregar» o «Instalar», según la opción que muestre Chrome.</p></div></li>
      </ol>}
      <p className="install-suggestion-finish"><img src="/logo.png" alt="" width="24" height="24" /><span>Listo: abre MiBatute desde su nuevo ícono en tu pantalla de inicio. Sin pasar por App Store ni Play Store.</span></p>
    </div>
  </aside>;
}
