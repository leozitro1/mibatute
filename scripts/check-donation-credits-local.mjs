import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
import { localStatus } from './seed-applicants-local.mjs';

const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const config=localStatus();
const appUrl=process.env.LOCAL_APP_URL || 'http://127.0.0.1:5174';
assert.ok(['localhost','127.0.0.1'].includes(new URL(appUrl).hostname));
const options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(config.API_URL,config.SERVICE_ROLE_KEY,options);
const checked=({data,error})=>{assert.ifError(error);return data;};
const users=[],articles=[];
let browser;
try {
  const stamp=Date.now();
  for(const name of ['owner','buyer','other']) {
    const email=`credits-${name}-${stamp}@example.com`;
    const user=checked(await admin.auth.admin.createUser({email,password:'local-credits-123',email_confirm:true,
      user_metadata:{nombre:`Creditos ${name}`,movil:'3001234567',ciudad:'Bogotá',localidad:'Chapinero'},
      app_metadata:{local_fixture:'mibatute'}})).user;
    users.push(user);
    checked(await admin.from('usuarios').update({is_blocked:false,bloqueado:false}).eq('id',user.id));
  }
  for(let n=0;n<6;n++) articles.push(checked(await admin.from('articulos').insert({owner_id:users[0].id,
    title:`Credito local ${n} ${stamp}`,description:'Donacion temporal para pruebas de creditos.',
    mode:'donacion',estado:'disponible',status:'disponible',city:'Bogotá',locality:'Chapinero',price:0,
  }).select('id,title').single()));
  const buyer=createClient(config.API_URL,config.ANON_KEY,options);
  const owner=createClient(config.API_URL,config.ANON_KEY,options);
  const session=checked(await buyer.auth.signInWithPassword({email:users[1].email,password:'local-credits-123'})).session;
  checked(await owner.auth.signInWithPassword({email:users[0].email,password:'local-credits-123'}));
  const apply=(index,paid=false)=>buyer.rpc('apply_for_donation',{p_article_id:articles[index].id,p_message:'Me sirve para mi hogar de prueba.',p_use_credit:paid}).then(checked);
  const status=()=>buyer.rpc('donation_application_status').then(checked);
  assert.equal((await apply(0)).cost,0);
  assert.equal((await status()).balance,0);
  assert.equal((await apply(1)).code,'RATE_LIMIT_REACHED');
  assert.equal((await apply(1,true)).code,'INSUFFICIENT_CREDITS');
  checked(await admin.from('cupos').upsert({usuario_id:users[1].id,saldo:3}));
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:buyer.auth.storageKey,session});
  const page=await context.newPage();
  const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(error.message));
  page.on('dialog',dialog=>dialog.accept());
  await page.goto(appUrl);
  await page.getByRole('textbox',{name:'Buscar',exact:true}).fill(articles[1].title);
  await page.getByRole('heading',{name:articles[1].title,exact:true}).waitFor();
  await page.locator('[data-testid="home-listings"] [role="button"]').filter({has:page.getByRole('heading',{name:articles[1].title,exact:true})}).click();
  await page.getByPlaceholder('Ej: Soy artesano y me sirve para una escultura...').fill('Me sirve para mi hogar de prueba.');
  await page.getByRole('button',{name:/Enviar|Solicitar/i}).filter({visible:true}).last().click();
  await page.getByText('1 solicitud gratuita cada 6 horas',{exact:true}).waitFor();
  await page.getByRole('button',{name:/Postularme con 1 crédito/}).click();
  await page.getByRole('button',{name:'Cerrar publicación',exact:true}).waitFor({state:'hidden'});
  assert.equal((await status()).balance,2);
  const requests=await Promise.all([2,3,4,5].map(n=>apply(n,true)));
  assert.equal(requests.filter(r=>r.success).length,1,'Only one remaining pending slot despite concurrent requests');
  assert.equal(requests.filter(r=>r.code==='PENDING_LIMIT').length,3);
  const s=await status(); assert.equal(s.pending,3); assert.equal(s.balance,1);
  assert.equal(s.heldCredits,2);
  const retry=await Promise.all(Array.from({length:5},()=>apply(1,true)));
  assert.ok(retry.every(r=>r.alreadyExists)); assert.equal((await status()).balance,1);
  const ledger=checked(await buyer.from('donation_application_credits').select('id,cost,state').eq('usuario_id',users[1].id));
  const paid=ledger.find(r=>r.cost===1);
  checked(await owner.from('postulaciones').delete().eq('id',paid.id));
  assert.equal((await status()).balance,2);
  assert.equal((await status()).freeAvailable,false);
  await page.getByRole('button',{name:'Ver perfil',exact:true}).click();
  await page.getByRole('button',{name:'Mis Rescates',exact:true}).click();
  await page.getByText('2/3 solicitudes pendientes',{exact:true}).waitFor();
  await page.getByText('1 crédito retenido en solicitudes pendientes. El saldo muestra los disponibles.',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(pageErrors,[]);
  console.log('OK: free request without balance, paid UI, concurrent 3-pending cap, idempotent retries, refund and mobile profile.');
} finally {
  if(browser) await browser.close();
  if(articles.length) checked(await admin.from('articulos').delete().in('id',articles.map(a=>a.id)));
  if(articles.length) checked(await admin.from('activity_notifications').delete().in('articulo_id',articles.map(a=>a.id)));
  for(const user of users) checked(await admin.auth.admin.deleteUser(user.id));
}
