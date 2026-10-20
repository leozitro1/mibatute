import { LEGAL_READY } from '../legal/config.js';
import { policies } from '../legal/policies.js';

export const SITE_URL = 'https://www.mibatute.com';
export const HOME_TITLE = 'MiBatute | Publica gratis, compra, vende y dona en Colombia';
export const HOME_DESCRIPTION = 'Publica tus artículos gratis en MiBatute. Compra, vende sin comisión por venta y encuentra donaciones en Colombia, con categorías y filtros por ubicación.';
export const LEGAL_PATHS = [...Object.keys(policies), '/datos-personales'];
export const PRIVATE_PATHS = ['/gestion/operaciones', '/gestion/direccion', '/auth/callback', '/reset-password'];
export function metadataFor(pathname) {
  if (pathname === '/') return { title: HOME_TITLE, description: HOME_DESCRIPTION, path: '/', index: true };
  if (LEGAL_PATHS.includes(pathname)) {
    const page = policies[pathname] || { title: 'Solicitudes de datos personales', intro: 'Solicita acceso, corrección o supresión de tus datos personales en MiBatute.' };
    return { title: `${page.title} | MiBatute`, description: page.intro, path: pathname, index: LEGAL_READY };
  }
  return { title: 'Acceso privado | MiBatute', description: 'Área de acceso de MiBatute.', path: pathname, index: false };
}
export const organization = {
  '@context': 'https://schema.org', '@type': 'WebSite', name: 'MiBatute',
  alternateName: 'Mi Batute', url: SITE_URL, inLanguage: 'es-CO', description: HOME_DESCRIPTION,
};
