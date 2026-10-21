import { useEffect } from 'react';
import { refreshLocations } from './useLocations.js';

export default function LocationCatalogLoader() {
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'hidden') refreshLocations().catch(() => {});
    };
    refreshLocations().catch(() => {});
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return null;
}
