import { lazy, Suspense } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { STAFF_PATHS } from './staff/routes.js';

const MarketplaceApp=lazy(()=>import('./MarketplaceApp.jsx'));
const StaffConsole=lazy(()=>import('./pages/StaffConsole.jsx'));

export default function App() {
  const {pathname}=useLocation();
  if(pathname==='/admin'||pathname.startsWith('/master')) {
    return <main className="min-h-screen flex flex-col items-center justify-center gap-4 px-6">
      <h1 className="text-xl font-bold">Página no disponible</h1><Link className="text-forest-green" to="/">Volver a MiBatute</Link>
    </main>;
  }
  const privatePath=pathname===STAFF_PATHS.admin||pathname===STAFF_PATHS.master;
  return <Suspense fallback={<div role="status" className="min-h-screen flex items-center justify-center">Cargando...</div>}>
    {privatePath?<StaffConsole key={pathname} requireMaster={pathname===STAFF_PATHS.master} />:<MarketplaceApp />}
  </Suspense>;
}
