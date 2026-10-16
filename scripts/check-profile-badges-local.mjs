import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { localStatus } from './seed-applicants-local.mjs';

const {chromium}=createRequire(import.meta.url)('playwright'),config=localStatus();
const appUrl=process.env.LOCAL_APP_URL||'http://127.0.0.1:5174';
assert.ok(['localhost','127.0.0.1'].includes(new URL(appUrl).hostname));
const options={auth:{persistSession:false,autoRefreshToken:false}},service=createClient(config.API_URL,config.SERVICE_ROLE_KEY,options);
const checked=({data,error})=>{if(error)throw error;return data;};
const users=[],articles=[],messageId=randomUUID(),title=`Aviso de globos ${randomUUID()}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});
async function account(){
  const email=`badges-${randomUUID()}@example.com`,password=randomUUID();
  const {user}=checked(await service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{nombre:'Prueba de globos'},app_metadata:{local_fixture:'profile-badges'}}));users.push(user.id);
  const client=createClient(config.API_URL,config.ANON_KEY,options),{session}=checked(await client.auth.signInWithPassword({email,password}));return{user,client,session};
}
try{
  const member=await account(),peer=await account(),applicant=await account();
  for(const [owner,mode]of [[member,'donacion'],[peer,'venta']]){
    const article=checked(await service.from('articulos').insert({owner_id:owner.user.id,title:`Globos ${mode} - prueba temporal`,mode,price:mode==='venta'?1000:0,
      estado_producto:8,status:'disponible',estado:'disponible',city:'Bogotá',locality:'Chapinero',review_status:'approved'}).select('id').single());articles.push(article.id);
  }
  checked(await service.from('postulaciones').insert({articulo_id:articles[0],usuario_id:peer.user.id,justificacion:'Solicitud temporal para probar los globos.'}));
  checked(await member.client.rpc('transition_sale',{p_articulo_id:articles[1],p_action:'reserve'}));
  checked(await peer.client.rpc('transition_sale',{p_articulo_id:articles[1],p_action:'approve_chat'}));
  checked(await service.from('system_messages').insert({id:messageId,sender_id:peer.user.id,title,body:'Aviso temporal para probar la lectura compartida.'}));
  const receipt=checked(await service.from('system_message_receipts').insert({message_id:messageId,user_id:member.user.id}).select('id').single());
  for(const width of[390,1440]){
    checked(await service.from('postulaciones').delete().eq('articulo_id',articles[0]).eq('usuario_id',applicant.user.id));
    checked(await service.from('system_message_receipts').update({read_at:null}).eq('id',receipt.id));
    const context=await browser.newContext({viewport:{width,height:900}});await context.addInitScript(({key,session})=>{
      localStorage.setItem(key,JSON.stringify(session));const now=Date.now;let offset=0;Date.now=()=>now()+offset;
      window.advanceNotificationCache=()=>{offset+=65_000;};
    },{key:member.client.auth.storageKey,session:member.session});
    const page=await context.newPage(),errors=[];let inboxReads=0,activityReads=0,receiptWrites=0,rescueReads=0;
    page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{
      const url=new URL(request.url());if(url.pathname.endsWith('/rpc/notification_inbox'))inboxReads++;
      if(url.pathname.endsWith('/activity_notifications')||url.pathname.endsWith('/rpc/notification_activity_feed'))activityReads++;
      if(url.pathname.endsWith('/rpc/notification_receipt_action'))receiptWrites++;
      if(url.pathname.endsWith('/postulaciones')&&url.searchParams.has('usuario_id'))rescueReads++;
    });
    await page.goto(appUrl);await page.getByRole('button',{name:'Ver perfil',exact:true}).click();
    const tabs=page.locator('.profile-tabs'),pub=tabs.getByRole('button',{name:'Mis Publicaciones',exact:true}),rescue=tabs.getByRole('button',{name:'Mis Rescates',exact:true}),inbox=tabs.getByRole('button').nth(2);
    const badge=button=>button.locator('.bg-red-600');
    await badge(pub).filter({hasText:/^1$/}).waitFor();await badge(rescue).filter({hasText:/^1$/}).waitFor();await badge(inbox).filter({hasText:/^1$/}).waitFor();
    assert.equal(inboxReads,0,'Inbox badge appears before loading its body');assert.equal(rescueReads,0,'Rescue badge needs no rescue tab query');
    await page.getByRole('button',{name:'Notificaciones',exact:true}).click();
    const menu=page.getByRole('menu',{name:'Notificaciones',exact:true});
    const beforeBell={inboxReads,activityReads,receiptWrites,rescueReads};
    await menu.getByRole('button',{name:'Marcar todas como leídas',exact:true}).click();
    assert.equal(await menu.locator('[data-read="false"]').count(),0);
    assert.equal(await badge(pub).innerText(),'1');assert.equal(await badge(rescue).innerText(),'1');assert.equal(await badge(inbox).innerText(),'1');
    assert.deepEqual({inboxReads,activityReads,receiptWrites,rescueReads},beforeBell,'Marking the bell affects no server state or tab counters');
    await page.getByRole('button',{name:'Cerrar notificaciones',exact:true}).click();
    checked(await service.from('postulaciones').insert({articulo_id:articles[0],usuario_id:applicant.user.id,justificacion:'Segunda solicitud temporal.'}));
    await page.evaluate(()=>window.advanceNotificationCache());
    await page.getByRole('button',{name:'Notificaciones',exact:true}).click();await badge(pub).filter({hasText:/^2$/}).waitFor();
    await page.getByRole('button',{name:'Cerrar notificaciones',exact:true}).click();assert.equal(inboxReads,0);assert.equal(rescueReads,0);
    await inbox.click();await page.getByText(title,{exact:true}).waitFor();await page.waitForLoadState('networkidle');
    assert.equal(inboxReads,1);assert.equal(await badge(inbox).innerText(),'1','Bell and loaded receipt are counted once');
    const before={activityReads,inboxReads};
    const checkBellRead=async read=>{
      await page.getByRole('button',{name:'Notificaciones',exact:true}).click();
      const entry=page.getByRole('menu',{name:'Notificaciones',exact:true}).getByRole('menuitem').filter({hasText:title});
      assert.equal(await entry.getAttribute('data-read'),String(read));
      await page.getByRole('button',{name:'Cerrar notificaciones',exact:true}).click();
    };
    await page.getByTitle('Marcar como leído',{exact:true}).click();await badge(inbox).waitFor({state:'hidden'});
    await checkBellRead(true);
    await page.getByTitle('Marcar como no leído',{exact:true}).click();await badge(inbox).waitFor();assert.equal(await badge(inbox).innerText(),'1');
    await checkBellRead(true);
    assert.deepEqual({activityReads,inboxReads},before,'Receipt actions update badges locally without refetches');assert.equal(receiptWrites,2);
    if(width===1440){page.once('dialog',dialog=>dialog.accept());await page.getByTitle('Borrar mensaje',{exact:true}).click();await badge(inbox).waitFor({state:'hidden'});}
    await pub.click();assert.equal(await badge(pub).innerText(),'2');assert.equal(await badge(rescue).innerText(),'1');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
    console.log(`OK ${width}px: shared badge updates, bell-only marking leaves menus untouched, no extra requests.`);await context.close();
  }
}finally{
  await browser.close();
  checked(await service.from('system_message_receipts').delete().eq('message_id',messageId));
  checked(await service.from('system_messages').delete().eq('id',messageId));
  if(articles.length)checked(await service.from('articulos').delete().in('id',articles));
  for(const id of users)checked(await service.auth.admin.deleteUser(id));
}
