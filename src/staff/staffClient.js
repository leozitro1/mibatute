import { createClient } from '@supabase/supabase-js';

export const staffClient = createClient(import.meta.env.VITE_SUPABASE_URL,import.meta.env.VITE_SUPABASE_ANON_KEY,{
  auth: { storageKey:'mb-staff-auth',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false },
});

export async function staffRpc(name,args) {
  const { data,error } = await staffClient.rpc(name,args);
  if (error) throw Object.assign(new Error(error.message || 'No se pudo completar la operacion.'),{ code:error.code });
  return data;
}

export const STAFF_SECTIONS = [
  { id:'pending',label:'Pendientes',permission:'access',icon:'inbox' },
  { id:'articles',label:'Publicaciones',permission:'moderation',icon:'package' },
  { id:'reports',label:'Reportes',permission:'reports',icon:'flag' },
  { id:'users',label:'Usuarios',permission:'users',icon:'users' },
  { id:'sponsors',label:'Patrocinadores',permission:'sponsors',icon:'megaphone' },
  { id:'team',label:'Equipo',permission:'team',icon:'shield' },
  { id:'audit',label:'Auditoría',permission:'access',icon:'history' },
];

export function allowedSections(account) {
  return STAFF_SECTIONS.filter(section => section.permission==='access' || account?.role==='master'
    || (section.id!=='sponsors'&&account?.permissions?.includes(section.permission)));
}
