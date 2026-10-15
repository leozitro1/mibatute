import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHmac,randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { localStatus } from './seed-applicants-local.mjs';

const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const config=localStatus();
const appUrl=process.env.LOCAL_APP_URL||'http://127.0.0.1:5174';
assert.ok(['127.0.0.1','localhost'].includes(new URL(appUrl).hostname));
const options={auth:{persistSession:false,autoRefreshToken:false}};
const service=createClient(config.API_URL,config.SERVICE_ROLE_KEY,options);
const checked=({data,error})=>{if(error)throw error;return data;};
const fixture=`reports-${Date.now()}`,password=`Local-${randomUUID()}`;
const users=[],reportIds=[],chatReportIds=[];let article,reviewArticle;
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});

// Generate TOTP only for the disposable local staff account.
function totp(secret) {
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';
  for(const char of secret.toUpperCase().replace(/=+$/,''))bits+=alphabet.indexOf(char).toString(2).padStart(5,'0');
  const key=Buffer.from(bits.match(/.{8}/g).map(byte=>parseInt(byte,2)));const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const digest=createHmac('sha1',key).update(counter).digest();const offset=digest.at(-1)&15;
  return ((digest.readUInt32BE(offset)&0x7fffffff)%1000000).toString().padStart(6,'0');
}
async function account(name) {
  const email=`${fixture}-${name}@example.com`;
  const {user}=checked(await service.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{local_fixture:fixture},user_metadata:{nombre:`Prueba ${name}`}}));
  users.push(user.id);const client=createClient(config.API_URL,config.ANON_KEY,options);
  const {session}=checked(await client.auth.signInWithPassword({email,password}));return {user,client,session};
}
try {
  const seller=await account('seller'),buyer=await account('buyer'),admin=await account('admin');
  checked(await service.from('staff_accounts').insert({user_id:admin.user.id,role:'admin',active:true}));
  const title=`Reporte navegador ${fixture}`;
  article=checked(await service.from('articulos').insert({owner_id:seller.user.id,title,description:'Articulo temporal para comprobar los reportes.',mode:'venta',price:1000,status:'disponible',estado:'disponible',city:'Bogotá',locality:'Suba'}).select('id').single());
  const buyerContext=await browser.newContext({viewport:{width:390,height:844}});
  await buyerContext.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:buyer.client.auth.storageKey,session:buyer.session});
  const page=await buyerContext.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const alerts=[];page.on('dialog',async dialog=>{alerts.push(dialog.message());await dialog.accept();});
  await page.goto(appUrl);await page.getByRole('textbox',{name:'Buscar',exact:true}).fill(title);
  await page.locator('.product-card').filter({hasText:title}).click();
  await page.getByRole('button',{name:'Reportar',exact:true}).click();
  await page.getByLabel('Motivo',{exact:true}).selectOption('Spam');
  await page.getByLabel('Detalle (opcional)',{exact:true}).fill('Publicacion duplicada enviada desde el navegador');
  const articleResponse=page.waitForResponse(response=>response.url().includes('/rpc/submit_article_report'));
  await page.getByRole('button',{name:'ENVIAR REPORTE',exact:true}).click();
  const response=await articleResponse;assert.equal(response.status(),200);const articleReport=await response.json();reportIds.push(articleReport.id);
  await page.getByRole('button',{name:'ENVIAR REPORTE',exact:true}).waitFor({state:'hidden'});
  assert.ok(alerts.some(text=>text.includes('equipo de administración')));
  await page.getByRole('button',{name:'Reportar',exact:true}).click();await page.getByLabel('Motivo',{exact:true}).selectOption('Spam');
  const duplicateResponse=page.waitForResponse(result=>result.url().includes('/rpc/submit_article_report'));
  await page.getByRole('button',{name:'ENVIAR REPORTE',exact:true}).click();assert.equal((await (await duplicateResponse).json()).alreadyExists,true);
  assert.equal(checked(await seller.client.from('reports').select('id').eq('id',articleReport.id)).length,0);
  console.log('OK publication: actual browser form reaches reports; duplicate is not inserted; seller cannot read the private report.');

  checked(await buyer.client.rpc('transition_sale',{p_articulo_id:article.id,p_action:'reserve'}));
  checked(await seller.client.rpc('transition_sale',{p_articulo_id:article.id,p_action:'approve_chat'}));
  const chat=checked(await service.from('chats').select('id').eq('articulo_id',article.id).single());
  const message='Mensaje real de prueba para revisar la denuncia';
  checked(await seller.client.from('chat_messages').insert({chat_id:chat.id,sender_id:seller.user.id,body:message}));
  await page.goto(appUrl);await page.getByRole('button',{name:'Ver perfil',exact:true}).click();await page.getByRole('button',{name:'Mis Rescates',exact:true}).click();
  const rescue=page.locator('div').filter({has:page.getByText(title,{exact:true})}).filter({has:page.locator('[data-profile-actions]')}).last();
  await rescue.getByRole('button',{name:'Ver mensajes',exact:true}).click();await page.getByText(message,{exact:true}).waitFor();
  await page.getByRole('button',{name:'Denunciar conversación',exact:true}).click();await page.getByLabel('Motivo',{exact:true}).selectOption('acoso');
  await page.getByLabel('Descripción',{exact:true}).fill('Denuncia del chat enviada desde el navegador');
  const chatResponse=page.waitForResponse(result=>result.url().includes('/rpc/submit_chat_report'));
  await page.getByRole('button',{name:'Enviar',exact:true}).last().click();const chatResult=await chatResponse;assert.equal(chatResult.status(),200);
  const chatReport=await chatResult.json();chatReportIds.push(chatReport.id);
  await page.getByText('Denunciar usuario',{exact:true}).waitFor({state:'hidden'});
  assert.ok(alerts.some(text=>text.includes('Denuncia enviada al equipo de administración')));
  assert.equal(checked(await seller.client.from('chat_reports').select('id').eq('id',chatReport.id)).length,0);
  const readsBefore=checked(await service.from('chat_reads').select('id,last_read_at').eq('chat_id',chat.id));
  console.log('OK chat: visible flag opens the form; server saves actual conversation evidence, not a client snapshot.');
  const reviewTitle=`Publicacion revisable ${fixture}`;
  reviewArticle=checked(await service.from('articulos').insert({owner_id:seller.user.id,title:reviewTitle,mode:'venta',price:1000,is_featured:true,status:'disponible',estado:'disponible',city:'Bogotá',locality:'Suba'}).select('id').single());
  const reviewReport=checked(await buyer.client.rpc('submit_article_report',{p_article:reviewArticle.id,p_reason:'Spam',p_details:'Reporte de una publicacion disponible'}));reportIds.push(reviewReport.id);

  assert.ok((await admin.client.rpc('staff_report_detail',{p_id:chatReport.id,p_kind:'chat'})).error);
  const factor=checked(await admin.client.auth.mfa.enroll({factorType:'totp',friendlyName:fixture}));
  const staffSession=checked(await admin.client.auth.mfa.challengeAndVerify({factorId:factor.id,code:totp(factor.totp.secret)}));
  checked(await admin.client.rpc('staff_open_session'));
  assert.ok((await admin.client.rpc('staff_article_chat_audit',{p_article:article.id,p_reason:'Sin permiso de auditoria general'})).error);
  for(const width of [390,1440]) {
    const context=await browser.newContext({viewport:{width,height:900}});await context.addInitScript(session=>localStorage.setItem('mb-staff-auth',JSON.stringify(session)),staffSession);
    const staff=await context.newPage();staff.on('pageerror',error=>errors.push(error.message));await staff.goto(`${appUrl}/gestion/operaciones`);
    await staff.getByRole('heading',{name:'Pendientes',exact:true}).waitFor();
    if(width<768)await staff.getByRole('button',{name:'Abrir menú',exact:true}).click();
    await staff.getByRole('button',{name:'Reportes',exact:true}).click();
    const articleRow=staff.locator('tbody tr').filter({hasText:title}).filter({hasText:'Spam'});
    for(const name of ['En revisión','Aprobado','Eliminar'])assert.ok(await articleRow.getByRole('button',{name,exact:true}).isVisible());
    const actionRows=await articleRow.locator('.staff-report-actions').evaluate(element=>new Set([...element.children].map(button=>Math.round(button.getBoundingClientRect().top))).size);
    assert.equal(actionRows,1,'Report actions remain in one row');
    await articleRow.getByRole('button',{name:'Abrir reporte: Spam',exact:true}).click();
    await staff.getByText('Publicacion duplicada enviada desde el navegador',{exact:true}).waitFor();
    await staff.getByRole('button',{name:'Ver publicación',exact:true}).click();
    await staff.getByRole('dialog').getByRole('heading',{name:title,exact:true}).waitFor();
    await staff.getByRole('button',{name:'Cerrar publicación',exact:true}).click();
    const chatRow=staff.locator('tbody tr').filter({hasText:title}).filter({hasText:'acoso'});
    await chatRow.getByRole('button',{name:'Abrir reporte: acoso',exact:true}).click();
    await staff.getByText(message,{exact:true}).waitFor();
    assert.equal(await staff.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await staff.getByRole('button',{name:'Cerrar reporte',exact:true}).click();
    if(width===1440) {
      const reviewRow=staff.locator('tbody tr').filter({hasText:reviewTitle});
      await reviewRow.getByRole('button',{name:'En revisión',exact:true}).click();await staff.getByLabel('Motivo',{exact:true}).fill('Publicacion bajo revision por reporte de spam');
      await staff.getByRole('button',{name:'Confirmar',exact:true}).click();await reviewRow.locator('.staff-badge').getByText('En revisión',{exact:true}).waitFor();
      await staff.getByText('Reporte y publicación puestos en revisión. El propietario tiene el aviso en su buzón.',{exact:true}).waitFor();
      assert.equal(checked(await service.from('articulos').select('status').eq('id',reviewArticle.id).single()).status,'en_revision');
      const sellerInbox=checked(await seller.client.rpc('notification_inbox'));assert.ok(sellerInbox.some(item=>item.title==='Publicacion en revision'&&item.message.includes(reviewTitle)));
      const publicContext=await browser.newContext({viewport:{width:390,height:844}});const publicPage=await publicContext.newPage();await publicPage.goto(appUrl);
      await publicPage.getByRole('textbox',{name:'Buscar',exact:true}).fill(reviewTitle);
      const card=publicPage.locator('.product-card').filter({hasText:reviewTitle});await card.waitFor();assert.equal(await card.getAttribute('aria-disabled'),'true');
      assert.ok(await card.locator('.product-card-photo').getByText('En revisión',{exact:true}).isVisible());
      const featured=publicPage.getByRole('button',{name:`Destacado: ${reviewTitle}`,exact:true});assert.ok(await featured.isDisabled());assert.ok(await featured.getByText('En revisión',{exact:true}).isVisible());await publicContext.close();
      console.log('OK: reviewing an available publication report updates the catalog and featured banner and notifies its owner in the same transaction.');
      await reviewRow.getByRole('button',{name:'Aprobado',exact:true}).click();await staff.getByLabel('Motivo',{exact:true}).fill('Caso revisado sin incumplimiento');
      await staff.getByRole('button',{name:'Confirmar',exact:true}).click();await reviewRow.waitFor({state:'hidden'});
      assert.equal(checked(await service.from('articulos').select('status').eq('id',reviewArticle.id).single()).status,'disponible');
      assert.ok(checked(await seller.client.rpc('notification_inbox')).some(item=>item.title==='Publicacion aprobada'&&item.message.includes(reviewTitle)));
      await chatRow.getByRole('button',{name:'Aprobado',exact:true}).click();await staff.getByLabel('Motivo',{exact:true}).fill('Caso revisado por administracion en prueba');
      await staff.getByRole('button',{name:'Confirmar',exact:true}).click();await chatRow.waitFor({state:'hidden'});
      assert.equal(checked(await service.from('articulos').select('status').eq('id',article.id).single()).status,'reservado');
      const deletionCase=checked(await buyer.client.rpc('submit_article_report',{p_article:reviewArticle.id,p_reason:'Spam',p_details:'Comprobacion de eliminacion por reporte'}));reportIds.push(deletionCase.id);
      await staff.getByRole('button',{name:'Actualizar',exact:true}).click();await reviewRow.waitFor();
      await reviewRow.getByRole('button',{name:'Eliminar',exact:true}).click();
      await staff.getByLabel('Razón de eliminación',{exact:true}).selectOption('duplicate');
      await staff.getByLabel('Detalle para el propietario',{exact:true}).fill('Publicacion duplicada confirmada tras la revision');
      await staff.getByRole('button',{name:'Eliminar y notificar',exact:true}).click();await reviewRow.waitFor({state:'hidden'});
      assert.equal(checked(await service.from('articulos').select('id').eq('id',reviewArticle.id)).length,0);
      assert.ok(checked(await seller.client.rpc('notification_inbox')).some(item=>item.title==='Publicacion eliminada'&&item.message.includes(reviewTitle)));
    }
    console.log(`OK Admin ${width}px: both submitted reports appear, full details and bounded chat evidence open successfully.`);
    await context.close();
  }
  const resolved=checked(await service.from('chat_reports').select('status,resolution,handled_by_user_id').eq('id',chatReport.id).single());
  assert.equal(resolved.status,'resolved');assert.equal(resolved.handled_by_user_id,admin.user.id);assert.match(resolved.resolution,/administracion/);
  assert.deepEqual(checked(await service.from('chat_reads').select('id,last_read_at').eq('chat_id',chat.id)),readsBefore);
  assert.deepEqual(errors,[]);
  console.log('OK: handling is audited and reading report evidence does not change participant read markers.');
} finally {
  await browser.close();
  if(reportIds.length)checked(await service.from('reports').delete().in('id',reportIds));
  if(chatReportIds.length)checked(await service.from('chat_reports').delete().in('id',chatReportIds));
  if(article)checked(await service.from('articulos').delete().eq('id',article.id));
  if(reviewArticle)checked(await service.from('articulos').delete().eq('id',reviewArticle.id));
  if(users.length)checked(await service.from('system_messages').delete().in('sender_id',users));
  if(users.length)checked(await service.from('staff_audit').delete().in('actor_id',users));
  for(const uid of users)checked(await service.auth.admin.deleteUser(uid));
}
