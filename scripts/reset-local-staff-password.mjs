import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { localStatus } from './seed-applicants-local.mjs';

const email=process.argv[2];
if(!email||!email.includes('@'))throw new Error('Indica el correo de la cuenta local.');
const config=localStatus();
const checked=({data,error})=>{if(error)throw error;return data;};
const client=createClient(config.API_URL,config.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
let account;
for(let page=1;!account;page++) {
  const {users}=checked(await client.auth.admin.listUsers({page,perPage:1000}));
  account=users.find(user=>user.email===email);
  if(users.length<1000)break;
}
if(!account?.app_metadata?.local_fixture)throw new Error('Solo se pueden restablecer cuentas de prueba locales existentes.');
const membership=checked(await client.from('staff_accounts').select('role,active').eq('user_id',account.id).single());
if(!membership.active)throw new Error('La cuenta del equipo no esta activa.');
const password=`Local-${randomBytes(18).toString('base64url')}`;
checked(await client.auth.admin.updateUserById(account.id,{password}));
const {user}=checked(await client.auth.admin.getUserById(account.id));
const factors=value=>(value.factors||[]).map(item=>`${item.id}:${item.status}`).sort();
if(JSON.stringify(factors(user))!==JSON.stringify(factors(account)))throw new Error('Los factores no coinciden tras el cambio.');
checked(await client.from('staff_sessions').update({revoked_at:new Date().toISOString()}).eq('user_id',account.id));
console.log(`Cuenta local: ${email}\nContrasena temporal: ${password}\nRol y autenticador conservados. Sesiones del panel revocadas.`);
