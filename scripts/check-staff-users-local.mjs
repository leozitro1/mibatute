import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHmac,randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { localStatus } from './seed-applicants-local.mjs';

const require=createRequire(import.meta.url),{chromium}=require('playwright');
const config=localStatus(),appUrl=process.env.LOCAL_APP_URL||'http://127.0.0.1:5174';
assert.ok(['127.0.0.1','localhost'].includes(new URL(appUrl).hostname));
const options={auth:{persistSession:false,autoRefreshToken:false}};
const service=createClient(config.API_URL,config.SERVICE_ROLE_KEY,options);
const checked=({data,error})=>{if(error)throw error;return data;};
const users=[],articles=[],fixture=`Ficha ${Date.now()}`;
let sanctionAdmin,balance=7;
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});

// Test codes belong exclusively to disposable local accounts.
function totp(secret) {
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';
  for(const char of secret.toUpperCase().replace(/=+$/,''))bits+=alphabet.indexOf(char).toString(2).padStart(5,'0');
  const key=Buffer.from(bits.match(/.{8}/g).map(value=>parseInt(value,2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const digest=createHmac('sha1',key).update(counter).digest(),offset=digest.at(-1)&15;
  return ((digest.readUInt32BE(offset)&0x7fffffff)%1000000).toString().padStart(6,'0');
}
async function account(role) {
  const email=`users-${randomUUID()}@example.com`,password=randomUUID();
  const {user}=checked(await service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{nombre:`${fixture} ${role}`},app_metadata:{local_fixture:'staff-users-test'}}));users.push(user.id);
  const client=createClient(config.API_URL,config.ANON_KEY,options);let {session}=checked(await client.auth.signInWithPassword({email,password}));
  if(['admin','master'].includes(role)) {
    checked(await service.from('staff_accounts').insert({user_id:user.id,role,permissions:['users'],active:true}));
    assert.ok((await client.rpc('staff_user_detail',{p_id:user.id})).error);
    const factor=checked(await client.auth.mfa.enroll({factorType:'totp',friendlyName:'Disposable user administration'}));
    session=checked(await client.auth.mfa.challengeAndVerify({factorId:factor.id,code:totp(factor.totp.secret)}));
    checked(await client.rpc('staff_open_session'));
  }
  return {user,client,session,email,role};
}
try {
  const member=await account('member'),peer=await account('peer');
  checked(await service.from('usuarios').update({nombre:fixture,ciudad:'Bogotá',localidad:'Suba',movil:'3001234567',direccion:'Calle privada de prueba'}).eq('id',member.user.id));
  checked(await service.from('cupos').upsert({usuario_id:member.user.id,saldo:7}));
  const records=Array.from({length:23},(_,index)=>({id:randomUUID(),owner_id:member.user.id,title:`Historial ${index} ${fixture}`,mode:'venta',price:1000,
    city:'Bogotá',locality:'Suba',status:index>=3?'entregado':'disponible',estado:index>=3?'entregado':'disponible',
    buyer_id:index>=3?peer.user.id:null,delivered_at:index>=3?new Date().toISOString():null,is_featured:index===0,
    created_at:new Date(Date.now()-index*60_000).toISOString()}));
  articles.push(...records.map(record=>record.id));checked(await service.from('articulos').insert(records));
  checked(await peer.client.rpc('submit_article_report',{p_article:records[0].id,p_reason:'Spam',p_details:'Reporte temporal para comprobar el historial'}));
  checked(await service.from('articulos').update({status:'entregado',estado:'entregado',buyer_id:peer.user.id,delivered_at:new Date().toISOString(),is_featured:false}).eq('id',records[0].id));
  checked(await service.from('reputacion').insert({reviewed_id:member.user.id,reviewer_id:peer.user.id,articulo_id:records[0].id,estrellas:4,comentario:'Prueba local'}));
  checked(await service.from('articulos').delete().eq('id',records[0].id));
  checked(await peer.client.rpc('transition_sale',{p_articulo_id:records[1].id,p_action:'reserve'}));
  assert.ok((await peer.client.rpc('staff_user_detail',{p_id:member.user.id})).error);
  assert.ok((await peer.client.rpc('staff_compensate_credits',{p_user:member.user.id,p_amount:1,p_reason:'Intento de usuario normal',p_request_id:randomUUID()})).error);
  assert.ok((await peer.client.from('staff_publication_history').select('*')).error);
  assert.equal(checked(await peer.client.from('usuarios').select('id,movil,direccion').eq('id',member.user.id)).length,0);
  for(const role of ['admin','master']) {
    const actor=await account(role);
    if(role==='admin')sanctionAdmin=actor;
    const detail=checked(await actor.client.rpc('staff_user_detail',{p_id:member.user.id}));
    assert.equal(detail.stats.created,23);assert.equal(detail.stats.featured,1);assert.equal(detail.stats.deleted,1);assert.equal(detail.stats.delivered,21);
    assert.equal(detail.stats.active,1);assert.equal(detail.stats.reserved,1);assert.equal(detail.stats.reported,1);assert.equal(detail.stats.rating,4);
    for(const width of [320,390,768,1440]) {
      const context=await browser.newContext({viewport:{width,height:900}});
      await context.addInitScript(session=>localStorage.setItem('mb-staff-auth',JSON.stringify(session)),actor.session);
      const page=await context.newPage(),errors=[];let detailCalls=0,homeCalls=0;
      page.on('pageerror',error=>errors.push(error.message));
      page.on('request',request=>{if(request.url().includes('/rpc/staff_user_detail'))detailCalls++;if(request.url().includes('/rpc/home_article_page'))homeCalls++;});
      await page.goto(`${appUrl}/gestion/${role==='master'?'direccion':'operaciones'}`);
      await page.getByRole('heading',{name:'Pendientes',exact:true}).waitFor();
      if(width<768)await page.getByRole('button',{name:'Abrir menú',exact:true}).click();
      await page.getByRole('button',{name:'Usuarios',exact:true}).click();
      await page.getByRole('textbox',{name:'Buscar en el panel'}).fill(fixture);
      await page.getByLabel('Ciudad',{exact:true}).selectOption('Bogotá');
      await page.getByLabel('Barrio / localidad',{exact:true}).selectOption('Usaquén');
      await page.getByText('0 usuarios',{exact:true}).waitFor();
      await page.getByLabel('Barrio / localidad',{exact:true}).selectOption('Suba');
      await page.getByLabel('Publicaciones con reportes',{exact:true}).selectOption('yes');
      await page.getByText('1 usuario',{exact:true}).waitFor();
      const row=page.locator('tbody tr').filter({hasText:fixture});await row.getByText('23 creadas',{exact:true}).waitFor();
      assert.equal(await row.locator('[data-label="Créditos"] strong').innerText(),String(balance));
      const actionLayout=await row.locator('.staff-user-actions').evaluate(element=>{
        const bounds=element.getBoundingClientRect(),buttons=[...element.children].map(button=>button.getBoundingClientRect());
        return {rows:new Set(buttons.map(button=>Math.round(button.top))).size,height:bounds.height,
          contained:buttons.every(button=>button.left>=bounds.left&&button.right<=bounds.right+1)};
      });
      assert.equal(actionLayout.rows,2);assert.equal(actionLayout.height,width<768?92:76);assert.ok(actionLayout.contained);
      if(width===1440) {
        await row.getByRole('button',{name:'Agregar créditos',exact:true}).click();
        await page.getByLabel('Créditos a agregar',{exact:true}).fill('6');
        await page.getByLabel('Motivo',{exact:true}).fill(`Compensacion local ${role}`);
        assert.ok(await page.getByRole('button',{name:'Agregar y notificar',exact:true}).isDisabled());
        await page.getByLabel('Créditos a agregar',{exact:true}).fill('5');
        await page.getByRole('button',{name:'Agregar y notificar',exact:true}).click();balance+=5;
        await row.locator('[data-label="Créditos"] strong').getByText(String(balance),{exact:true}).waitFor();
        const notices=checked(await member.client.rpc('notification_inbox')).filter(item=>item.title==='Creditos de compensacion');
        assert.ok(notices.some(item=>item.message.includes(`Compensacion local ${role}`)&&item.message.includes(`${balance} creditos`)));
      }
      assert.equal(detailCalls,0,'The list must not load individual user files');
      await page.getByRole('button',{name:`Ver usuario: ${fixture}`,exact:true}).click();
      const dialog=page.getByRole('dialog',{name:'Ficha de usuario'});
      await dialog.getByText(member.email,{exact:true}).waitFor();await dialog.getByText('Calle privada de prueba',{exact:true}).waitFor();
      await dialog.getByText('4.0 / 5',{exact:true}).waitFor();
      await dialog.locator('.staff-user-history').getByText('Eliminada',{exact:true}).waitFor();
      assert.equal(await dialog.locator('.staff-user-history>li').count(),20);
      assert.equal(detailCalls,1,'Opening a user requires exactly one RPC');
      if(role==='admin')assert.equal(await dialog.getByRole('button',{name:/Ver publicación:/}).count(),0);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      assert.equal(await dialog.evaluate(element=>element.scrollWidth>element.clientWidth),false);
      await dialog.getByRole('button',{name:'Historial siguiente',exact:true}).click();
      await dialog.getByText('2 / 2',{exact:true}).waitFor();assert.equal(await dialog.locator('.staff-user-history>li').count(),3);assert.equal(detailCalls,2);
      await dialog.getByRole('button',{name:'Cerrar ficha de usuario',exact:true}).click();
      assert.equal(homeCalls,0);assert.deepEqual(errors,[]);
      console.log(`OK ${role} ${width}px: user filters, private file, historical counters, ratings, one-RPC loading, pagination and no overflow.`);
      await context.close();
    }
  }
  const audit=checked(await service.from('staff_audit').select('id').eq('action','user.view').eq('target_id',member.user.id));assert.ok(audit.length>=18);
  const requestId=randomUUID(),args={p_user:member.user.id,p_amount:1,p_reason:'Compensacion concurrente de prueba',p_request_id:requestId};
  const retries=await Promise.all([sanctionAdmin.client.rpc('staff_compensate_credits',args),sanctionAdmin.client.rpc('staff_compensate_credits',args)]);
  assert.deepEqual(checked(retries[0]),checked(retries[1]));balance++;
  assert.equal(checked(await service.from('cupos').select('saldo').eq('usuario_id',member.user.id).single()).saldo,balance);
  assert.equal(checked(await service.from('cupos_historial').select('id').eq('referencia_id',requestId)).length,1);
  const compensationMessages=checked(await member.client.rpc('notification_inbox')).filter(item=>item.title==='Creditos de compensacion');assert.equal(compensationMessages.length,3);
  const compensationActivity=checked(await member.client.from('activity_notifications').select('type,receipt_id'));
  for(const item of compensationMessages)assert.equal(compensationActivity.filter(activity=>activity.receipt_id===item.receipt_id).length,1);
  assert.equal(compensationActivity.filter(activity=>activity.type==='credits_received').length,0);
  console.log('OK compensation: balances in list, 1-5 validation, ledger, private owner notice, one alert and concurrent retry grants only once.');
  console.log('OK: article deletion preserves counts, featured usage, delivery, report and rating; ordinary users cannot access private administrative data.');
  const sanctionReason='Incumplimiento reiterado de las normas de convivencia';
  checked(await sanctionAdmin.client.rpc('staff_action',{p_kind:'user',p_id:member.user.id,p_action:'suspend',p_reason:sanctionReason,p_options:{days:3}}));
  const notice=checked(await member.client.rpc('notification_inbox')).find(item=>item.title==='Suspension temporal de tu cuenta');
  assert.ok(notice);assert.ok(notice.message.includes(sanctionReason));assert.match(notice.message,/Duracion: 3 dias\./);assert.match(notice.message,/hora de Colombia/);assert.match(notice.message,/hola@mibatute.com/);
  assert.ok(!checked(await peer.client.rpc('notification_inbox')).some(item=>item.id===notice.id));
  assert.ok((await member.client.from('articulos').insert({owner_id:member.user.id,title:'Intento estando suspendido',mode:'venta',price:1000})).error);
  const inboxContext=await browser.newContext({viewport:{width:390,height:844}});
  await inboxContext.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:member.client.auth.storageKey,session:member.session});
  const inboxPage=await inboxContext.newPage();await inboxPage.goto(appUrl);
  await inboxPage.getByRole('button',{name:'Ver perfil',exact:true}).click();
  await inboxPage.getByRole('button',{name:/^Buzón/}).click();
  await inboxPage.getByText('Suspension temporal de tu cuenta',{exact:true}).click();
  await inboxPage.getByText(notice.message,{exact:true}).waitFor();
  assert.equal(await inboxPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await inboxContext.close();
  console.log('OK: suspended user can read the private sanction in the mobile inbox, with reason, duration, Colombia deadline and appeal contact.');
  checked(await service.auth.admin.deleteUser(member.user.id));users.splice(users.indexOf(member.user.id),1);
  assert.equal(checked(await service.from('staff_publication_history').select('article_id').eq('owner_id',member.user.id)).length,0);
  console.log('OK: deleting a disposable Auth account also removes its remaining publications and administrative history.');
} finally {
  await browser.close();
  if(articles.length)checked(await service.from('articulos').delete().in('id',articles));
  if(users.length){checked(await service.from('staff_audit').delete().in('actor_id',users));checked(await service.from('system_messages').delete().in('sender_id',users));}
  for(const uid of users)checked(await service.auth.admin.deleteUser(uid));
  if(users.length)assert.equal(checked(await service.from('staff_publication_history').select('article_id').in('owner_id',users)).length,0);
}
