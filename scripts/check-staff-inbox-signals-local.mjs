import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHmac,randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { localStatus } from './seed-applicants-local.mjs';

const {chromium}=createRequire(import.meta.url)('playwright'),config=localStatus();
const appUrl=process.env.LOCAL_APP_URL||'http://127.0.0.1:5174';assert.ok(['localhost','127.0.0.1'].includes(new URL(appUrl).hostname));
const options={auth:{persistSession:false,autoRefreshToken:false}},service=createClient(config.API_URL,config.SERVICE_ROLE_KEY,options);
const checked=({data,error})=>{if(error)throw error;return data;},users=[],messages=[],contexts=[],clients=[];
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});
function totp(secret){
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const char of secret.toUpperCase().replace(/=+$/,''))bits+=alphabet.indexOf(char).toString(2).padStart(5,'0');
  const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const digest=createHmac('sha1',Buffer.from(bits.match(/.{8}/g).map(value=>parseInt(value,2)))).update(counter).digest(),offset=digest.at(-1)&15;
  return ((digest.readUInt32BE(offset)&0x7fffffff)%1000000).toString().padStart(6,'0');
}
async function account(master=false){
  const email=`signals-${randomUUID()}@example.com`,password=randomUUID();
  const {user}=checked(await service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{nombre:'Prueba de avisos'},app_metadata:{local_fixture:'staff-inbox-signals'}}));users.push(user.id);
  const client=createClient(config.API_URL,config.ANON_KEY,options);clients.push(client);let{session}=checked(await client.auth.signInWithPassword({email,password}));
  if(master){
    checked(await service.from('staff_accounts').insert({user_id:user.id,role:'master',active:true}));
    const factor=checked(await client.auth.mfa.enroll({factorType:'totp',friendlyName:'Signals test'}));
    session=checked(await client.auth.mfa.challengeAndVerify({factorId:factor.id,code:totp(factor.totp.secret)}));checked(await client.rpc('staff_open_session'));
  }
  return{user,client,session};
}
async function open(member,width){
  const context=await browser.newContext({viewport:{width,height:900}});contexts.push(context);
  await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:member.client.auth.storageKey,session:member.session});
  const page=await context.newPage(),errors=[],frames=[];const counts={inbox:0,feed:0};
  page.on('pageerror',error=>errors.push(error.message));page.on('websocket',socket=>socket.on('framereceived',event=>frames.push(String(event.payload))));
  page.on('request',request=>{if(request.url().includes('/rpc/notification_inbox'))counts.inbox++;if(request.url().includes('/rpc/notification_activity_feed'))counts.feed++;});
  await page.goto(appUrl);await page.getByRole('button',{name:'Ver perfil',exact:true}).click();
  await page.waitForFunction(async()=>{
    const {supabase}=await import('/src/supabase/supabaseClient.js');
    const channels=supabase.getChannels().filter(channel=>channel.topic.includes('mb:inbox:'));return channels.length===2&&channels.every(channel=>channel.state==='joined');
  },null,{timeout:20_000});
  await page.waitForLoadState('networkidle');
  return{page,context,errors,frames,counts,baselineFeed:counts.feed,inbox:page.locator('.profile-tabs button').nth(2)};
}
const expectBadge=async(view,count)=>{
  const badge=view.inbox.locator('.bg-red-600');
  if(!count)assert.equal(await badge.count(),0);else await badge.filter({hasText:new RegExp(`^${count}$`)}).waitFor();
};
try{
  const actor=await account(true),member=await account(),outsider=await account();
  const mobile=await open(member,390),desktop=await open(member,1440),other=await open(outsider,390);
  const send=async(title,all=false,audience=null)=>{
    const ids=all?[]:[member.user.id],prepared=audience||checked(await actor.client.rpc('staff_prepare_message',{p_all:all,p_ids:ids}));
    const request=randomUUID(),body=`Contenido privado ${randomUUID()}`;
    const args={p_request:request,p_all:all,p_ids:ids,p_cutoff:prepared.cutoff,p_expected:prepared.count,p_title:title,p_body:body};
    const result=checked(await actor.client.rpc('staff_send_message',args));messages.push(request);return{result,args,body};
  };
  const first=await send('Asunto privado de prueba');
  for(const view of[mobile,desktop]){
    await expectBadge(view,1);assert.equal(view.counts.inbox,0);assert.equal(view.counts.feed,view.baselineFeed,'Realtime signal triggers no metadata refetch');
    assert.ok(!view.frames.join('').includes(first.body));assert.ok(!view.frames.join('').includes('Asunto privado de prueba'));
    await view.page.getByRole('button',{name:'Notificaciones',exact:true}).click();
    await view.page.getByRole('menu',{name:'Notificaciones',exact:true}).getByText('Mensaje de MiBatute',{exact:true}).waitFor();
    await view.page.getByRole('button',{name:'Cerrar notificaciones',exact:true}).click();assert.equal(view.counts.inbox,0);
  }
  await expectBadge(other,0);checked(await actor.client.rpc('staff_send_message',first.args));
  await send('Segundo mensaje privado');for(const view of[mobile,desktop]){await expectBadge(view,2);assert.equal(view.counts.inbox,0);}
  await mobile.inbox.click();await mobile.page.getByText('Segundo mensaje privado',{exact:true}).waitFor();assert.equal(mobile.counts.inbox,1);
  const third=await send('Tercer mensaje privado');await expectBadge(mobile,3);assert.equal(mobile.counts.inbox,1,'A notice arriving in an open inbox does not download a body');
  assert.equal(await mobile.page.getByText('Tercer mensaje privado',{exact:true}).count(),0);
  await mobile.inbox.click();await mobile.page.getByText('Tercer mensaje privado',{exact:true}).waitFor();assert.equal(mobile.counts.inbox,2);
  await mobile.page.getByText('Tercer mensaje privado',{exact:true}).click();await mobile.page.getByText(third.body,{exact:true}).waitFor();await mobile.page.getByRole('button',{name:'Cerrar aviso',exact:true}).click();
  const prepared=checked(await actor.client.rpc('staff_prepare_message',{p_all:true,p_ids:[]}));
  const late=await account(),lateView=await open(late,390);
  const general=await send('Asunto general privado',true,prepared);await expectBadge(other,1);await expectBadge(desktop,4);await expectBadge(lateView,0);
  assert.equal(checked(await service.from('staff_message_recipients').select('user_id').eq('message_id',general.result.id)).length,0);
  assert.ok(!checked(await late.client.rpc('notification_activity_feed')).some(item=>item.receipt_id===general.result.id));
  assert.ok(!other.frames.join('').includes(general.body));assert.equal(other.counts.inbox,0);assert.equal(other.counts.feed,other.baselineFeed);
  for(const view of[mobile,desktop,other,lateView]){assert.deepEqual(view.errors,[]);assert.equal(await view.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  // No client permission to join another recipient's private topic.
  await outsider.client.realtime.setAuth();const denied=outsider.client.channel(`mb:inbox:user:${member.user.id}`,{config:{private:true}});
  const status=await new Promise(resolve=>{const timer=setTimeout(()=>resolve('timeout'),8000);denied.subscribe(value=>{if(['CHANNEL_ERROR','TIMED_OUT','SUBSCRIBED'].includes(value)){clearTimeout(timer);resolve(value);}});});
  assert.notEqual(status,'SUBSCRIBED');assert.notEqual(status,'timeout');await outsider.client.removeChannel(denied);
  console.log('OK: real admin sends update mobile/desktop bell and inbox badge; no body queries until entry; targeted privacy; one general signal; cutoff; no duplicate retry; no extra metadata fetches.');
}finally{
  for(const client of clients){await client.removeAllChannels();client.realtime.disconnect();}
  for(const context of contexts)await context.close();await browser.close();
  if(messages.length)checked(await service.from('staff_messages').delete().in('id',messages));
  if(users.length){checked(await service.from('staff_messages').delete().in('sender_id',users));checked(await service.from('staff_audit').delete().in('actor_id',users));}
  for(const user of users)checked(await service.auth.admin.deleteUser(user));
}
