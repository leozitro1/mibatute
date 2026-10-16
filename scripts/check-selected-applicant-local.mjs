import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { localStatus } from './seed-applicants-local.mjs';

const {chromium}=createRequire(import.meta.url)('playwright'),config=localStatus(),options={auth:{persistSession:false,autoRefreshToken:false}};
const appUrl=process.env.LOCAL_APP_URL||'http://127.0.0.1:5174';assert.ok(['localhost','127.0.0.1'].includes(new URL(appUrl).hostname));
const service=createClient(config.API_URL,config.SERVICE_ROLE_KEY,options),users=[];
const checked=({data,error})=>{if(error)throw error;return data;};let article;
const title='Silla para donar - prueba de entrega';
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});
async function account(nombre){
  const email=`delivery-ui-${randomUUID()}@example.com`,password=randomUUID();
  const {user}=checked(await service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{nombre},app_metadata:{local_fixture:'selected-applicant'}}));users.push(user.id);
  const client=createClient(config.API_URL,config.ANON_KEY,options),{session}=checked(await client.auth.signInWithPassword({email,password}));return{user,client,session};
}
try{
  const owner=await account('Donante de prueba'),winner=await account('Camila Andrea Fernandez Restrepo');
  article=checked(await owner.client.from('articulos').insert({owner_id:owner.user.id,title,description:'Prueba temporal del bloque de entrega.',mode:'donacion',price:0,
    city:'Bogotá',locality:'Chapinero',status:'disponible',estado:'disponible',estado_producto:8}).select('id').single()).id;
  checked(await service.from('postulaciones').insert({articulo_id:article,usuario_id:winner.user.id,justificacion:'Me interesa para mi estudio y puedo recogerla esta semana. Gracias por compartirla.\nPodemos acordar la entrega por el chat de la plataforma.'}));
  checked(await owner.client.from('articulos').update({ganador_id:winner.user.id,status:'reservado',estado:'reservado'}).eq('id',article));
  for(const [width,height]of [[320,568],[390,844],[768,900],[1440,1000]]){
    const context=await browser.newContext({viewport:{width,height}});await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:owner.client.auth.storageKey,session:owner.session});
    const page=await context.newPage(),errors=[];let writes=0;
    page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(request.method()==='PATCH'&&new URL(request.url()).pathname.endsWith('/articulos'))writes++;});
    await page.goto(appUrl);await page.getByRole('button',{name:'Ver perfil',exact:true}).click();
    await page.locator(`[data-profile-article-id="${article}"]`).locator('img').first().click();
    const dialog=page.getByRole('dialog',{name:title,exact:true});await dialog.locator('[data-selected-applicant]').waitFor();
    const deliver=dialog.getByRole('button',{name:'Marcar como entregado',exact:true}),cancel=dialog.getByRole('button',{name:'Cancelar entrega',exact:true});
    await cancel.scrollIntoViewIfNeeded();
    const boxes=await dialog.locator('.profile-delivery-button').evaluateAll(elements=>elements.map(el=>{const r=el.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,height:r.height};}));
    assert.equal(boxes.length,2);assert.ok(boxes.every(box=>box.height>=44&&box.left>=0&&box.right<=width),JSON.stringify(boxes));
    assert.ok(boxes[0].right<=boxes[1].left,'Actions do not overlap');
    assert.equal(await cancel.evaluate(el=>getComputedStyle(el).color),'rgb(180, 35, 24)');
    assert.equal(await dialog.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&el.scrollWidth<=el.clientWidth;}),true);
    assert.equal(await dialog.locator('.profile-selected-name').innerText(),'Camila Andrea Fernandez Restrepo');
    for(const button of[deliver,cancel]){
      let promptType;page.once('dialog',async confirmation=>{promptType=confirmation.type();await confirmation.dismiss();});await button.click();assert.equal(promptType,'confirm');
      assert.equal(await button.isEnabled(),true);
    }
    assert.equal(writes,0,'Dismissing either confirmation preserves the reservation');
    await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.deepEqual(errors,[]);
    console.log(`OK ${width}x${height}: compact selection, 44px actions, red cancellation, fitting dialog and unchanged confirmations.`);await context.close();
  }
  assert.equal(checked(await owner.client.from('articulos').select('status').eq('id',article).single()).status,'reservado');
}finally{
  await browser.close();if(article){checked(await service.from('articulos').delete().eq('id',article));checked(await service.from('activity_notifications').delete().eq('articulo_id',article));}
  for(const user of users)checked(await service.auth.admin.deleteUser(user));
}
