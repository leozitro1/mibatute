import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
import { localStatus } from './seed-applicants-local.mjs';
import { bogotaDate } from '../src/components/pickupAgreement.js';

const { chromium } = createRequire(import.meta.url)('playwright');
const config = localStatus();
const appUrl = process.env.LOCAL_APP_URL || 'http://127.0.0.1:5174';
assert.ok(['localhost','127.0.0.1'].includes(new URL(appUrl).hostname));
const options = {auth:{persistSession:false,autoRefreshToken:false}};
const service = createClient(config.API_URL, config.SERVICE_ROLE_KEY, options);
const checked = ({data,error}) => {if(error)throw error;return data;};
const clients=[],users=[],articles=[],views=[];
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});
async function account() {
  const email=`market-${randomUUID()}@example.com`, password=randomUUID();
  const {user}=checked(await service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{nombre:'Prueba en vivo'},app_metadata:{local_fixture:'market-realtime'}}));users.push(user.id);
  const client=createClient(config.API_URL,config.ANON_KEY,options);clients.push(client);
  const {session}=checked(await client.auth.signInWithPassword({email,password}));return{user,client,session};
}
async function open(member) {
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:member.client.auth.storageKey,session:member.session});
  const page=await context.newPage(),requests=[],errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{const url=new URL(request.url());if(url.origin===new URL(config.API_URL).origin&&url.pathname.startsWith('/rest/'))requests.push({path:url.pathname,method:request.method(),url:request.url()});});
  await page.goto(appUrl);await page.getByRole('button',{name:'Notificaciones',exact:true}).waitFor();
  await page.waitForFunction(async()=>{const{ supabase }=await import('/src/supabase/supabaseClient.js');return supabase.getChannels().some(channel=>channel.topic.includes('mb:inbox:user:')&&channel.state==='joined');});
  await page.waitForLoadState('networkidle');
  const view={context,page,requests,errors};views.push(view);return view;
}
async function until(predicate,description) {
  const deadline=Date.now()+12_000;
  while(Date.now()<deadline){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,100));}
  throw new Error(`Timeout: ${description}`);
}
async function bell(view,text) {
  await view.page.getByRole('button',{name:'Notificaciones',exact:true}).click();
  await view.page.getByRole('menu',{name:'Notificaciones',exact:true}).getByText(text,{exact:true}).waitFor();
}
try {
  const seller=await account(), buyer=await account(), stranger=await account();
  const article=checked(await service.from('articulos').insert({owner_id:seller.user.id,title:'Donación para prueba de tiempo real',mode:'donacion',city:'Bogotá',category:'Hogar & Muebles',estado_producto:8,status:'disponible',estado:'disponible'}).select('id').single());articles.push(article.id);
  const owner=await open(seller), recipient=await open(buyer), outsider=await open(stranger);
  for(const view of views)view.requests.length=0;
  checked(await service.from('postulaciones').insert({articulo_id:article.id,usuario_id:buyer.user.id,justificacion:'JUSTIFICACIÓN PRIVADA'}));
  await bell(owner,'Solicitudes recibidas');
  await owner.page.getByRole('button',{name:'Cerrar notificaciones',exact:true}).click();
  assert.equal(owner.requests.filter(r=>r.path.includes('notification_activity_feed')||r.path.endsWith('/postulaciones')).length,0,'An application updates the bell without rereading notifications/applicants');
  await outsider.page.getByRole('button',{name:'Notificaciones',exact:true}).click();
  assert.equal(await outsider.page.getByRole('menu',{name:'Notificaciones',exact:true}).getByText('Solicitudes recibidas',{exact:true}).count(),0);
  await outsider.page.getByRole('button',{name:'Cerrar notificaciones',exact:true}).click();
  checked(await seller.client.from('articulos').update({ganador_id:buyer.user.id,status:'reservado',estado:'reservado'}).eq('id',article.id));
  const chat=checked(await buyer.client.from('chats').select('id').eq('articulo_id',article.id).single());
  await bell(recipient,'Tu postulación fue elegida');
  await recipient.page.getByRole('menu',{name:'Notificaciones',exact:true}).getByText('Tu postulación fue elegida',{exact:true}).click();
  await recipient.page.getByPlaceholder('Escribe un mensaje...').waitFor();
  await recipient.page.waitForLoadState('networkidle');
  recipient.requests.length=0;
  await recipient.page.getByPlaceholder('Escribe un mensaje...').fill('Hola desde la prueba');
  await recipient.page.getByRole('button',{name:'Enviar',exact:true}).click();
  await recipient.page.getByText('Hola desde la prueba',{exact:true}).waitFor();
  await until(()=>recipient.requests.some(r=>r.path.endsWith('/chat_messages')&&r.method==='POST'),'message persisted');
  await recipient.page.waitForLoadState('networkidle');
  assert.equal(recipient.requests.filter(r=>r.method==='GET'&&(r.path.endsWith('/chats')||r.path.endsWith('/usuarios')||r.path.endsWith('/usuarios_publicos'))).length,0,'Sending does not preflight the chat/profile');
  await bell(owner,'Mensajes recibidos');
  await owner.page.getByRole('menu',{name:'Notificaciones',exact:true}).getByText('Mensajes recibidos',{exact:true}).click();
  await owner.page.getByText('Hola desde la prueba',{exact:true}).waitFor();
  await owner.page.waitForLoadState('networkidle');
  owner.requests.length=0;recipient.requests.length=0;
  await recipient.page.getByPlaceholder('Escribe un mensaje...').fill('Segundo mensaje sin consultas');
  await recipient.page.getByRole('button',{name:'Enviar',exact:true}).click();
  await owner.page.getByText('Segundo mensaje sin consultas',{exact:true}).waitFor();
  await owner.page.waitForLoadState('networkidle');
  assert.equal(owner.requests.filter(r=>r.method==='GET'||r.path.includes('/rpc/notification')).length,0,'Incoming message triggers no HTTP read');
  assert.equal(await owner.page.getByText('Segundo mensaje sin consultas',{exact:true}).count(),1);
  // A pickup change carries its row; neither participant rereads the history.
  owner.requests.length=0;recipient.requests.length=0;
  const pickup=checked(await buyer.client.rpc('propose_chat_pickup',{p_chat_id:chat.id,
    p_date:bogotaDate(new Date(Date.now()+86400000)),p_start:'10:00',p_end:'11:00',p_replace_id:null}));
  await owner.page.getByText('Propuesta por la otra persona',{exact:true}).waitFor();
  await owner.page.getByRole('button',{name:'Confirmar',exact:true}).click();
  await recipient.page.getByText('Confirmada por ambas personas',{exact:true}).waitFor();
  assert.equal(checked(await buyer.client.from('chat_pickups').select('status').eq('id',pickup.id).single()).status,'confirmed');
  assert.equal(views.flatMap(view=>view.requests).filter(r=>r.method==='GET'&&r.path.endsWith('/chat_pickups')).length,0,'Pickup events do not query history');
  // Pause the actual WebSocket, commit a message, and rejoin without a page reload.
  const recoveryBefore=Number(await owner.page.locator('[data-realtime-revision]').getAttribute('data-realtime-revision'));
  await owner.page.evaluate(async()=>{const{supabase}=await import('/src/supabase/supabaseClient.js');supabase.realtime.disconnect();});
  checked(await buyer.client.from('chat_messages').insert({chat_id:chat.id,sender_id:buyer.user.id,body:'Mensaje durante desconexión'}));
  await owner.page.evaluate(async()=>{const{supabase}=await import('/src/supabase/supabaseClient.js');supabase.realtime.connect();});
  await owner.page.getByText('Mensaje durante desconexión',{exact:true}).waitFor({timeout:20_000});
  await owner.page.waitForFunction(before=>Number(document.querySelector('[data-realtime-revision]').dataset.realtimeRevision)>before,recoveryBefore,{timeout:20_000});
  await owner.page.waitForLoadState('networkidle');
  const reads=owner.requests.filter(r=>r.method==='GET'&&r.path.endsWith('/chat_messages'));
  assert.ok(reads.some(r=>new URL(r.url).searchParams.get('or')),'Catch-up requests use the last persisted cursor');
  // Public catalog changes display a hint without downloading the catalog.
  outsider.requests.length=0;
  const second=checked(await service.from('articulos').insert({owner_id:seller.user.id,title:'Novedad en catálogo',mode:'donacion',city:'Bogotá',category:'Hogar & Muebles',estado_producto:8,status:'disponible',estado:'disponible'}).select('id').single());articles.push(second.id);
  await outsider.page.getByText('Hay novedades en las publicaciones.',{exact:true}).waitFor();
  assert.equal(outsider.requests.filter(r=>r.path.includes('home_article_page')||r.path.endsWith('/articulos')).length,0);
  await owner.page.getByRole('button',{name:'Volver',exact:true}).click();
  await recipient.page.getByRole('button',{name:'Volver',exact:true}).click();
  const sale=checked(await service.from('articulos').insert({owner_id:seller.user.id,title:'Venta para avisos en vivo',mode:'venta',price:10000,city:'Bogotá',estado_producto:8,status:'disponible',estado:'disponible'}).select('id').single());articles.push(sale.id);
  owner.requests.length=0;recipient.requests.length=0;
  checked(await buyer.client.rpc('transition_sale',{p_articulo_id:sale.id,p_action:'reserve'}));
  await bell(owner,'Venta pendiente');
  await owner.page.getByRole('button',{name:'Cerrar notificaciones',exact:true}).click();
  checked(await seller.client.rpc('transition_sale',{p_articulo_id:sale.id,p_action:'approve_chat'}));
  await bell(recipient,'Compra aprobada');
  await recipient.page.getByRole('button',{name:'Cerrar notificaciones',exact:true}).click();
  assert.equal(views.flatMap(view=>view.requests).filter(r=>r.path.includes('/rpc/notification')).length,0,'Sale notices do not refetch the feed');
  checked(await service.from('cupos').upsert({usuario_id:seller.user.id,saldo:7}));
  await owner.page.getByText('7',{exact:true}).waitFor();
  for(const view of views){assert.deepEqual(view.errors,[]);view.requests.length=0;}
  await new Promise(resolve=>setTimeout(resolve,2500));
  const idleReads=views.flatMap(view=>view.requests).filter(r=>r.method==='GET'||r.path.includes('/rpc/notification'));
  assert.deepEqual(idleReads,[],'No HTTP reads while idle');
  console.log('OK: private live applications, chat and activity; zero notification reads per event; one insert per send; pickup updates without reads; sale/balance notices; cursor reconnect; catalog hints without refetch; no idle reads; no browser errors.');
} finally {
  for(const view of views)await view.context.close();await browser.close();
  for(const client of clients){await client.removeAllChannels();client.realtime.disconnect();}
  if(articles.length)checked(await service.from('articulos').delete().in('id',articles));
  for(const user of users)checked(await service.auth.admin.deleteUser(user));
}
