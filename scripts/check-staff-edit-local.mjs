import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHmac,randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { localStatus } from './seed-applicants-local.mjs';

const require=createRequire(import.meta.url),{chromium}=require('playwright');
const config=localStatus(),appUrl=process.env.LOCAL_APP_URL||'http://127.0.0.1:5174';
assert.ok(['localhost','127.0.0.1'].includes(new URL(appUrl).hostname));
const options={auth:{persistSession:false,autoRefreshToken:false}};
const service=createClient(config.API_URL,config.SERVICE_ROLE_KEY,options);
const checked=({data,error})=>{if(error)throw error;return data;};
const fixture=`Edicion ${randomUUID().replace(/[0-9]/g,value=>'ghijklmnop'[Number(value)])}`;
const users=[],articles=[],staffIds=[];
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});

// Disposable local factors only; never read or change an existing account's authenticator.
function totp(secret) {
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';
  for(const char of secret.toUpperCase().replace(/=+$/,''))bits+=alphabet.indexOf(char).toString(2).padStart(5,'0');
  const key=Buffer.from(bits.match(/.{8}/g).map(value=>parseInt(value,2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const digest=createHmac('sha1',key).update(counter).digest(),offset=digest.at(-1)&15;
  return ((digest.readUInt32BE(offset)&0x7fffffff)%1000000).toString().padStart(6,'0');
}
async function account(role) {
  const password=randomUUID(),email=`edit-${randomUUID()}@example.com`;
  const {user}=checked(await service.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{local_fixture:'staff-edit-test'},user_metadata:{nombre:`Prueba ${role}`}}));users.push(user.id);
  const client=createClient(config.API_URL,config.ANON_KEY,options);let {session}=checked(await client.auth.signInWithPassword({email,password}));
  if(role!=='owner') {
    staffIds.push(user.id);checked(await service.from('staff_accounts').insert({user_id:user.id,role,active:true}));
    const factor=checked(await client.auth.mfa.enroll({factorType:'totp',friendlyName:'Disposable local editor'}));
    session=checked(await client.auth.mfa.challengeAndVerify({factorId:factor.id,code:totp(factor.totp.secret)}));checked(await client.rpc('staff_open_session'));
  }
  return {user,client,session};
}
try {
  const owner=await account('owner');
  const sources=checked(await service.from('articulos').select('image_url').like('image_url',`${config.API_URL}/%`).limit(30));
  const urls=[...new Set(sources.map(row=>row.image_url))];assert.ok(urls.length>=2,'Local seed photos are required');
  for(const role of ['admin','master']) {
    const actor=await account(role);
    for(const width of [320,1440]) {
      const title=`${fixture} ${role} ${width}`,state=role==='master'?'en_revision':'disponible';
      const article=checked(await service.from('articulos').insert({owner_id:owner.user.id,title,description:'Contacto 3001234567 venta@example.com',mode:'venta',price:5000,status:state,estado:state,review_status:state==='en_revision'?state:'approved',city:'Bogotá',locality:'Suba',image_url:urls[0],imagen_url:urls[0],imagen_url_principal:urls[0],imagenes:urls.slice(0,2)}).select('id').single());articles.push(article.id);
      checked(await service.from('articulo_imagenes').insert(urls.slice(0,2).map((url,index)=>({articulo_id:article.id,owner_id:owner.user.id,url,path:`staff-edit-test/${index}`,file_id:`fixture-${index}`,position:index}))));
      const initial=checked(await actor.client.rpc('staff_article_detail',{p_id:article.id}));
      assert.ok((await owner.client.rpc('staff_edit_article',{p_id:article.id,p_title:'Titulo limpio',p_description:'Texto limpio',p_images:[],p_version:initial.content_version,p_reason:'Intento de usuario normal'})).error);
      const context=await browser.newContext({viewport:{width,height:900}});await context.addInitScript(session=>localStorage.setItem('mb-staff-auth',JSON.stringify(session)),actor.session);
      const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(`${appUrl}/gestion/${role==='master'?'direccion':'operaciones'}`);
      await page.getByRole('heading',{name:'Pendientes',exact:true}).waitFor();if(width<768)await page.getByRole('button',{name:'Abrir menú',exact:true}).click();await page.getByRole('button',{name:'Publicaciones',exact:true}).click();
      await page.getByRole('textbox',{name:'Buscar en el panel'}).fill(title);const row=page.locator('tbody tr').filter({hasText:title});await row.getByRole('button',{name:'Editar publicación',exact:true}).click();
      await page.getByLabel('Descripción',{exact:true}).waitFor();assert.ok(await page.getByRole('button',{name:'Guardar y notificar',exact:true}).isDisabled());
      await page.waitForFunction(()=>[...document.querySelectorAll('.staff-editor-gallery img')].length===2&&[...document.querySelectorAll('.staff-editor-gallery img')].every(image=>image.complete&&image.naturalWidth>0));
      await page.getByLabel('Título',{exact:true}).fill(`${title} corregida`);await page.getByLabel('Descripción',{exact:true}).fill('Articulo corregido sin datos personales.');
      await page.getByRole('button',{name:'Retirar foto 1',exact:true}).click();
      assert.ok(await page.getByRole('button',{name:'Guardar y notificar',exact:true}).isDisabled());
      await page.getByLabel('Motivo de la corrección',{exact:true}).selectOption('contact');
      const extraDetails=width===320?'Retiramos datos de contacto y una foto incorrecta':'';
      if(extraDetails)await page.getByLabel('Nota interna (opcional)',{exact:true}).fill(extraDetails);
      assert.ok(await page.getByRole('button',{name:'Guardar y notificar',exact:true}).isEnabled());
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await page.getByRole('button',{name:'Guardar y notificar',exact:true}).click();await page.getByRole('heading',{name:'Corregir publicación',exact:true}).waitFor({state:'hidden'});
      const stored=checked(await service.from('articulos').select('title,description,owner_id,status,price,imagenes,image_url,imagen_url,imagen_url_principal').eq('id',article.id).single());
      assert.equal(stored.status,state);assert.equal(stored.owner_id,owner.user.id);assert.equal(stored.price,5000);assert.deepEqual(stored.imagenes,[urls[1]]);assert.equal(stored.image_url,urls[1]);assert.equal(stored.imagen_url,urls[1]);assert.equal(stored.imagen_url_principal,urls[1]);assert.doesNotMatch(stored.description,/3001234567|@/);
      const gallery=checked(await service.from('articulo_imagenes').select('url,position,owner_id,file_id').eq('articulo_id',article.id));assert.equal(gallery.length,1);assert.equal(gallery[0].url,urls[1]);assert.equal(gallery[0].owner_id,owner.user.id);
      assert.ok(checked(await owner.client.rpc('notification_inbox')).some(message=>message.title==='Publicacion ajustada por administracion'&&message.message.includes(stored.title)));
      const audit=checked(await service.from('staff_audit').select('id,reason').eq('action','article.edit').eq('target_id',article.id));assert.equal(audit.length,1);
      const expectedReason='Datos de contacto en la publicación'+(extraDetails?`: ${extraDetails}`:'');
      assert.equal(audit[0].reason,expectedReason);
      const ownerNotice=checked(await owner.client.rpc('notification_inbox')).find(message=>message.message.includes(stored.title));
      assert.ok(ownerNotice.message.includes('Datos de contacto en la publicación'));
      if(extraDetails)assert.ok(!ownerNotice.message.includes(extraDetails),'Internal note must never reach the owner inbox');
      if(role==='admin'&&width===320) {
        await row.getByRole('button',{name:'Editar publicación',exact:true}).click();await page.getByLabel('Descripción',{exact:true}).waitFor();
        checked(await service.from('articulos').update({description:'Actualizacion reciente del propietario.'}).eq('id',article.id));
        await page.getByLabel('Descripción',{exact:true}).fill('Intento de reemplazar una version antigua.');await page.getByLabel('Motivo de la corrección',{exact:true}).selectOption('misleading');
        await page.getByRole('button',{name:'Guardar y notificar',exact:true}).click();await page.getByRole('alert').filter({hasText:'cambio mientras editabas'}).waitFor();
        assert.equal(checked(await service.from('articulos').select('description').eq('id',article.id).single()).description,'Actualizacion reciente del propietario.');await page.getByRole('button',{name:'Cerrar edición',exact:true}).click();
      }
      assert.deepEqual(errors,[]);console.log(`OK ${role} ${width}px: real image previews, contact cleanup, photo removal, synchronized gallery, unchanged transaction state, audit and private owner notice.`);
      await context.close();
    }
  }
  console.log('OK: stale editor cannot overwrite an owner update; normal users cannot use moderation editing.');
} finally {
  await browser.close();if(articles.length)checked(await service.from('articulos').delete().in('id',articles));
  if(staffIds.length){checked(await service.from('staff_audit').delete().in('actor_id',staffIds));checked(await service.from('system_messages').delete().in('sender_id',staffIds));}
  for(const uid of users)checked(await service.auth.admin.deleteUser(uid));
}
