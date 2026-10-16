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
const fixture=`Bloqueo ${Date.now()}`,users=[],clients=[],articles=[];
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});
function totp(secret) {
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const char of secret.toUpperCase().replace(/=+$/,''))bits+=alphabet.indexOf(char).toString(2).padStart(5,'0');
  const key=Buffer.from(bits.match(/.{8}/g).map(value=>parseInt(value,2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const digest=createHmac('sha1',key).update(counter).digest(),offset=digest.at(-1)&15;return((digest.readUInt32BE(offset)&0x7fffffff)%1000000).toString().padStart(6,'0');
}
async function account(role) {
  const email=`block-${randomUUID()}@example.com`,password=randomUUID();
  const {user}=checked(await service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{nombre:`${fixture} ${role}`}}));users.push(user.id);
  const client=createClient(config.API_URL,config.ANON_KEY,options);clients.push(client);
  let{session}=checked(await client.auth.signInWithPassword({email,password}));
  if(role!=='member') {
    checked(await service.from('staff_accounts').insert({user_id:user.id,role,permissions:['users'],active:true}));
    const factor=checked(await client.auth.mfa.enroll({factorType:'totp',friendlyName:'Disposable block test'}));
    session=checked(await client.auth.mfa.challengeAndVerify({factorId:factor.id,code:totp(factor.totp.secret)}));checked(await client.rpc('staff_open_session'));
  }
  return{user,client,session};
}
try {
  const member=await account('member');
  checked(await service.from('cupos').upsert({usuario_id:member.user.id,saldo:7}));
  const listing=checked(await member.client.from('articulos').insert({owner_id:member.user.id,title:`${fixture} anuncio`,mode:'venta',price:1000,city:'Bogotá',locality:'Chapinero',status:'disponible',estado:'disponible',is_featured:true}).select('id').single()).id;articles.push(listing);
  const anonymous=createClient(config.API_URL,config.ANON_KEY,options);clients.push(anonymous);
  for(const role of ['admin','master']) {
    const actor=await account(role);
    for(const width of [320,1440]) {
      const context=await browser.newContext({viewport:{width,height:900}});
      await context.addInitScript(session=>localStorage.setItem('mb-staff-auth',JSON.stringify(session)),actor.session);
      const page=await context.newPage(),errors=[];let blockCalls=0;
      page.on('pageerror',error=>errors.push(error.message));
      page.on('request',request=>{if(request.url().includes('/rpc/staff_block_user'))blockCalls++;});
      await page.goto(`${appUrl}/gestion/${role==='master'?'direccion':'operaciones'}`);await page.getByRole('heading',{name:'Pendientes',exact:true}).waitFor();
      if(width<768)await page.getByRole('button',{name:'Abrir menú',exact:true}).click();
      await page.getByRole('button',{name:'Usuarios',exact:true}).click();await page.getByRole('textbox',{name:'Buscar en el panel'}).fill(fixture);
      const row=page.locator('tbody tr').filter({hasText:`${fixture} member`});await row.getByRole('button',{name:'Enviar mensaje',exact:true}).waitFor();
      assert.ok(await row.locator('.staff-user-actions').evaluate(el=>new Set([...el.querySelectorAll('button')].map(button=>Math.round(button.getBoundingClientRect().top))).size<=2));
      const block=row.getByRole('button',{name:'Bloquear permanentemente',exact:true});
      if(role==='admin')assert.equal(await block.count(),0);
      else {
        const sale=checked(await actor.client.from('articulos').insert({owner_id:actor.user.id,title:`${fixture} compra ${width}`,mode:'venta',price:1000,city:'Bogotá',locality:'Chapinero',status:'disponible',estado:'disponible'}).select('id').single()).id;articles.push(sale);
        checked(await member.client.rpc('transition_sale',{p_articulo_id:sale,p_action:'reserve'}));
        checked(await actor.client.rpc('transition_sale',{p_articulo_id:sale,p_action:'approve_chat'}));
        const chat=checked(await service.from('chats').select('id,status').eq('articulo_id',sale).eq('buyer_id',member.user.id).single());assert.equal(chat.status,'open');
        const memberContext=await browser.newContext({viewport:{width,height:900}});
        await memberContext.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:member.client.auth.storageKey,session:member.session});
        const memberPage=await memberContext.newPage();await memberPage.goto(appUrl);await memberPage.getByRole('button',{name:'Ver perfil',exact:true}).waitFor();
        await memberPage.waitForFunction(async()=>{const {supabase}=await import('/src/supabase/supabaseClient.js');return supabase.getChannels().filter(channel=>channel.topic.includes('mb:inbox:')).every(channel=>channel.state==='joined')&&supabase.getChannels().length>=2;});
        assert.equal(checked(await anonymous.from('articulos').select('id').eq('id',listing)).length,1);
        await block.click();const dialog=page.getByRole('dialog');await dialog.getByText(/Este bloqueo es permanente/).waitFor();
        assert.equal(await dialog.evaluate(el=>el.scrollWidth>el.clientWidth),false);
        const confirm=dialog.getByRole('button',{name:'Bloquear permanentemente y notificar',exact:true});assert.equal(await confirm.isDisabled(),true);
        await dialog.getByLabel('Motivo',{exact:true}).fill('Mal uso reiterado de prueba local');
        const response=page.waitForResponse(value=>value.url().includes('/rpc/staff_block_user'));await confirm.click();assert.ok((await response).ok());
        await dialog.waitFor({state:'hidden'});await row.getByText('Bloqueado',{exact:true}).waitFor();assert.equal(blockCalls,1);assert.equal(await block.isDisabled(),true);
        const state=checked(await service.from('usuarios').select('is_blocked,bloqueado,ban_until').eq('id',member.user.id).single());
        assert.deepEqual(state,{is_blocked:true,bloqueado:true,ban_until:null});
        await memberPage.getByRole('button',{name:'Cuenta bloqueada',exact:true}).first().waitFor();assert.equal(await memberPage.getByRole('button',{name:'Cuenta bloqueada',exact:true}).first().isDisabled(),true);
        let topupCalls=0;memberPage.on('request',request=>{if(request.url().includes('/api/wompi-checkout'))topupCalls++;});
        await memberPage.getByRole('button',{name:'Ver perfil',exact:true}).click();
        await memberPage.getByText('Créditos bloqueados',{exact:true}).waitFor();
        const topup=memberPage.getByRole('button',{name:'Recargar con Wompi',exact:true});assert.equal(await topup.isDisabled(),true);
        await memberPage.getByText(/Para solicitar la devolución de créditos comprados/).waitFor();
        const ownListing=memberPage.locator(`[data-profile-article-id="${listing}"]`);await ownListing.waitFor();
        for(const action of await ownListing.locator('[data-profile-actions] button').all())assert.equal(await action.isDisabled(),true);
        assert.equal(checked(await member.client.from('articulos').select('id').eq('id',listing)).length,1);
        assert.equal(checked(await service.from('cupos').select('saldo').eq('usuario_id',member.user.id).single()).saldo,7);
        assert.equal(topupCalls,0);assert.equal(await memberPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        assert.equal(checked(await anonymous.from('articulos').select('id').eq('id',listing)).length,0);
        const catalog=checked(await anonymous.rpc('home_article_page',{p_filters:{city:'Bogotá',search:fixture,onlyActive:false},p_page:1}));assert.ok(!JSON.stringify(catalog).includes(listing));
        assert.equal(checked(await service.from('chats').select('status').eq('id',chat.id).single()).status,'closed');
        assert.ok((await actor.client.from('chat_messages').insert({chat_id:chat.id,sender_id:actor.user.id,body:'Mensaje no permitido'})).error);
        await row.getByRole('button',{name:'Restablecer usuario',exact:true}).click();await dialog.getByLabel('Motivo',{exact:true}).fill('Restablecimiento de prueba local');
        await dialog.getByRole('button',{name:'Confirmar',exact:true}).click();await dialog.waitFor({state:'hidden'});await row.getByText('Activo',{exact:true}).waitFor();
        assert.equal(checked(await service.from('chats').select('status').eq('id',chat.id).single()).status,'closed');await memberContext.close();
      }
      assert.deepEqual(errors,[]);console.log(`OK ${role} ${width}px: role visibility, confirmation, permanent block and restoration.`);await context.close();
    }
  }
} finally {
  await browser.close();for(const client of clients){await client.removeAllChannels();client.realtime.disconnect();}
  if(articles.length)checked(await service.from('articulos').delete().in('id',articles));
  if(users.length){checked(await service.from('system_messages').delete().in('sender_id',users));checked(await service.from('activity_notifications').delete().in('recipient_id',users));checked(await service.from('staff_audit').delete().in('actor_id',users));}
  for(const id of users)checked(await service.auth.admin.deleteUser(id));
}
