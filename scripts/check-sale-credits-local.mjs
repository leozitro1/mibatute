import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
import { localStatus } from './seed-applicants-local.mjs';

const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const config=localStatus();
const appUrl=process.env.LOCAL_APP_URL || 'http://127.0.0.1:5174';
assert.ok(['localhost','127.0.0.1'].includes(new URL(appUrl).hostname));
const options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(config.API_URL,config.SERVICE_ROLE_KEY,options);
const checked=({data,error})=>{assert.ifError(error);return data;};
const users=[],articles=[],sales=[],donations=[];
let browser;
try {
  const stamp=Date.now();
  for(const name of ['owner','buyer']) {
    const email=`sale-credits-${name}-${stamp}@example.com`;
    const user=checked(await admin.auth.admin.createUser({email,password:'local-sale-123',email_confirm:true,
      user_metadata:{nombre:`Compras ${name}`,movil:'3001234567',ciudad:'Bogotá',localidad:'Chapinero'},
      app_metadata:{local_fixture:'mibatute'}})).user;
    users.push(user);
  }
  for(let n=0;n<13;n++) {
    const article=checked(await admin.from('articulos').insert({owner_id:users[0].id,
      title:`Compra limite ${n} ${stamp}`,description:'Articulo temporal para pruebas locales de cupos.',
      mode:n<10?'venta':'donacion',price:n<10?1000:0,status:'disponible',estado:'disponible',city:'Bogotá',locality:'Chapinero',
    }).select('id,title').single());
    articles.push(article);(n<10?sales:donations).push(article);
  }
  checked(await admin.from('postulaciones').insert(donations.map(article=>({usuario_id:users[1].id,articulo_id:article.id,justificacion:'Postulacion ficticia de prueba.'}))));
  const buyer=createClient(config.API_URL,config.ANON_KEY,options),owner=createClient(config.API_URL,config.ANON_KEY,options);
  const session=checked(await buyer.auth.signInWithPassword({email:users[1].email,password:'local-sale-123'})).session;
  checked(await owner.auth.signInWithPassword({email:users[0].email,password:'local-sale-123'}));
  const reserve=(article,paid=false)=>buyer.rpc('transition_sale_with_credit',{p_articulo_id:article.id,p_action:'reserve',p_use_credit:paid}).then(checked);
  const status=()=>buyer.rpc('account_credit_status').then(checked);
  for(let n=0;n<5;n++) await reserve(sales[n]);
  let s=await status();assert.equal(s.purchases.active,5);assert.equal(s.balance,0);assert.equal(s.donations.pending,3);
  assert.equal((await reserve(sales[5])).code,'SALE_CREDIT_REQUIRED');
  assert.equal((await reserve(sales[5],true)).code,'INSUFFICIENT_CREDITS');
  checked(await admin.from('cupos').upsert({usuario_id:users[1].id,saldo:3}));
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});
  for(const [width,index] of [[390,5],[1440,6]]) {
    const context=await browser.newContext({viewport:{width,height:900}});
    await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:buyer.auth.storageKey,session});
    const page=await context.newPage();const errors=[];
    page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
    await page.goto(appUrl);
    await page.getByRole('textbox',{name:'Buscar',exact:true}).fill(sales[index].title);
    const card=page.locator('[data-testid="home-listings"] .product-card').filter({has:page.getByRole('heading',{name:sales[index].title,exact:true})});
    await card.click();
    await page.getByRole('button',{name:'RESERVAR',exact:true}).click();
    await page.getByRole('button',{name:'Sí, comprar',exact:true}).click();
    await page.getByRole('button',{name:'Reservar con 1 crédito',exact:true}).waitFor();
    await page.getByText(/Solo se devuelve si el vendedor rechaza/).waitFor();
    await page.getByRole('button',{name:'Reservar con 1 crédito',exact:true}).click();
    await card.getByText('Reservado',{exact:true}).waitFor();
    assert.deepEqual(errors,[]);
    assert.equal((await status()).balance,7-index);
    await context.close();
    console.log(`OK ${width}px: explicit paid purchase and reserved card stays visible`);
  }
  const simultaneous=await Promise.all(sales.slice(7,10).map(article=>reserve(article,true)));
  assert.equal(simultaneous.filter(r=>r.article).length,1);
  assert.equal(simultaneous.filter(r=>r.code==='SALE_LIMIT_REACHED').length,2);
  s=await status();assert.equal(s.purchases.active,8);assert.equal(s.purchases.paidActive,3);assert.equal(s.balance,0);assert.equal(s.donations.pending,3);
  const paidWinner=simultaneous.find(r=>r.article).article.id;
  await Promise.all(Array.from({length:5},()=>reserve(sales[5],true)));
  assert.equal((await status()).balance,0);
  checked(await owner.rpc('transition_sale',{p_articulo_id:sales[5].id,p_action:'cancel'}));
  assert.equal((await status()).balance,1);assert.equal((await status()).purchases.active,7);
  const repeat=await owner.rpc('transition_sale',{p_articulo_id:sales[5].id,p_action:'cancel'});assert.ok(repeat.error);
  assert.equal((await status()).balance,1);
  checked(await buyer.rpc('transition_sale',{p_articulo_id:sales[6].id,p_action:'cancel'}));
  assert.equal((await status()).balance,1);
  checked(await owner.rpc('transition_sale',{p_articulo_id:paidWinner,p_action:'deliver'}));
  assert.equal((await status()).balance,1);assert.equal((await status()).purchases.active,5);
  checked(await buyer.rpc('transition_sale',{p_articulo_id:sales[0].id,p_action:'cancel'}));
  assert.equal((await reserve(sales[0])).cost,0);assert.equal((await status()).balance,1);
  console.log('OK: 5 free plus 3 paid, real concurrency, no double charge, seller-only refund, delivery and donation independence.');
} finally {
  if(browser) await browser.close();
  if(articles.length) {
    checked(await admin.from('articulos').delete().in('id',articles.map(a=>a.id)));
    checked(await admin.from('activity_notifications').delete().in('articulo_id',articles.map(a=>a.id)));
  }
  for(const user of users) checked(await admin.auth.admin.deleteUser(user.id));
}
