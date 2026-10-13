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
const buyer=createClient(config.API_URL,config.ANON_KEY,options);
const owner=createClient(config.API_URL,config.ANON_KEY,options);
const checked=({data,error})=>{assert.ifError(error);return data;};
const seller=checked(await owner.auth.signInWithPassword({email:'vendedor@example.com',password:'123456'})).session.user;
const session=checked(await buyer.auth.signInWithPassword({email:'comprador@example.com',password:'123456'})).session;
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});
const ids=[];
try {
  for(const width of [390,1440]) {
    const title=`Reserva visible ${width} ${Date.now()} - PRUEBA TEMPORAL`;
    const article=checked(await admin.from('articulos').insert({owner_id:seller.id,title,
      description:'Venta temporal para probar la tarjeta reservada.',mode:'venta',price:1000,
      status:'disponible',estado:'disponible',city:'Bogotá',locality:'Chapinero',estado_producto:8,
    }).select('id').single());
    ids.push(article.id);
    const context=await browser.newContext({viewport:{width,height:900}});
    await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:buyer.auth.storageKey,session});
    const page=await context.newPage();
    page.on('dialog',dialog=>dialog.accept());
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(appUrl);
    await page.getByRole('textbox',{name:'Buscar',exact:true}).fill(title);
    const card=page.locator('[data-testid="home-listings"] .product-card').filter({has:page.getByRole('heading',{name:title,exact:true})});
    await card.waitFor();
    await card.click();
    await page.getByRole('button',{name:'RESERVAR',exact:true}).click();
    await page.getByRole('button',{name:'Sí, comprar',exact:true}).click();
    await card.getByText('Reservado',{exact:true}).waitFor();
    assert.equal(await card.isVisible(),true);
    assert.equal(await card.getAttribute('aria-disabled'),'true');
    assert.equal(await card.getByRole('button',{name:'En proceso',exact:true}).isEnabled(),false);
    await page.reload();
    await page.getByRole('textbox',{name:'Buscar',exact:true}).fill(title);
    await card.getByText('Reservado',{exact:true}).waitFor();
    assert.deepEqual(errors,[]);
    console.log(`OK ${width}px: reservation remains visible, centered label, blocked second reservation and reload`);
    await context.close();
  }
} finally {
  await browser.close();
  if(ids.length) {
    checked(await admin.from('articulos').delete().in('id',ids));
    checked(await admin.from('activity_notifications').delete().in('articulo_id',ids));
  }
}
