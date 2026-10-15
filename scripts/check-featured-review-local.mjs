import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { localStatus } from './seed-applicants-local.mjs';

const require=createRequire(import.meta.url);
const { chromium }=require('playwright');
const config=localStatus();
const appUrl=process.env.LOCAL_APP_URL||'http://127.0.0.1:5174';
assert.ok(['127.0.0.1','localhost'].includes(new URL(appUrl).hostname));
const service=createClient(config.API_URL,config.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const checked=({data,error})=>{if(error)throw error;return data;};
const title=`Destacado revision ${Date.now()}`;
let user,article;
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});
try {
  ({user}=checked(await service.auth.admin.createUser({email:`featured-${Date.now()}@example.com`,password:randomUUID(),email_confirm:true,app_metadata:{local_fixture:'featured-review-test'}})));
  article=checked(await service.from('articulos').insert({owner_id:user.id,title,mode:'venta',price:1000,city:'Bogotá',locality:'Suba',is_featured:true,status:'en_revision',estado:'en_revision',review_status:'en_revision'}).select('id').single());
  for(const width of [320,390,1440]) {
    const context=await browser.newContext({viewport:{width,height:900}});const page=await context.newPage();
    await page.goto(appUrl);await page.getByRole('textbox',{name:'Buscar',exact:true}).fill(title);
    const featured=page.getByRole('button',{name:`Destacado: ${title}`,exact:true});await featured.waitFor();
    assert.ok(await featured.isDisabled());assert.equal(await featured.getAttribute('aria-disabled'),'true');
    assert.ok(await featured.getByText('En revisión',{exact:true}).isVisible());
    assert.equal(await featured.locator('h3').evaluate(element=>getComputedStyle(element.parentElement).opacity),'0.7');
    await featured.evaluate(element=>element.click());assert.equal(await page.getByRole('dialog').count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    console.log(`OK ${width}px: featured review overlay, dimmed content, native disabled click and keyboard control.`);
    await context.close();
  }
  checked(await service.from('articulos').update({status:'disponible',estado:'disponible',review_status:'approved'}).eq('id',article.id));
  const page=await browser.newPage();await page.goto(appUrl);await page.getByRole('textbox',{name:'Buscar',exact:true}).fill(title);
  const active=page.getByRole('button',{name:`Destacado: ${title}`,exact:true});await active.waitFor();assert.equal(await active.isDisabled(),false);
  assert.equal(await active.getByText('En revisión',{exact:true}).count(),0);
  console.log('OK: reactivated featured articles are enabled again.');
} finally {
  await browser.close();
  if(article)checked(await service.from('articulos').delete().eq('id',article.id));
  if(user)checked(await service.auth.admin.deleteUser(user.id));
}
