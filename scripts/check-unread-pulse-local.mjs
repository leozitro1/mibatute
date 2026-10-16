import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { localStatus } from './seed-applicants-local.mjs';

const {chromium}=createRequire(import.meta.url)('playwright'),config=localStatus();
const options={auth:{persistSession:false,autoRefreshToken:false}},appUrl=process.env.LOCAL_APP_URL||'http://127.0.0.1:5174';
assert.ok(['localhost','127.0.0.1'].includes(new URL(appUrl).hostname));
const service=createClient(config.API_URL,config.SERVICE_ROLE_KEY,options),users=[];
const checked=({data,error})=>{if(error)throw error;return data;};let article;
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});
async function account(){
  const email=`unread-pulse-${randomUUID()}@example.com`,password=randomUUID();
  const {user}=checked(await service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{nombre:'Prueba de mensajes'}}));users.push(user.id);
  const client=createClient(config.API_URL,config.ANON_KEY,options),{session}=checked(await client.auth.signInWithPassword({email,password}));return{user,client,session};
}
try{
  const seller=await account(),buyer=await account();
  article=checked(await seller.client.from('articulos').insert({owner_id:seller.user.id,title:'Venta temporal para avisos de chat',mode:'venta',price:1000,
    city:'Bogotá',locality:'Chapinero',status:'disponible',estado:'disponible',estado_producto:8}).select('id').single()).id;
  checked(await buyer.client.rpc('transition_sale',{p_articulo_id:article,p_action:'reserve'}));
  const {chat}=checked(await seller.client.rpc('transition_sale',{p_articulo_id:article,p_action:'approve_chat'}));
  for(const [member,tab,sender]of [[seller,'Mis Publicaciones',buyer],[buyer,'Mis Rescates',seller]]){
    for(const [width,reduced]of [[320,false],[390,true],[1440,false]]){
      checked(await sender.client.from('chat_messages').insert({chat_id:chat.id,sender_id:sender.user.id,body:`Mensaje temporal ${tab} ${width}`}));
      const context=await browser.newContext({viewport:{width,height:900},reducedMotion:reduced?'reduce':'no-preference'});
      await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:member.client.auth.storageKey,session:member.session});
      const page=await context.newPage(),errors=[];let reads=0;
      page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{const url=new URL(request.url());if(url.pathname.startsWith('/rest/v1/')&&!url.pathname.endsWith('/record_market_metrics'))reads++;});
      await page.goto(appUrl);await page.getByRole('button',{name:'Ver perfil',exact:true}).click();
      if(tab==='Mis Rescates')await page.getByRole('button',{name:tab,exact:true}).click();
      const row=page.locator(`[data-profile-article-id="${article}"]`),dot=row.locator('.profile-unread-dot');await dot.waitFor();
      const motion=await dot.evaluate(el=>{const s=getComputedStyle(el,'::after'),r=el.getBoundingClientRect();return{name:s.animationName,duration:s.animationDuration,iterations:s.animationIterationCount,width:r.width,height:r.height};});
      assert.equal(motion.name,reduced?'none':'profile-unread-attention');assert.equal(motion.width,12);assert.equal(motion.height,12);
      if(!reduced){assert.equal(motion.duration,'1.4s');assert.equal(motion.iterations,'3');}
      await page.waitForLoadState('networkidle');const before=reads;await page.waitForTimeout(4500);
      assert.equal(reads,before,'The pulse never fetches data');assert.equal(await dot.isVisible(),true);
      assert.equal(await dot.evaluate(el=>el.getAnimations({subtree:true}).filter(a=>a.playState==='running').length),0);
      await row.getByRole('button',{name:'Ver mensajes',exact:true}).click();await dot.waitFor({state:'hidden'});
      assert.deepEqual(errors,[]);console.log(`OK ${tab} ${width}px: finite pulse, reduced motion=${reduced}, stable dot, no requests and cleared on chat read.`);await context.close();
    }
  }
}finally{
  await browser.close();if(article){checked(await service.from('articulos').delete().eq('id',article));checked(await service.from('activity_notifications').delete().eq('articulo_id',article));}
  for(const user of users)checked(await service.auth.admin.deleteUser(user));
}
