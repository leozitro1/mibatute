import { createClient } from '@supabase/supabase-js';
import { authFetchFor } from '../supabase/authRequestGuard.js';
import { databaseActionError } from '../supabase/databaseActionError.js';

export const staffClient = createClient(import.meta.env.VITE_SUPABASE_URL,import.meta.env.VITE_SUPABASE_ANON_KEY,{
  global: { fetch: authFetchFor(import.meta.env.VITE_SUPABASE_URL) },
  auth: { storageKey:'mb-staff-auth',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false },
});

export async function staffRpc(name,args) {
  const { data,error } = await staffClient.rpc(name,args);
  if (error) throw databaseActionError(error, error.code === '42501' ? 'No tienes permiso o tu sesión venció.' : 'No se pudo completar la operación. Intenta de nuevo.');
  return data;
}

export const STAFF_SECTIONS = [
  { id:'pending',label:'Pendientes',permission:'access',icon:'inbox' },
  { id:'inbox',label:'Buzón',permission:'access',icon:'inbox' },
  { id:'privacy',label:'Solicitudes de datos',permission:'access',icon:'shield' },
  { id:'articles',label:'Publicaciones',permission:'moderation',icon:'package' },
  { id:'reports',label:'Reportes',permission:'reports',icon:'flag' },
  { id:'users',label:'Usuarios',permission:'users',icon:'users' },
  { id:'verifications',label:'Verificación de cuentas',permission:'users',icon:'shield' },
  { id:'sponsors',label:'Patrocinadores',permission:'sponsors',icon:'megaphone' },
  { id:'locations',label:'Ciudades y localidades',permission:'team',icon:'map' },
  { id:'statistics',label:'Estadísticas',permission:'team',icon:'chart' },
  { id:'settings',label:'Administración de la página',permission:'team',icon:'settings' },
  { id:'team',label:'Equipo',permission:'team',icon:'shield' },
  { id:'audit',label:'Auditoría',permission:'access',icon:'history' },
];

export function allowedSections(account) {
  return STAFF_SECTIONS.filter(section => section.permission==='access' || account?.role==='master'
    || (!['sponsors','statistics','locations','settings'].includes(section.id)&&account?.permissions?.includes(section.permission)));
}
