import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { localStatus } from './seed-applicants-local.mjs';

const {chromium}=createRequire(import.meta.url)('playwright'),config=localStatus(),options={auth:{persistSession:false,autoRefreshToken:false}};
const appUrl=process.env.LOCAL_APP_URL||'http://127.0.0.1:5174';assert.ok(['localhost','127.0.0.1'].includes(new URL(appUrl).hostname));
const service=createClient(config.API_URL,config.SERVICE_ROLE_KEY,options),users=[],articles=[];
const checked=({data,error})=>{if(error)throw error;return data;};
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});
async function account(nombre){
  const email=`rating-ui-${randomUUID()}@example.com`,password=randomUUID();
  const {user}=checked(await service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{nombre},app_metadata:{local_fixture:'profile-rating-action'}}));users.push(user.id);
  const client=createClient(config.API_URL,config.ANON_KEY,options),{session}=checked(await client.auth.signInWithPassword({email,password}));return{user,client,session};
}
try{
  const owner=await account('Donante y vendedor de prueba'),recipient=await account('Persona que recibe');
  for(const mode of['donacion','venta']){
    const article=checked(await owner.client.from('articulos').insert({owner_id:owner.user.id,title:`Calificacion ${mode} - prueba temporal`,mode,price:mode==='venta'?1000:0,
      city:'Bogotá',locality:'Chapinero',status:'disponible',estado:'disponible',estado_producto:8}).select('id').single()).id;articles.push(article);
    if(mode==='donacion'){
      checked(await service.from('postulaciones').insert({articulo_id:article,usuario_id:recipient.user.id,justificacion:'Solicitud temporal para probar la calificacion.'}));
      checked(await owner.client.from('articulos').update({ganador_id:recipient.user.id,status:'reservado',estado:'reservado'}).eq('id',article));
      checked(await owner.client.from('articulos').update({status:'entregado',estado:'entregado',delivered_at:new Date().toISOString()}).eq('id',article));
    }else{
      checked(await recipient.client.rpc('transition_sale',{p_articulo_id:article,p_action:'reserve'}));
      checked(await owner.client.rpc('transition_sale',{p_articulo_id:article,p_action:'approve_chat'}));
      checked(await owner.client.rpc('transition_sale',{p_articulo_id:article,p_action:'deliver'}));
      checked(await service.from('reputacion').insert([{reviewer_id:owner.user.id,reviewed_id:recipient.user.id,articulo_id:article,estrellas:5},
        {reviewer_id:recipient.user.id,reviewed_id:owner.user.id,articulo_id:article,estrellas:5}]));
    }
  }
  for(const [member,tab]of [[owner,'Mis Publicaciones'],[recipient,'Mis Rescates']]){
    for(const [width,reduced]of [[320,false],[390,true],[1440,false]]){
      const context=await browser.newContext({viewport:{width,height:900},reducedMotion:reduced?'reduce':'no-preference'});
      await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:member.client.auth.storageKey,session:member.session});
      const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.goto(appUrl);await page.getByRole('button',{name:'Ver perfil',exact:true}).click();
      if(tab==='Mis Rescates')await page.getByRole('button',{name:tab,exact:true}).click();
      const pending=page.locator(`[data-profile-article-id="${articles[0]}"]`),complete=page.locator(`[data-profile-article-id="${articles[1]}"]`);
      const button=pending.getByRole('button',{name:'Calificar transacción',exact:true}),done=complete.getByRole('button',{name:'Transacción calificada',exact:true});
      await button.waitFor();await done.waitFor();assert.equal(await done.isDisabled(),true);assert.equal(await done.innerText(),'Calificado');
      await pending.getByText('Calificación pendiente',{exact:true}).waitFor();assert.equal(await button.innerText(),'Calificar');
      assert.equal(await pending.locator('[data-profile-actions] > button').first().getAttribute('data-rating-action'),'true');
      assert.equal(await pending.getByRole('button',{name:tab==='Mis Rescates'?'Eliminar de Mis Rescates':'Eliminar publicación',exact:true}).isDisabled(),true);
      const css=await button.evaluate(el=>{const s=getComputedStyle(el);return{animation:s.animationName,iterations:s.animationIterationCount,duration:s.animationDuration,background:s.backgroundColor,width:el.getBoundingClientRect().width};});
      assert.equal(css.background,'rgb(255, 255, 255)');assert.equal(css.animation,reduced?'none':'profile-rating-attention');
      if(!reduced){assert.equal(css.iterations,'3');assert.equal(css.duration,'1.4s');}
      assert.equal(await done.evaluate(el=>getComputedStyle(el).animationName),'none');assert.equal(await done.evaluate(el=>el.getBoundingClientRect().width),css.width);
      await button.click();await page.getByRole('heading',{name:'Califica tu experiencia',exact:true}).waitFor();await page.getByRole('button',{name:'Ahora no',exact:true}).click();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
      const overlap=await pending.evaluate(el=>{const text=el.querySelector('[data-profile-content]').getBoundingClientRect(),actions=el.querySelector('[data-profile-actions]').getBoundingClientRect();
        return Math.min(text.right,actions.right)-Math.max(text.left,actions.left)>1&&Math.min(text.bottom,actions.bottom)-Math.max(text.top,actions.top)>1;});assert.equal(overlap,false);
      if(width===1440){await page.waitForTimeout(4500);assert.equal(await button.evaluate(el=>el.getAnimations().filter(animation=>animation.playState==='running').length),0);}
      console.log(`OK ${tab} ${width}px: labeled neutral action, completed state, finite pulse, reduced motion=${reduced}, no overlap.`);await context.close();
    }
  }
}finally{
  await browser.close();if(articles.length){checked(await service.from('reputacion').delete().in('articulo_id',articles));checked(await service.from('articulos').delete().in('id',articles));checked(await service.from('activity_notifications').delete().in('articulo_id',articles));}
  for(const user of users)checked(await service.auth.admin.deleteUser(user));
}
