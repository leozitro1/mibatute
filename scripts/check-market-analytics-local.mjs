import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHmac,randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { localStatus } from './seed-applicants-local.mjs';

const {chromium}=createRequire(import.meta.url)('playwright');
const config=localStatus(),appUrl=process.env.LOCAL_APP_URL||'http://127.0.0.1:5174';
assert.ok(['localhost','127.0.0.1'].includes(new URL(appUrl).hostname));
assert.ok(['localhost','127.0.0.1'].includes(new URL(config.API_URL).hostname));
const options={auth:{persistSession:false,autoRefreshToken:false}},service=createClient(config.API_URL,config.SERVICE_ROLE_KEY,options);
const checked=({data,error})=>{if(error)throw error;return data;};
function totp(secret){
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const char of secret.toUpperCase().replace(/=+$/,''))bits+=alphabet.indexOf(char).toString(2).padStart(5,'0');
  const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const digest=createHmac('sha1',Buffer.from(bits.match(/.{8}/g).map(value=>parseInt(value,2)))).update(counter).digest(),offset=digest.at(-1)&15;
  return ((digest.readUInt32BE(offset)&0x7fffffff)%1000000).toString().padStart(6,'0');
}
const users=[],article=randomUUID(),visit=randomUUID(),term=`prueba ${randomUUID().replace(/[^a-f]/g,'')}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});
try{
  for(const role of ['master','admin']){
    const email=`analytics-${randomUUID()}@example.com`,password=randomUUID();
    const {user}=checked(await service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{nombre:'Estadisticas local'},app_metadata:{local_fixture:'market-analytics'}}));users.push(user.id);
    checked(await service.from('staff_accounts').insert({user_id:user.id,role,permissions:['users'],active:true}));
    const client=createClient(config.API_URL,config.ANON_KEY,options);checked(await client.auth.signInWithPassword({email,password}));
    const factor=checked(await client.auth.mfa.enroll({factorType:'totp',friendlyName:'Analytics test'}));
    const verified=checked(await client.auth.mfa.challengeAndVerify({factorId:factor.id,code:totp(factor.totp.secret)}));checked(await client.rpc('staff_open_session'));
    if(role==='master'){
      checked(await service.from('articulos').insert({id:article,owner_id:user.id,title:'Bicicleta de prueba de estadisticas',mode:'venta',status:'disponible',estado:'disponible',review_status:'approved',city:'Bogotá',locality:'Suba',category:'Deportes'}));
      checked(await service.rpc('record_market_metrics',{p_visit:visit,p_events:[{kind:'search',term,city:'Bogotá',locality:'Suba',category:'Deportes',empty:true},{kind:'view',id:article}]}));
      checked(await service.from('articulos').update({status:'entregado',estado:'entregado',delivered_at:new Date().toISOString()}).eq('id',article));
    }
    for(const width of role==='master'?[320,390,768,1440]:[390,1440]){
      const context=await browser.newContext({viewport:{width,height:900}});await context.addInitScript(session=>localStorage.setItem('mb-staff-auth',JSON.stringify(session)),verified);
      const page=await context.newPage(),errors=[];let calls=0;page.on('pageerror',err=>errors.push(err.message));
      page.on('request',req=>{if(req.url().includes('/rpc/staff_market_dashboard'))calls++;});
      await page.goto(`${appUrl}/gestion/${role==='master'?'direccion':'operaciones'}`);await page.getByRole('heading',{name:'Pendientes',exact:true}).waitFor();
      if(width<768)await page.getByRole('button',{name:'Abrir menú',exact:true}).click();
      if(role==='admin'){
        assert.equal(await page.getByRole('button',{name:'Estadísticas',exact:true}).count(),0);
        assert.ok((await client.rpc('staff_market_dashboard')).error);assert.equal(calls,0);
      }else{
        await page.getByRole('button',{name:'Estadísticas',exact:true}).click();await page.getByRole('heading',{name:'Lo más buscado',exact:true}).waitFor();
        await page.getByText(term,{exact:true}).waitFor();assert.equal(calls,1);
        assert.equal(await page.locator('.staff-stat-chart polyline').count(),1);
        const nonzero=await page.locator('.staff-stat-chart polyline').getAttribute('points');assert.ok(new Set(nonzero.split(' ').map(point=>point.split(',')[1])).size>1);
        await page.getByRole('button',{name:'Ventas entregadas',exact:true}).click();await page.getByText('Detalle diario',{exact:true}).click();
        assert.equal(await page.locator('.staff-stat-daily tbody tr').count(),30);assert.equal(calls,1);
        await page.getByLabel('Período',{exact:true}).selectOption('7');await page.waitForFunction(()=>document.querySelectorAll('.staff-stat-daily tbody tr').length===7);
        assert.equal(calls,2);
        await page.getByRole('button',{name:'Actualizar estadísticas',exact:true}).click();await page.getByRole('button',{name:'Actualizar estadísticas',exact:true}).waitFor({state:'visible'});
        await page.waitForFunction(()=>!document.querySelector('[aria-label="Actualizar estadísticas"]').disabled);assert.equal(calls,3);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        assert.deepEqual(errors,[]);
      }
      console.log(`OK ${role} ${width}px: permissions, chart, filters, bounded requests, no overflow.`);await context.close();
    }
  }
  checked(await service.from('articulos').update({status:'disponible',estado:'disponible'}).eq('id',article));
  for(const privacy of [false,true]){
    const context=await browser.newContext({viewport:{width:390,height:900}}),batches=[];
    if(privacy)await context.addInitScript(()=>Object.defineProperty(navigator,'doNotTrack',{get:()=> '1'}));
    const page=await context.newPage();
    // Capture the client payload; ingestion itself is tested above against local Supabase.
    await page.route('**/rpc/record_market_metrics',async route=>{batches.push(route.request().postDataJSON());await route.fulfill({status:204});});
    await page.goto(appUrl);await page.getByRole('textbox',{name:'Buscar',exact:true}).fill('bicicleta de prueba de estadisticas');
    const card=page.locator('.product-card').filter({hasText:'Bicicleta de prueba de estadisticas'});await card.waitFor();await card.click();
    await page.waitForTimeout(1800);await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));await page.waitForTimeout(300);
    if(privacy)assert.equal(batches.length,0);
    else{
      assert.equal(batches.length,1);const events=batches[0].p_events;
      assert.ok(events.some(event=>event.kind==='search'&&event.term==='bicicleta de prueba de estadisticas'));
      assert.ok(events.some(event=>event.kind==='view'&&event.id===article));assert.ok(events.length<=20);
    }
    console.log(`OK public mobile: ${privacy?'Do Not Track sends no analytics':'stabilized search and detail view share one batch'}.`);await context.close();
  }
}finally{
  await browser.close();
  checked(await service.from('market_metric_events').delete().eq('visit_id',visit));
  checked(await service.from('market_daily_metrics').delete().in('dimension',[term,article]));
  checked(await service.from('articulos').delete().eq('id',article));
  for(const id of users){checked(await service.from('staff_audit').delete().eq('actor_id',id));checked(await service.auth.admin.deleteUser(id));}
}
