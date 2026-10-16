import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHmac,randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { localStatus } from './seed-applicants-local.mjs';

const require=createRequire(import.meta.url),{chromium}=require('playwright');
const config=localStatus(),appUrl=process.env.LOCAL_APP_URL||'http://127.0.0.1:5174';
assert.ok(['localhost','127.0.0.1'].includes(new URL(appUrl).hostname));
const options={auth:{persistSession:false,autoRefreshToken:false}},service=createClient(config.API_URL,config.SERVICE_ROLE_KEY,options);
const checked=({data,error})=>{if(error)throw error;return data;};
const fixture=`Mensajes ${Date.now()}`,users=[],messages=[];
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});
function totp(secret) {
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const char of secret.toUpperCase().replace(/=+$/,''))bits+=alphabet.indexOf(char).toString(2).padStart(5,'0');
  const key=Buffer.from(bits.match(/.{8}/g).map(value=>parseInt(value,2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const digest=createHmac('sha1',key).update(counter).digest(),offset=digest.at(-1)&15;return((digest.readUInt32BE(offset)&0x7fffffff)%1000000).toString().padStart(6,'0');
}
async function account(role) {
  const email=`messages-${randomUUID()}@example.com`,password=randomUUID();
  const {user}=checked(await service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{nombre:`${fixture} ${role}`},app_metadata:{local_fixture:'staff-messages-test'}}));users.push(user.id);
  const client=createClient(config.API_URL,config.ANON_KEY,options);let{session}=checked(await client.auth.signInWithPassword({email,password}));
  if(['admin','master'].includes(role)) {
    checked(await service.from('staff_accounts').insert({user_id:user.id,role,permissions:['users'],active:true}));
    const factor=checked(await client.auth.mfa.enroll({factorType:'totp',friendlyName:'Disposable message test'}));
    session=checked(await client.auth.mfa.challengeAndVerify({factorId:factor.id,code:totp(factor.totp.secret)}));checked(await client.rpc('staff_open_session'));
  }
  return{user,client,session,role};
}
try {
  const member=await account('member'),peer=await account('peer');
  assert.ok((await member.client.rpc('staff_prepare_message',{p_ids:[peer.user.id]})).error);
  for(const role of['admin','master']) {
    const actor=await account(role);
    for(const width of[320,390,768,1440]) {
      const context=await browser.newContext({viewport:{width,height:900}});await context.addInitScript(session=>localStorage.setItem('mb-staff-auth',JSON.stringify(session)),actor.session);
      const page=await context.newPage(),errors=[];let prepareCalls=0,sendCalls=0;page.on('pageerror',error=>errors.push(error.message));
      page.on('request',request=>{if(request.url().includes('/rpc/staff_prepare_message'))prepareCalls++;if(request.url().includes('/rpc/staff_send_message'))sendCalls++;});
      await page.goto(`${appUrl}/gestion/${role==='master'?'direccion':'operaciones'}`);await page.getByRole('heading',{name:'Pendientes',exact:true}).waitFor();
      if(width<768)await page.getByRole('button',{name:'Abrir menú',exact:true}).click();await page.getByRole('button',{name:'Usuarios',exact:true}).click();
      await page.getByRole('textbox',{name:'Buscar en el panel'}).fill(fixture);
      const row=page.locator('tbody tr').filter({hasText:`${fixture} member`});await row.getByRole('button',{name:'Enviar mensaje',exact:true}).waitFor();
      const selectionGap=await row.evaluate(element=>{
        const checkbox=element.querySelector('.staff-user-selection input').getBoundingClientRect(),identity=element.querySelector('.staff-item').getBoundingClientRect();
        return identity.left-checkbox.right;
      });
      assert.ok(selectionGap>=8&&selectionGap<=24,`Checkbox stays next to user identity: ${selectionGap}px`);
      await row.getByRole('button',{name:'Enviar mensaje',exact:true}).click();await page.getByText('1 destinatario',{exact:true}).waitFor();
      const dialog=page.getByRole('dialog');assert.equal(await dialog.evaluate(element=>element.scrollWidth>element.clientWidth),false);
      const title=`${fixture} ${role} directo`,body='Un mensaje privado para revisar el buzon. <strong>Texto literal</strong>';
      await page.getByLabel('Asunto',{exact:true}).fill(title);await page.getByLabel('Mensaje',{exact:true}).fill(body);
      await page.getByRole('button',{name:'Revisar mensaje',exact:true}).click();await dialog.getByText(body,{exact:true}).waitFor();
      assert.equal(await dialog.locator('strong').filter({hasText:'Texto literal'}).count(),0);
      if(width===320) {
        await page.getByRole('button',{name:'Confirmar envío',exact:true}).click();await dialog.waitFor({state:'hidden'});
        const delivered=checked(await member.client.rpc('notification_inbox')).find(item=>item.title===title);assert.ok(delivered);messages.push(delivered.id);
        assert.ok(!checked(await peer.client.rpc('notification_inbox')).some(item=>item.id===delivered.id));assert.equal(sendCalls,1);
        await page.getByRole('checkbox',{name:`Seleccionar usuario: ${fixture} member`,exact:true}).check();await page.getByRole('checkbox',{name:`Seleccionar usuario: ${fixture} peer`,exact:true}).check();
        await page.getByRole('button',{name:'Mensaje a seleccionados',exact:true}).click();await page.getByText('2 destinatarios',{exact:true}).waitFor();
        await page.getByLabel('Asunto',{exact:true}).fill(`${fixture} ${role} grupo`);await page.getByLabel('Mensaje',{exact:true}).fill('Mensaje compartido para dos usuarios.');
        await page.getByRole('button',{name:'Revisar mensaje',exact:true}).click();await page.getByRole('button',{name:'Confirmar envío',exact:true}).click();await dialog.waitFor({state:'hidden'});
        const group=checked(await member.client.rpc('notification_inbox')).find(item=>item.title===`${fixture} ${role} grupo`);assert.ok(group);messages.push(group.id);
        assert.ok(checked(await peer.client.rpc('notification_inbox')).some(item=>item.id===group.id));
        assert.equal(checked(await service.from('staff_message_recipients').select('*').eq('message_id',group.id)).length,2);
        await page.getByRole('button',{name:'Comunicado a todos',exact:true}).click();await page.getByLabel('Asunto',{exact:true}).fill(`${fixture} ${role} general`);
        await page.getByLabel('Mensaje',{exact:true}).fill('Comunicado general temporal de prueba local.');await page.getByRole('button',{name:'Revisar mensaje',exact:true}).click();
        assert.equal(await page.getByRole('button',{name:'Confirmar envío',exact:true}).isEnabled(),false);
        await page.getByLabel('Escribe ENVIAR A TODOS para confirmar',{exact:true}).fill('ENVIAR A TODOS');await page.getByRole('button',{name:'Confirmar envío',exact:true}).click();await dialog.waitFor({state:'hidden'});
        const broad=checked(await member.client.rpc('notification_inbox')).find(item=>item.title===`${fixture} ${role} general`);assert.ok(broad);messages.push(broad.id);
        assert.equal(checked(await service.from('staff_message_recipients').select('*').eq('message_id',broad.id)).length,0);
        assert.equal(prepareCalls,3);assert.equal(sendCalls,3);
        const request=randomUUID(),args={p_request:request,p_all:false,p_ids:[member.user.id],p_title:`${fixture} retry`,p_body:'Reintento concurrente de prueba.',...Object.fromEntries(Object.entries(checked(await actor.client.rpc('staff_prepare_message',{p_ids:[member.user.id]}))).map(([key,value])=>[key==='count'?'p_expected':'p_cutoff',value]))};
        const results=await Promise.all([actor.client.rpc('staff_send_message',args),actor.client.rpc('staff_send_message',args)]);assert.deepEqual(checked(results[0]),checked(results[1]));messages.push(request);
        assert.equal(checked(await service.from('staff_audit').select('id').eq('action','message.send').eq('target_id',request)).length,1);
      } else await page.getByRole('button',{name:'Cerrar mensaje',exact:true}).click();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
      console.log(`OK ${role} ${width}px: composer, explicit preview, compact actions and no overflow.`);await context.close();
    }
  }
  for(const width of[390,1440]) {
    const context=await browser.newContext({viewport:{width,height:900}});await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:member.client.auth.storageKey,session:member.session});
    const page=await context.newPage();await page.goto(appUrl);await page.getByRole('button',{name:'Ver perfil',exact:true}).click();await page.getByRole('button',{name:/^Buzón/}).click();
    await page.getByText(`${fixture} admin directo`,{exact:true}).click();await page.getByText('Un mensaje privado para revisar el buzon. <strong>Texto literal</strong>',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.getByRole('button',{name:'Cerrar aviso',exact:true}).click();
    const refreshed=page.waitForResponse(response=>response.url().includes('/rpc/notification_inbox'));
    await page.getByRole('button',{name:'Actualizar buzón',exact:true}).click();assert.ok((await refreshed).ok());
    await page.getByText(`${fixture} admin grupo`,{exact:true}).click();
    page.once('dialog',dialog=>dialog.accept());const deleted=page.waitForResponse(response=>response.url().includes('/rpc/staff_message_receipt_action')&&response.request().postDataJSON().p_action==='delete');
    await page.getByRole('dialog').getByRole('button',{name:'Borrar',exact:true}).click();assert.ok((await deleted).ok());
    assert.ok(!checked(await member.client.rpc('notification_inbox')).some(item=>item.title===`${fixture} admin grupo`));
    assert.ok(checked(await peer.client.rpc('notification_inbox')).some(item=>item.title===`${fixture} admin grupo`));
    if(width===390)checked(await service.from('staff_message_states').delete().eq('message_id',messages[1]).eq('user_id',member.user.id));
    await context.close();
  }
  console.log('OK: private/group/general inbox delivery, one RPC per confirmed send, no broadcast fanout, escaped content and concurrent retry deduplication.');
} finally {
  await browser.close();if(messages.length)checked(await service.from('staff_messages').delete().in('id',messages));
  if(users.length){checked(await service.from('staff_messages').delete().in('sender_id',users));checked(await service.from('staff_audit').delete().in('actor_id',users));}
  for(const id of users)checked(await service.auth.admin.deleteUser(id));
}
