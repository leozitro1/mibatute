import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHmac,randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { localStatus } from './seed-applicants-local.mjs';

const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const config=localStatus();
const appUrl=process.env.LOCAL_APP_URL||'http://127.0.0.1:5174';
assert.ok(['localhost','127.0.0.1'].includes(new URL(appUrl).hostname));
const options={auth:{persistSession:false,autoRefreshToken:false}};
const service=createClient(config.API_URL,config.SERVICE_ROLE_KEY,options);
const auth=createClient(config.API_URL,config.ANON_KEY,options);
const checked=({data,error})=>{if(error)throw error;return data;};
const email=`passwords-${Date.now()}@example.com`;
const password=`Local-${randomUUID()}`;
const changed=`Changed-${randomUUID()}`;
const recovered=`Recovered-${randomUUID()}`;
let user;
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});

// This code generator is used only for a disposable local test account.
function totp(secret) {
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits='';for(const char of secret.toUpperCase().replace(/=+$/,''))bits+=alphabet.indexOf(char).toString(2).padStart(5,'0');
  const key=Buffer.from(bits.match(/.{8}/g).map(byte=>parseInt(byte,2)));
  const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const digest=createHmac('sha1',key).update(counter).digest();const offset=digest.at(-1)&15;
  return ((digest.readUInt32BE(offset)&0x7fffffff)%1000000).toString().padStart(6,'0');
}
try {
  ({user}=checked(await service.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{local_fixture:'staff-password-test'}})));
  checked(await service.from('staff_accounts').insert({user_id:user.id,role:'master',active:true}));
  checked(await auth.auth.signInWithPassword({email,password}));
  const factor=checked(await auth.auth.mfa.enroll({factorType:'totp',friendlyName:'Disposable password test'}));
  checked(await auth.auth.mfa.challengeAndVerify({factorId:factor.id,code:totp(factor.totp.secret)}));
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const path='/gestion/direccion';
  await page.goto(`${appUrl}${path}`);
  await page.getByLabel('Correo o usuario').fill(email);await page.getByLabel('Contraseña',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Ingresar',exact:true}).click();
  await page.getByLabel('Código del autenticador').fill(totp(factor.totp.secret));await page.getByRole('button',{name:'Verificar',exact:true}).click();
  await page.getByRole('heading',{name:'Pendientes',exact:true}).waitFor();
  const oldSession=await page.evaluate(()=>JSON.parse(localStorage.getItem('mb-staff-auth')));
  await page.getByRole('button',{name:'Abrir menú',exact:true}).click();await page.getByRole('button',{name:'Cambiar contraseña',exact:true}).click();
  await page.getByLabel('Contraseña actual').fill(password);await page.getByRole('button',{name:'Continuar',exact:true}).click();
  await page.getByLabel('Código del autenticador').fill(totp(factor.totp.secret));await page.getByRole('button',{name:'Verificar',exact:true}).click();
  await page.getByLabel('Nueva contraseña',{exact:true}).fill(changed);await page.getByLabel('Confirmar contraseña').fill(changed);
  await page.getByRole('button',{name:'Guardar contraseña',exact:true}).click();
  await page.getByRole('heading',{name:'Iniciar sesión',exact:true}).waitFor();
  assert.match(await page.getByRole('status').innerText(),/Contraseña actualizada/);
  assert.ok((await auth.auth.signInWithPassword({email,password})).error);
  const stale=createClient(config.API_URL,config.ANON_KEY,options);
  await stale.auth.setSession({access_token:oldSession.access_token,refresh_token:oldSession.refresh_token});
  assert.ok((await stale.rpc('staff_queue',{p_section:'team'})).error);
  console.log('OK: mobile password change requires current password and TOTP; old password and old staff session fail.');

  await page.getByRole('button',{name:'Olvidé mi contraseña',exact:true}).click();
  await page.getByLabel('Correo o usuario').fill(email);await page.getByRole('button',{name:'Enviar enlace',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Si la cuenta existe'}).waitFor();
  let message;
  for(let attempt=0;attempt<20&&!message;attempt++) {
    const mailbox=await (await fetch('http://127.0.0.1:54324/api/v1/messages')).json();
    message=mailbox.messages.find(item=>item.To.some(recipient=>recipient.Address===email));
    if(!message)await new Promise(resolve=>setTimeout(resolve,250));
  }
  assert.ok(message,'Recovery email must arrive in the local mailbox');
  const mail=await (await fetch(`http://127.0.0.1:54324/api/v1/message/${message.ID}`)).json();
  const mailContext=await browser.newContext();const mailPage=await mailContext.newPage();await mailPage.setContent(mail.HTML);
  const link=await mailPage.getByRole('link',{name:'Restablecer contraseña',exact:true}).getAttribute('href');
  assert.equal(new URL(link).hostname,'127.0.0.1');assert.ok(new URL(link).searchParams.get('redirect_to').startsWith(`${appUrl}${path}`));
  const recoveryContext=await browser.newContext({viewport:{width:390,height:844}});const recoveryPage=await recoveryContext.newPage();
  await recoveryPage.goto(link);
  await recoveryPage.getByRole('heading',{name:'Verificar acceso',exact:true}).waitFor();
  assert.equal(new URL(recoveryPage.url()).hash,'');
  assert.equal(await recoveryPage.getByLabel('Nueva contraseña',{exact:true}).count(),0);
  const weakSession=await recoveryPage.evaluate(()=>JSON.parse(localStorage.getItem('mb-staff-auth')));
  const weak=createClient(config.API_URL,config.ANON_KEY,options);
  checked(await weak.auth.setSession({access_token:weakSession.access_token,refresh_token:weakSession.refresh_token}));
  assert.ok((await weak.auth.updateUser({password:recovered})).error,'Recovery must not bypass an existing verified second factor');
  await recoveryPage.getByLabel('Código del autenticador').fill(totp(factor.totp.secret));await recoveryPage.getByRole('button',{name:'Verificar',exact:true}).click();
  await recoveryPage.getByLabel('Nueva contraseña',{exact:true}).fill(recovered);await recoveryPage.getByLabel('Confirmar contraseña').fill('No coincide con la clave');
  await recoveryPage.getByRole('button',{name:'Guardar contraseña',exact:true}).click();
  assert.match(await recoveryPage.getByRole('alert').innerText(),/no coinciden/);
  await recoveryPage.getByLabel('Confirmar contraseña').fill(recovered);await recoveryPage.getByRole('button',{name:'Guardar contraseña',exact:true}).click();
  await recoveryPage.getByRole('heading',{name:'Iniciar sesión',exact:true}).waitFor();
  assert.match(await recoveryPage.getByRole('status').innerText(),/Contraseña actualizada/);
  assert.ok((await auth.auth.signInWithPassword({email,password:changed})).error);
  checked(await auth.auth.signInWithPassword({email,password:recovered}));
  assert.ok((await auth.rpc('staff_open_session')).error);
  const current=checked(await service.auth.admin.getUserById(user.id)).user;
  assert.ok(current.factors.some(item=>item.id===factor.id&&item.status==='verified'));
  await recoveryPage.goto(`${appUrl}${path}?recovery=1#type=recovery&access_token=invalid&refresh_token=invalid`);
  await recoveryPage.getByRole('heading',{name:'Iniciar sesión',exact:true}).waitFor();
  assert.match(await recoveryPage.getByRole('alert').innerText(),/venció|válido/);
  assert.deepEqual(errors,[]);
  console.log('OK: email recovery, URL token cleanup, mandatory MFA, confirmation, preserved factor, invalid link denial.');
} finally {
  await browser.close();
  if(user) {
    checked(await service.from('staff_audit').delete().eq('actor_id',user.id));
    checked(await service.auth.admin.deleteUser(user.id));
  }
}
