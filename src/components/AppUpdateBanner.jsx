import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { watchAppVersion } from './appVersion.js';
import './AppUpdateBanner.css';

export default function AppUpdateBanner({active}) {
  const [available,setAvailable] = useState(() => import.meta.env.DEV && new URLSearchParams(window.location.search).get('update') === '1');
  useEffect(() => {
    if (!active || !import.meta.env.PROD) return;
    return watchAppVersion({currentVersion:import.meta.env.APP_BUILD_ID,onUpdate:() => setAvailable(true)});
  },[active]);
  if (!active || !available) return null;
  return <div className="app-update-banner" role="status">
    <RefreshCw size={20} aria-hidden="true" />
    <div><strong>Hay una nueva versión</strong><p>Guarda lo que estés haciendo y actualiza la app.</p></div>
    <button type="button" onClick={() => window.location.reload()}>Actualizar ahora</button>
  </div>;
}
