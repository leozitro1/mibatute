import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { localStatus } from './seed-applicants-local.mjs';

const {chromium}=createRequire(import.meta.url)('playwright'),config=localStatus();
const options={auth:{persistSession:false,autoRefreshToken:false}};
const appUrl=process.env.LOCAL_APP_URL||'http://127.0.0.1:5174';assert.ok(['localhost','127.0.0.1'].includes(new URL(appUrl).hostname));
const service=createClient(config.API_URL,config.SERVICE_ROLE_KEY,options),users=[],articles=[];
const checked=({data,error})=>{if(error)throw error;return data;};
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});
async function account(nombre){
  const email=`sale-actions-${randomUUID()}@example.com`,password=randomUUID();
  const {user}=checked(await service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{nombre}}));users.push(user.id);
  const client=createClient(config.API_URL,config.ANON_KEY,options),{session}=checked(await client.auth.signInWithPassword({email,password}));return{user,client,session};
}
try{
  const seller=await account('Vendedor temporal'),buyer=await account('Comprador temporal de prueba');
  for(const approved of [false,true]){
    const article=checked(await seller.client.from('articulos').insert({owner_id:seller.user.id,title:`Venta temporal ${approved?'aprobada':'pendiente'}`,mode:'venta',price:1000,
      city:'Bogotá',locality:'Chapinero',status:'disponible',estado:'disponible',estado_producto:8}).select('id').single()).id;articles.push(article);
    checked(await buyer.client.rpc('transition_sale',{p_articulo_id:article,p_action:'reserve'}));
    if(approved)checked(await seller.client.rpc('transition_sale',{p_articulo_id:article,p_action:'approve_chat'}));
  }
  for(const [width,height]of [[320,568],[390,844],[768,900],[1440,1000]]){
    const context=await browser.newContext({viewport:{width,height}});
    await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:seller.client.auth.storageKey,session:seller.session});
    const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(appUrl);await page.getByRole('button',{name:'Ver perfil',exact:true}).click();
    for(const [index,article]of articles.entries()){
      await page.locator(`[data-profile-article-id="${article}"]`).locator('img').first().click();
      const dialog=page.getByRole('dialog',{name:`Venta temporal ${index?'aprobada':'pendiente'}`,exact:true});await dialog.locator('[data-sale-actions]').waitFor();
      const chat=dialog.getByRole('button',{name:'Abrir chat',exact:true}),deliver=dialog.getByRole('button',{name:'Marcar entregado',exact:true}),cancel=dialog.getByRole('button',{name:'Cancelar venta',exact:true});
      await cancel.scrollIntoViewIfNeeded();assert.equal(await cancel.isDisabled(),index===1);
      const boxes=await dialog.locator('[data-sale-actions] button').evaluateAll(elements=>elements.map(el=>{const r=el.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,height:r.height};}));
      assert.equal(boxes.length,3);assert.ok(boxes.every(box=>box.height>=44&&box.left>=0&&box.right<=width));
      assert.ok(boxes[1].right<=boxes[2].left);assert.equal(boxes[1].top,boxes[2].top);
      if(width<640)assert.ok(boxes[0].bottom<=boxes[1].top);else assert.equal(boxes[0].top,boxes[1].top);
      assert.equal(await chat.locator('svg').count(),1);assert.equal(await deliver.locator('svg').count(),1);assert.equal(await cancel.locator('svg').count(),1);
      assert.equal(await cancel.evaluate(el=>getComputedStyle(el).color),'rgb(180, 35, 24)');
      assert.equal(await dialog.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&el.scrollWidth<=el.clientWidth;}),true);
      let confirmation;page.once('dialog',async prompt=>{confirmation=prompt.type();await prompt.dismiss();});await deliver.click();assert.equal(confirmation,'confirm');
      assert.equal(checked(await seller.client.from('articulos').select('status').eq('id',article).single()).status,'reservado');
      if(width===1440&&index===0){await cancel.click();await dialog.waitFor({state:'hidden'});assert.equal(checked(await seller.client.from('articulos').select('status').eq('id',article).single()).status,'disponible');}
      else{await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});}
    }
    assert.deepEqual(errors,[]);console.log(`OK ${width}x${height}: consistent icons, 44px actions, responsive rows, delivery confirmation and approved-sale cancellation lock.`);await context.close();
  }
}finally{
  await browser.close();if(articles.length){checked(await service.from('articulos').delete().in('id',articles));checked(await service.from('activity_notifications').delete().in('articulo_id',articles));}
  for(const user of users)checked(await service.auth.admin.deleteUser(user));
}
