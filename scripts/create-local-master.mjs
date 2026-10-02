import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const password = process.env.LOCAL_MASTER_PASSWORD;
if (!password) throw new Error('Indica LOCAL_MASTER_PASSWORD.');
const env = { ...process.env, PATH: `/Applications/Docker.app/Contents/Resources/bin:${process.env.PATH}` };
const status = JSON.parse(execFileSync(process.env.SUPABASE_CLI || 'npx', process.env.SUPABASE_CLI
  ? ['status', '-o', 'json'] : ['--offline', '--yes', 'supabase@2.119.0', 'status', '-o', 'json'], {
  env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
}));
if (new URL(status.API_URL).hostname !== '127.0.0.1') throw new Error('Solo se permite Supabase local.');
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const email = 'leozitro@master.mibatute.com';
function checked(result) {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
let existing;
for (let page = 1; ; page++) {
  const { users } = checked(await admin.auth.admin.listUsers({ page, perPage: 1000 }));
  existing = users.find(user => user.email === email);
  if (existing || users.length < 1000) break;
}
if (existing && existing.app_metadata?.local_fixture !== 'mibatute-master') {
  throw new Error('La cuenta existente no pertenece a este script.');
}
const attributes = {
  password, email_confirm: true,
  app_metadata: { role: 'master', local_fixture: 'mibatute-master' },
  user_metadata: { nombre: 'leozitro' },
};
const { user } = checked(existing
  ? await admin.auth.admin.updateUserById(existing.id, attributes)
  : await admin.auth.admin.createUser({ email, ...attributes }));
checked(await admin.from('usuarios').update({ role: 'master', rol: 'master' }).eq('id', user.id));
const client = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const login = checked(await client.auth.signInWithPassword({ email, password }));
if (login.user.app_metadata.role !== 'master') throw new Error('No se confirmo el rol Master.');
checked(await client.auth.signOut({ scope: 'local' }));
console.log('Cuenta local leozitro creada y acceso Master verificado.');
