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
const fixture=`Sponsor ${Date.now()}`,users=[],campaignIds=[],files=[];let hero,footer;
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});
function totp(secret) {
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const char of secret.toUpperCase().replace(/=+$/,''))bits+=alphabet.indexOf(char).toString(2).padStart(5,'0');
  const key=Buffer.from(bits.match(/.{8}/g).map(value=>parseInt(value,2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const digest=createHmac('sha1',key).update(counter).digest(),offset=digest.at(-1)&15;return((digest.readUInt32BE(offset)&0x7fffffff)%1000000).toString().padStart(6,'0');
}
async function account(role) {
  const email=`sponsor-${randomUUID()}@example.com`,password=randomUUID();
  const {user}=checked(await service.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{local_fixture:'sponsors-test'},user_metadata:{nombre:fixture}}));users.push(user.id);
  const client=createClient(config.API_URL,config.ANON_KEY,options);let{session}=checked(await client.auth.signInWithPassword({email,password}));
  checked(await service.from('staff_accounts').insert({user_id:user.id,role,permissions:['sponsors'],active:true}));
  assert.ok((await client.rpc('staff_sponsor_dashboard')).error);
  const factor=checked(await client.auth.mfa.enroll({factorType:'totp',friendlyName:'Disposable campaign test'}));
  session=checked(await client.auth.mfa.challengeAndVerify({factorId:factor.id,code:totp(factor.totp.secret)}));checked(await client.rpc('staff_open_session'));
  return{user,client,session};
}
try {
  const admin=await account('admin'),master=await account('master');
  assert.ok((await admin.client.rpc('staff_sponsor_dashboard')).error);
  assert.ok((await admin.client.rpc('staff_save_sponsor',{p_id:null,p_data:{}})).error);
  assert.ok((await admin.client.from('patrocinadores').select('*')).error);
  assert.ok((await admin.client.storage.from('sponsor-media').upload(`denied-${randomUUID()}.webp`,Buffer.from('denied'),{contentType:'image/webp'})).error);
  const source=checked(await service.from('articulos').select('image_url').like('image_url',`${config.API_URL}/%`).limit(1))[0];assert.ok(source);
  const image=Buffer.from(await(await fetch(source.image_url)).arrayBuffer());
  for(const width of[320,390,768,1440]) {
    const context=await browser.newContext({viewport:{width,height:900}});await context.addInitScript(session=>localStorage.setItem('mb-staff-auth',JSON.stringify(session)),master.session);
    const page=await context.newPage(),errors=[];let publicCalls=0;page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(request.url().includes('/rpc/home_article_page'))publicCalls++;});
    await page.goto(`${appUrl}/gestion/direccion`);await page.getByRole('heading',{name:'Pendientes',exact:true}).waitFor();
    if(width<768)await page.getByRole('button',{name:'Abrir menú',exact:true}).click();await page.getByRole('button',{name:'Patrocinadores',exact:true}).click();
    await page.getByRole('textbox',{name:'Buscar en el panel'}).fill(fixture);await page.getByLabel('Período',{exact:true}).selectOption('7');
    if(!hero) {
      await page.getByRole('button',{name:'Nueva campaña',exact:true}).click();
      await page.getByLabel('Nombre / título',{exact:true}).fill(fixture);
      await page.getByLabel('Descripción',{exact:true}).fill('Campana real de prueba local');
      await page.getByLabel('Subir imagen principal',{exact:true}).setInputFiles({name:'banner.webp',mimeType:'image/webp',buffer:image});
      await page.waitForFunction(()=>document.querySelector('#sponsor-imagen_url')?.value.includes('/sponsor-media/'));
      const imageUrl=await page.getByLabel('Imagen principal',{exact:true}).inputValue();files.push(imageUrl.split('/sponsor-media/')[1]);
      await page.waitForFunction(()=>{const image=document.querySelector('.staff-sponsor-preview');return image?.complete&&image.naturalWidth>0;});
      await page.getByLabel('Subir imágenes adicionales',{exact:true}).setInputFiles([{name:'second.webp',mimeType:'image/webp',buffer:image},{name:'third.webp',mimeType:'image/webp',buffer:image}]);
      await page.getByLabel('Imagen 3 · URL',{exact:true}).waitFor();
      for(const number of[2,3])files.push((await page.getByLabel(`Imagen ${number} · URL`,{exact:true}).inputValue()).split('/sponsor-media/')[1]);
      await page.getByLabel('Enlace de destino',{exact:true}).fill('https://example.com/sponsor-local');
      await page.getByLabel('Etiqueta',{exact:true}).fill(fixture);await page.getByLabel('Campaña habilitada',{exact:true}).check();
      assert.equal(await page.getByRole('dialog').getByRole('textbox',{name:/motivo/i}).count(),0);
      assert.equal(await page.getByRole('button',{name:'Guardar campaña',exact:true}).isEnabled(),true);
      await page.getByRole('button',{name:'Guardar campaña',exact:true}).click();await page.getByRole('heading',{name:'Nueva campaña',exact:true}).waitFor({state:'hidden'});
      hero=checked(await service.from('patrocinadores').select('*').eq('texto',fixture).single());campaignIds.push(hero.id);
      assert.equal(hero.creative_assets.length,3);
      const footerData={...hero,texto:`${fixture} inferior`,placement:'footer',position:0};
      const footerId=checked(await master.client.rpc('staff_save_sponsor',{p_id:null,p_data:footerData}));campaignIds.push(footerId);
      footer=checked(await service.from('patrocinadores').select('*').eq('id',footerId).single());
    }
    const row=page.locator('tbody tr').filter({hasText:fixture}).filter({hasText:'Banner principal'});await row.waitFor();
    await row.getByRole('button',{name:`Editar campaña: ${fixture}`,exact:true}).click();await page.getByLabel('Enlace de destino',{exact:true}).waitFor();
    assert.equal(await page.getByLabel('Enlace de destino',{exact:true}).inputValue(),'https://example.com/sponsor-local');
    assert.equal(await page.getByRole('dialog').evaluate(element=>element.scrollWidth>element.clientWidth),false);
    assert.equal(await page.getByRole('dialog').getByRole('textbox',{name:/motivo/i}).count(),0);
    assert.equal(await page.getByLabel('Imagen 3 · URL',{exact:true}).count(),1);
    if(width===390) {
      await page.getByLabel('Ciudad',{exact:true}).selectOption('Bogotá');await page.getByLabel('Localidad / zona',{exact:true}).selectOption('Suba');
      await page.getByRole('button',{name:'Añadir zona',exact:true}).click();await page.getByLabel('Mascotas',{exact:true}).check();
      await page.getByRole('button',{name:'Guardar campaña',exact:true}).click();await page.getByRole('heading',{name:'Editar campaña',exact:true}).waitFor({state:'hidden'});
      const anon=createClient(config.API_URL,config.ANON_KEY,options),filters={p_city:'Bogotá',p_locality:'Suba',p_category:'Mascotas',p_seed:randomUUID()};
      assert.ok(checked(await anon.rpc('public_sponsor_slots',filters)).some(item=>item.id===hero.id));
      assert.ok(!checked(await anon.rpc('public_sponsor_slots',{...filters,p_locality:'Chapinero'})).some(item=>item.id===hero.id));
      assert.ok(!checked(await anon.rpc('public_sponsor_slots',{...filters,p_category:''})).some(item=>item.id===hero.id));
      await row.getByRole('button',{name:`Editar campaña: ${fixture}`,exact:true}).click();
      await page.getByRole('button',{name:'Cobertura general',exact:true}).click();await page.getByLabel('Todas las categorías',{exact:true}).check();
      await page.getByRole('button',{name:'Guardar campaña',exact:true}).click();await page.getByRole('heading',{name:'Editar campaña',exact:true}).waitFor({state:'hidden'});
    } else await page.getByRole('button',{name:'Cerrar campaña',exact:true}).click();
    for(const name of['Pausar campaña','Activar campaña']) {
      await row.getByRole('button',{name,exact:true}).click();
      const dialog=page.getByRole('dialog');await dialog.waitFor();
      assert.equal(await dialog.getByRole('textbox').count(),0);
      await dialog.getByRole('button',{name:'Confirmar',exact:true}).click();await dialog.waitFor({state:'hidden'});
      await row.getByRole('button',{name:name==='Pausar campaña'?'Activar campaña':'Pausar campaña',exact:true}).waitFor();
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(publicCalls,0);assert.deepEqual(errors,[]);
    console.log(`OK Super Admin ${width}px: campaign dashboard, editor, real uploaded preview, private stats and no overflow.`);await context.close();
  }
  const adminContext=await browser.newContext({viewport:{width:390,height:844}});await adminContext.addInitScript(session=>localStorage.setItem('mb-staff-auth',JSON.stringify(session)),admin.session);
  const adminPage=await adminContext.newPage();await adminPage.goto(`${appUrl}/gestion/operaciones`);await adminPage.getByRole('heading',{name:'Pendientes',exact:true}).waitFor();await adminPage.getByRole('button',{name:'Abrir menú',exact:true}).click();
  assert.equal(await adminPage.getByRole('button',{name:'Patrocinadores',exact:true}).count(),0);await adminContext.close();
  for(const width of[390,1440]) {
    const context=await browser.newContext({viewport:{width,height:900}});await context.route('https://example.com/**',route=>route.fulfill({status:200,contentType:'text/html',body:'<h1>Patrocinador de prueba local</h1>'}));
    const page=await context.newPage();let slotCalls=0;page.on('request',request=>{if(request.url().includes('/rpc/public_sponsor_slots'))slotCalls++;});
    await page.goto(appUrl);const banner=page.getByRole('region',{name:'Banner principal',exact:true});await banner.hover();
    await banner.getByRole('button',{name:new RegExp(`Ir al banner .*: ${fixture}`)}).click();
    const primary=await banner.locator('picture img').getAttribute('src'),turns=await banner.getByRole('button',{name:/Ir al banner/}).count();
    for(let i=0;i<turns;i++)await banner.getByRole('button',{name:'Siguiente banner',exact:true}).click();
    assert.notEqual(await banner.locator('picture img').getAttribute('src'),primary,'A second photo rotates after each advertiser gets one turn');
    await banner.getByRole('button',{name:new RegExp(`Ir al banner .*: ${fixture}`)}).click();
    await page.waitForTimeout(1200);
    let response=page.waitForResponse(result=>result.url().includes('/rpc/record_sponsor_metrics')&&result.request().postDataJSON().p_events.some(event=>event.id===hero.id&&event.clicked));
    let popup=context.waitForEvent('page');await banner.getByRole('link',{name:`Abrir anuncio: ${fixture}`,exact:true}).click({position:{x:5,y:5}});let child=await popup;await child.waitForLoadState();assert.ok((await response).ok());await child.close();await page.bringToFront();
    const unseen=checked(await service.from('sponsor_daily_metrics').select('impressions').eq('sponsor_id',footer.id));if(width===390)assert.equal(unseen.length,0,'A below-fold campaign is not counted at page load');
    const block=page.getByRole('region',{name:'Patrocinadores',exact:true});await block.scrollIntoViewIfNeeded();await block.hover();
    const selector=block.getByRole('button',{name:new RegExp(`Ver patrocinador .*: ${footer.texto}`)});if(await selector.count())await selector.click();
    await block.getByRole('link',{name:`Visitar patrocinador: ${footer.texto}`,exact:true}).waitFor();await page.waitForTimeout(1200);
    response=page.waitForResponse(result=>result.url().includes('/rpc/record_sponsor_metrics')&&result.request().postDataJSON().p_events.some(event=>event.id===footer.id&&event.clicked));
    popup=context.waitForEvent('page');await block.getByRole('link',{name:`Visitar patrocinador: ${footer.texto}`,exact:true}).click();child=await popup;await child.waitForLoadState();assert.ok((await response).ok());await child.close();
    assert.equal(slotCalls,1,'Hero and footer share one cached catalog request');await context.close();console.log(`OK public ${width}px: connected banner/footer images and links, visibility-qualified impressions, click batch and one catalog request.`);
  }
  const dashboard=checked(await master.client.rpc('staff_sponsor_dashboard',{p_search:fixture,p_days:7}));assert.equal(dashboard.total,2);assert.equal(Number(dashboard.totals.impressions),4);assert.equal(Number(dashboard.totals.clicks),4);
  for(const row of dashboard.rows){assert.equal(Number(row.period_impressions),2);assert.equal(Number(row.period_clicks),2);}
  const version=checked(await service.from('patrocinadores').select('updated_at').eq('id',hero.id).single()).updated_at;
  checked(await master.client.rpc('staff_save_sponsor',{p_id:hero.id,p_data:{...hero,activo:false},p_version:version}));
  const anonymous=createClient(config.API_URL,config.ANON_KEY,options);assert.ok(!checked(await anonymous.rpc('public_sponsor_slots')).some(item=>item.id===hero.id));
  assert.ok((await master.client.rpc('staff_save_sponsor',{p_id:hero.id,p_data:hero,p_version:version})).error);
  const audit=checked(await service.from('staff_audit').select('reason,changes').eq('target_id',hero.id).eq('action','sponsor.save'));
  for(const reason of['Creacion','Pausa','Activacion'])assert.ok(audit.some(entry=>entry.reason===`${reason} de campana por Super Admin`&&entry.changes.after.id===hero.id));
  const targetName=`Segmentacion ${Date.now()}`;
  const targetId=checked(await master.client.rpc('staff_save_sponsor',{p_id:null,p_data:{...hero,texto:targetName,badge:targetName,activo:true,target_locations:[{city:'Bogotá',locality:'Suba'}],target_categories:['Mascotas']}}));campaignIds.push(targetId);
  for(const width of[390,1440]) {
    const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();let calls=0;
    page.on('request',request=>{if(request.url().includes('/rpc/public_sponsor_slots'))calls++;});
    await page.goto(appUrl);await page.waitForResponse(response=>response.url().includes('/rpc/public_sponsor_slots'));
    const banner=page.getByRole('region',{name:'Banner principal',exact:true}),target=banner.getByRole('button',{name:new RegExp(`Ir al banner .*: ${targetName}`)});
    assert.equal(await target.count(),0);
    if(width<1024)await page.getByRole('button',{name:'Categorías',exact:true}).click();
    let response=page.waitForResponse(result=>result.url().includes('/rpc/public_sponsor_slots')&&result.request().postDataJSON().p_category==='Mascotas');
    await page.locator('#category-filters').getByRole('button',{name:/Mascotas/}).click();await response;
    assert.equal(await target.count(),0,'Category alone cannot satisfy a locality campaign');
    if(width<1024)await page.getByRole('button',{name:'Localidades en Bogotá',exact:true}).click();
    response=page.waitForResponse(result=>result.url().includes('/rpc/public_sponsor_slots')&&result.request().postDataJSON().p_locality==='Suba');
    await page.locator('#locality-filters').getByRole('button',{name:'Suba',exact:true}).click();assert.ok((await response).ok());
    await target.waitFor();await target.click();assert.equal(await banner.getByRole('heading',{name:targetName,exact:true}).count(),1);
    response=page.waitForResponse(result=>result.url().includes('/rpc/public_sponsor_slots')&&result.request().postDataJSON().p_locality==='Chapinero');
    await page.locator('#locality-filters').getByRole('button',{name:'Chapinero',exact:true}).click();await response;await target.waitFor({state:'hidden'});
    assert.equal(calls,4,'One shared sponsor request per settled filter combination, not per banner');
    await context.close();console.log(`OK targeting ${width}px: real catalog filters show only matching campaigns and share requests.`);
  }
  console.log('OK: supervisor denied in UI/API/storage, multiple uploaded images rotate, geography/category targeting and general coverage persist, filtered statistics match both devices, pause removes campaign, stale edits rejected.');
}finally {
  await browser.close();if(campaignIds.length)checked(await service.from('patrocinadores').delete().in('id',campaignIds));
  if(files.length)checked(await service.storage.from('sponsor-media').remove(files));
  if(users.length)checked(await service.from('staff_audit').delete().in('actor_id',users));
  for(const id of users)checked(await service.auth.admin.deleteUser(id));
}
