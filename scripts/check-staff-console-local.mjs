import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHmac, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { localStatus } from './seed-applicants-local.mjs';

const require=createRequire(import.meta.url);
const { chromium }=require('playwright');
const config=localStatus();
const appUrl=process.env.LOCAL_APP_URL||'http://127.0.0.1:5174';
assert.ok(['localhost','127.0.0.1'].includes(new URL(appUrl).hostname));
const options={auth:{persistSession:false,autoRefreshToken:false}};
const service=createClient(config.API_URL,config.SERVICE_ROLE_KEY,options);
const checked=({data,error})=>{if(error)throw new Error(error.message);return data;};
const users=[],articleIds=[],sponsorIds=[],messageIds=[];
const fixture=`staff-${Date.now()}`;
const password=`Local-${randomUUID()}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});

// Generate codes only for disposable local test factors. Production MFA is handled by Supabase.
function totp(secret) {
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits='';for(const char of secret.toUpperCase().replace(/=+$/,''))bits+=alphabet.indexOf(char).toString(2).padStart(5,'0');
  const key=Buffer.from(bits.match(/.{8}/g).map(byte=>parseInt(byte,2)));
  const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const digest=createHmac('sha1',key).update(counter).digest();const offset=digest.at(-1)&15;
  return ((digest.readUInt32BE(offset)&0x7fffffff)%1000000).toString().padStart(6,'0');
}
async function account(role) {
  const email=`${fixture}-${role}@example.com`;
  const {user}=checked(await service.auth.admin.createUser({email,password,email_confirm:true,
    app_metadata:{local_fixture:fixture},user_metadata:{nombre:`Prueba ${role}`}}));
  users.push(user.id);
  if(role!=='buyer')checked(await service.from('staff_accounts').insert({user_id:user.id,role,active:true}));
  const client=createClient(config.API_URL,config.ANON_KEY,options);
  const {session}=checked(await client.auth.signInWithPassword({email,password}));
  return {user,email,client,session};
}
async function verified(actor) {
  const enrollment=checked(await actor.client.auth.mfa.enroll({factorType:'totp',friendlyName:fixture}));
  const verification=checked(await actor.client.auth.mfa.challengeAndVerify({factorId:enrollment.id,code:totp(enrollment.totp.secret)}));
  assert.equal(checked(await actor.client.auth.mfa.getAuthenticatorAssuranceLevel()).currentLevel,'aal2');
  checked(await actor.client.rpc('staff_open_session'));
  return {...actor,session:verification,factorId:enrollment.id,secret:enrollment.totp.secret};
}
try {
  const buyer=await account('buyer');
  assert.ok((await buyer.client.rpc('staff_bootstrap')).error);
  assert.ok((await buyer.client.from('usuarios').update({role:'master'}).eq('id',buyer.user.id)).error);
  assert.equal(checked(await buyer.client.from('usuarios').select('id,movil,direccion').neq('id',buyer.user.id)).length,0);
  assert.ok(checked(await buyer.client.from('usuarios_publicos').select('id,nombre,foto_url').limit(1)).length>0);
  const admin=await account('admin');
  assert.ok((await admin.client.rpc('staff_queue',{p_section:'reports'})).error);
  assert.ok((await admin.client.rpc('staff_open_session')).error);
  const verifiedAdmin=await verified(admin);
  const weakClient=createClient(config.API_URL,config.ANON_KEY,options);
  checked(await weakClient.auth.signInWithPassword({email:admin.email,password}));
  const extraFactor=await weakClient.auth.mfa.enroll({factorType:'totp',friendlyName:`${fixture}-extra`});
  if(extraFactor.data?.id)checked(await verifiedAdmin.client.auth.mfa.unenroll({factorId:extraFactor.data.id}));
  assert.ok(extraFactor.error,'An aal1 session must not enroll another factor over an existing verified factor');
  assert.ok((await verifiedAdmin.client.rpc('staff_queue',{p_section:'team'})).error);
  const master=await verified(await account('master'));
  const article=checked(await service.from('articulos').insert({owner_id:buyer.user.id,title:`${fixture} publicacion`,mode:'venta',price:1000,status:'disponible',estado:'disponible',review_status:'pending',city:'Bogotá',locality:'Suba',is_featured:true}).select('id').single());
  articleIds.push(article.id);
  const actionArgs={p_kind:'article',p_id:article.id,p_action:'approve',p_reason:'Prueba local de moderacion',p_options:{}};
  checked(await verifiedAdmin.client.rpc('staff_action',actionArgs));
  assert.equal(checked(await service.from('articulos').select('review_status').eq('id',article.id).single()).review_status,'approved');
  assert.ok(checked(await verifiedAdmin.client.rpc('staff_queue',{p_section:'audit'})).rows.some(row=>row.action==='article.approve'));
  checked(await master.client.rpc('transition_sale',{p_articulo_id:article.id,p_action:'reserve'}));
  const historyConversation=checked(await service.from('chats').select('id').eq('articulo_id',article.id).single());
  checked(await buyer.client.rpc('transition_sale',{p_articulo_id:article.id,p_action:'cancel'}));
  assert.ok((await verifiedAdmin.client.rpc('staff_article_chat_audit',{p_article:article.id,p_reason:'Prueba de acceso sin permiso'})).error);
  const activeArticle=checked(await service.from('articulos').insert({owner_id:buyer.user.id,title:`${fixture} negociacion activa`,mode:'venta',price:1000,status:'disponible',estado:'disponible',city:'Bogotá',locality:'Suba'}).select('id').single());
  articleIds.push(activeArticle.id);
  checked(await master.client.rpc('transition_sale',{p_articulo_id:activeArticle.id,p_action:'reserve'}));
  checked(await buyer.client.rpc('transition_sale',{p_articulo_id:activeArticle.id,p_action:'approve_chat'}));
  const conversation=checked(await service.from('chats').select('id').eq('articulo_id',activeArticle.id).single());
  checked(await master.client.from('chat_messages').insert({chat_id:conversation.id,sender_id:master.user.id,body:'Negociacion local de prueba: podemos acordar la entrega.'}));
  assert.equal(checked(await verifiedAdmin.client.from('chat_messages').select('id').eq('chat_id',conversation.id)).length,0);
  assert.equal(checked(await verifiedAdmin.client.rpc('staff_queue',{p_section:'articles',p_search:fixture,p_filters:{chat:'active'}})).total,1);
  assert.equal(checked(await verifiedAdmin.client.rpc('staff_queue',{p_section:'articles',p_search:fixture,p_filters:{chat:'none'}})).total,0);
  assert.ok((await master.client.rpc('staff_article_chat_audit',{p_article:activeArticle.id,p_chat:historyConversation.id,p_reason:'Prueba de relacion equivocada'})).error);
  checked(await verifiedAdmin.client.rpc('staff_action',{...actionArgs,p_action:'pause'}));
  checked(await verifiedAdmin.client.rpc('staff_action',{...actionArgs,p_action:'pause'}));
  const pauseInbox=checked(await buyer.client.rpc('notification_inbox'));
  const pauseNotices=pauseInbox.filter(item=>item.title==='Publicacion en revision');
  assert.equal(pauseNotices.length,1);messageIds.push(pauseNotices[0].id);
  assert.match(pauseNotices[0].message,/no confirma un incumplimiento/);
  assert.match(pauseNotices[0].message,/Prueba local de moderacion/);
  const pauseActivity=checked(await buyer.client.from('activity_notifications').select('type,receipt_id'));
  assert.equal(pauseActivity.filter(item=>item.receipt_id===pauseNotices[0].receipt_id).length,1);
  assert.equal(pauseActivity.some(item=>item.type==='publication_review'),false);
  assert.equal(checked(await service.from('articulos').select('status').eq('id',article.id).single()).status,'en_revision');
  assert.ok((await buyer.client.from('articulos').update({status:'disponible',estado:'disponible'}).eq('id',article.id)).error);
  const publicClient=createClient(config.API_URL,config.ANON_KEY,options);
  const home=checked(await publicClient.rpc('home_article_page',{p_filters:{city:'Bogotá',locality:'Suba',search:fixture},p_page:1}));
  assert.ok(home.ids.includes(article.id),'Review items remain in the public paginated catalog');
  assert.ok((await publicClient.rpc('staff_article_detail',{p_id:article.id})).error);
  assert.ok((await master.client.rpc('transition_sale',{p_articulo_id:article.id,p_action:'reserve'})).error);
  const publicContext=await browser.newContext({viewport:{width:390,height:844}});
  const publicPage=await publicContext.newPage();await publicPage.goto(appUrl);
  await publicPage.getByRole('textbox',{name:'Buscar',exact:true}).fill(fixture);
  const reviewedCard=publicPage.locator('.product-card').filter({hasText:`${fixture} publicacion`});
  await reviewedCard.waitFor({state:'visible'});
  assert.equal(await reviewedCard.getAttribute('aria-disabled'),'true');
  assert.ok(await reviewedCard.locator('.product-card-photo').getByText('En revisión',{exact:true}).isVisible());
  assert.equal(await reviewedCard.locator('.product-card-body').evaluate(element=>getComputedStyle(element).opacity),'0.7');
  await publicContext.close();
  assert.ok((await verifiedAdmin.client.rpc('staff_queue',{p_section:'sponsors'})).error);
  const sponsor=checked(await master.client.rpc('staff_action',{p_kind:'sponsor',p_id:null,p_action:'save',p_reason:'Patrocinador temporal de prueba',p_options:{texto:fixture,descripcion:'Borrador local',activo:false}}));
  sponsorIds.push(sponsor.id);
  assert.equal(checked(await master.client.rpc('staff_queue',{p_section:'sponsors',p_search:fixture})).rows[0].activo,false);
  console.log('OK API: ordinary and aal1 users denied; MFA verified; admin moderation audited; team restricted to Super Admin.');
  const withoutChats=checked(await service.from('articulos').insert({owner_id:buyer.user.id,title:`${fixture} sin conversaciones`,mode:'venta',price:1000,status:'disponible',estado:'disponible',city:'Bogotá',locality:'Suba'}).select('id').single());
  articleIds.push(withoutChats.id);

  for(const [actor,path] of [[master,'/gestion/direccion'],[verifiedAdmin,'/gestion/operaciones']]) {
    for(const width of [320,390,768,1440]) {
      const context=await browser.newContext({viewport:{width,height:900}});
      await context.addInitScript(session=>localStorage.setItem('mb-staff-auth',JSON.stringify(session)),actor.session);
      const page=await context.newPage();const errors=[];let publicRequests=0;
      page.on('pageerror',error=>errors.push(error.message));
      page.on('request',request=>{if(request.url().includes('/rpc/home_article_page'))publicRequests++;});
      await page.goto(`${appUrl}${path}`);
      await page.getByRole('heading',{name:'Pendientes',exact:true}).waitFor();
      const openMenu=async()=>{if(width<768)await page.getByRole('button',{name:'Abrir menú',exact:true}).click();};
      await openMenu();
      if(actor===verifiedAdmin){assert.equal(await page.getByRole('button',{name:'Equipo',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Patrocinadores',exact:true}).count(),0);}
      for(const section of actor===master?['Publicaciones','Reportes','Usuarios','Patrocinadores','Equipo','Auditoría']:['Publicaciones','Reportes','Usuarios','Auditoría']) {
        await page.getByRole('button',{name:section,exact:true}).click();
        await page.getByRole('heading',{name:section,exact:true}).waitFor();
        await page.waitForLoadState('networkidle');
        if(section==='Auditoría') {
          await page.getByLabel('Tipo de actividad',{exact:true}).selectOption('sessions');
          await page.getByLabel('Período',{exact:true}).selectOption('1');
          if(actor===master)await page.getByLabel('Responsable',{exact:true}).selectOption('me');
          await page.getByRole('textbox',{name:'Buscar en el panel'}).fill('inicio de sesion');
          await page.getByText('1 acción registrada',{exact:true}).waitFor();
          assert.equal(await page.locator('tbody tr').count(),1);assert.ok(await page.getByText('Inicio de sesión',{exact:true}).isVisible());
          assert.equal(await page.getByText('session.open',{exact:true}).count(),0);
          if(actor===master) {
            const selectedMember=page.waitForResponse(response=>response.url().includes('/rpc/staff_audit_entries')&&response.request().postDataJSON().p_actor===verifiedAdmin.user.id);
            await page.getByLabel('Responsable',{exact:true}).selectOption(verifiedAdmin.user.id);
            await selectedMember;
            await page.getByText('1 acción registrada',{exact:true}).waitFor();
            assert.equal(await page.locator('tbody tr').count(),1);
            assert.ok(await page.locator('tbody').getByText(verifiedAdmin.email,{exact:true}).isVisible());
            const rows=checked(await master.client.rpc('staff_audit_entries',{p_actor:verifiedAdmin.user.id,p_group:'sessions',p_days:1}));
            assert.ok(rows.rows.every(row=>row.actor_id===verifiedAdmin.user.id));
          }
          await page.getByLabel('Tipo de actividad',{exact:true}).selectOption('articles');
          await page.getByText('0 acciones registradas',{exact:true}).waitFor();
          await page.getByRole('button',{name:'Limpiar filtros',exact:true}).click();await page.waitForLoadState('networkidle');
          assert.equal(await page.getByRole('textbox',{name:'Buscar en el panel'}).inputValue(),'');
          assert.equal(await page.getByLabel('Tipo de actividad',{exact:true}).inputValue(),'');
          assert.equal(await page.getByLabel('Período',{exact:true}).inputValue(),'0');
          if(actor===verifiedAdmin)assert.equal(await page.getByLabel('Responsable',{exact:true}).count(),0);
        }
        if(section==='Publicaciones') {
          await page.getByLabel('Tipo de publicación',{exact:true}).selectOption('venta');
          await page.getByLabel('Ciudad',{exact:true}).selectOption('Bogotá');
          await page.getByLabel('Localidad',{exact:true}).selectOption('Suba');
          await page.getByLabel('Estado',{exact:true}).selectOption('en_revision');
          await page.getByRole('textbox',{name:'Buscar en el panel'}).fill(fixture);
          await page.getByLabel('Destacados',{exact:true}).selectOption('no');
          await page.getByText('0 publicaciones',{exact:true}).waitFor();
          await page.getByLabel('Destacados',{exact:true}).selectOption('yes');
          await page.getByText('1 publicación',{exact:true}).waitFor();
          assert.ok(await page.getByRole('img',{name:'Publicación destacada',exact:true}).isVisible());
          const actionLayout=await page.locator('.staff-publication-actions').evaluate(element=>{
            const buttons=[...element.children].map(button=>button.getBoundingClientRect());
            return {rows:new Set(buttons.map(rect=>Math.round(rect.top))).size,height:element.getBoundingClientRect().height,
              contained:buttons.every(rect=>rect.left>=element.getBoundingClientRect().left&&rect.right<=element.getBoundingClientRect().right+1)};
          });
          assert.equal(actionLayout.rows,2,'Publication actions occupy exactly two rows');
          assert.equal(actionLayout.height,92);assert.ok(actionLayout.contained);
          await page.getByRole('button',{name:`Abrir publicación: ${fixture} publicacion`,exact:true}).click();
          await page.getByRole('dialog').getByText('Sin descripción',{exact:true}).waitFor();
          await page.getByRole('dialog').getByText('60 días restantes',{exact:true}).waitFor();
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
          await page.getByRole('button',{name:'Cerrar publicación',exact:true}).click();
          await page.getByLabel('Destacados',{exact:true}).selectOption('');
          await page.getByLabel('Chat de negociación',{exact:true}).selectOption('none');
          await page.getByText('No hay registros que coincidan.',{exact:true}).waitFor();
          await page.getByText('0 publicaciones',{exact:true}).waitFor();
          assert.equal(await page.locator('.staff-results-count').innerText(),'0 publicaciones');
          await page.getByLabel('Chat de negociación',{exact:true}).selectOption('any');
          await page.getByRole('button',{name:`Abrir publicación: ${fixture} publicacion`,exact:true}).waitFor();
          await page.waitForLoadState('networkidle');
          assert.equal(await page.locator('.staff-results-count').innerText(),'1 publicación');
          assert.ok(await page.getByText('1 chat',{exact:true}).isVisible());
          const publisherRow=page.locator('tbody tr').filter({hasText:`${fixture} publicacion`});
          await publisherRow.getByRole('button',{name:'Ver publicaciones de Prueba buyer',exact:true}).click();
          await page.getByRole('button',{name:'Ver todas',exact:true}).waitFor();
          await page.getByText('1 publicación',{exact:true}).waitFor();
          assert.equal(await page.locator('.staff-results-count').innerText(),'1 publicación');
          assert.equal(await page.getByLabel('Ciudad',{exact:true}).inputValue(),'Bogotá');
          assert.equal(await page.getByLabel('Estado',{exact:true}).inputValue(),'en_revision');
          assert.equal(await page.getByRole('textbox',{name:'Buscar en el panel'}).inputValue(),fixture);
          assert.equal(await page.getByRole('dialog').count(),0);
          await page.getByRole('button',{name:'Ver todas',exact:true}).click();
          await page.waitForLoadState('networkidle');
          assert.equal(await page.getByRole('button',{name:'Ver todas',exact:true}).count(),0);
          assert.equal(await page.getByLabel('Chat de negociación',{exact:true}).inputValue(),'any');
          if(actor===master) {
            await page.getByLabel('Estado',{exact:true}).selectOption('reservado');
            await page.getByLabel('Chat de negociación',{exact:true}).selectOption('active');
            await page.getByRole('button',{name:`Abrir publicación: ${fixture} negociacion activa`,exact:true}).waitFor();
            assert.ok(await page.getByRole('button',{name:'Ver publicación',exact:true}).isEnabled());
            await page.getByRole('button',{name:'Ver publicación',exact:true}).click();
            await page.getByRole('dialog').getByText('Reservado',{exact:true}).waitFor();
            await page.getByRole('button',{name:'Cerrar publicación',exact:true}).click();
            assert.ok(await page.getByRole('button',{name:'Auditar chats de publicación',exact:true}).isEnabled());
            assert.equal(await page.getByRole('button',{name:'Editar publicación',exact:true}).isEnabled(),false);
            assert.equal(await page.getByRole('button',{name:'Eliminar publicación',exact:true}).isEnabled(),false);
            await page.getByRole('button',{name:'Auditar chats de publicación',exact:true}).click();
            await page.getByLabel('Motivo de acceso',{exact:true}).fill('Revision local de una negociacion');
            await page.getByRole('button',{name:'Consultar chats',exact:true}).click();
            await page.getByRole('button',{name:`Abrir conversación ${conversation.id}`,exact:true}).click();
            await page.getByText('Negociacion local de prueba: podemos acordar la entrega.',{exact:true}).waitFor();
            assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
            await page.getByRole('button',{name:'Cerrar auditoría',exact:true}).click();
            await page.getByLabel('Estado',{exact:true}).selectOption('en_revision');
            await page.getByLabel('Chat de negociación',{exact:true}).selectOption('any');
            await page.getByRole('button',{name:`Abrir publicación: ${fixture} publicacion`,exact:true}).waitFor();
          } else assert.equal(await page.getByRole('button',{name:'Auditar chats de publicación',exact:true}).count(),0);
          assert.equal(await page.getByRole('button',{name:'Reactivar publicación',exact:true}).count(),1);
          await page.getByRole('button',{name:'Limpiar filtros',exact:true}).click();
          await page.waitForLoadState('networkidle');
          if(actor===master) {
            await page.getByRole('textbox',{name:'Buscar en el panel'}).fill(`${fixture} sin conversaciones`);
            const emptyChatRow=page.locator('tbody tr').filter({hasText:`${fixture} sin conversaciones`});
            await emptyChatRow.waitFor();
            await page.waitForLoadState('networkidle');
            const chatButton=emptyChatRow.getByRole('button',{name:'Auditar chats de publicación',exact:true});
            assert.equal(await chatButton.isEnabled(),false);
            assert.equal(await chatButton.getAttribute('title'),'Esta publicación no tiene conversaciones');
            assert.equal(await chatButton.evaluate(element=>getComputedStyle(element).opacity),'0.4');
            await page.getByRole('button',{name:'Limpiar filtros',exact:true}).click();
            await page.waitForLoadState('networkidle');
          }
        }
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width}px ${section}: overflow`);
        await openMenu();
      }
      assert.equal(publicRequests,0,'Staff screens must not load the public catalog');
      assert.deepEqual(errors,[]);
      console.log(`OK ${actor===master?'Super Admin':'Admin'} ${width}px: navigation, permissions, responsive tables, no public catalog queries.`);
      await context.close();
    }
  }
  const loginContext=await browser.newContext({viewport:{width:390,height:844}});
  const loginPage=await loginContext.newPage();
  await loginPage.goto(`${appUrl}/gestion/operaciones`);
  await loginPage.getByLabel('Correo o usuario',{exact:true}).fill(admin.email);
  await loginPage.getByLabel('Contraseña',{exact:true}).fill(password);
  await loginPage.getByRole('button',{name:'Ingresar',exact:true}).click();
  await loginPage.getByRole('heading',{name:'Verificar acceso',exact:true}).waitFor();
  assert.equal(await loginPage.getByRole('heading',{name:'Pendientes',exact:true}).count(),0);
  await loginPage.getByLabel('Código del autenticador',{exact:true}).fill(totp(verifiedAdmin.secret));
  await loginPage.getByRole('button',{name:'Verificar',exact:true}).click();
  await loginPage.getByRole('heading',{name:'Pendientes',exact:true}).waitFor();
  console.log('OK browser: password alone never opens the panel; authenticator verification completes login.');
  await loginPage.getByRole('button',{name:'Abrir menú',exact:true}).click();
  await loginPage.getByRole('button',{name:'Publicaciones',exact:true}).click();
  await loginPage.getByRole('textbox',{name:'Buscar en el panel'}).fill(`${fixture} publicacion`);
  const fixtureRow=loginPage.locator('tbody tr').filter({hasText:fixture});
  await fixtureRow.getByRole('button',{name:'Reactivar publicación',exact:true}).click();
  await loginPage.getByLabel('Motivo',{exact:true}).fill('Reactivacion de prueba local');await loginPage.getByRole('button',{name:'Confirmar',exact:true}).click();
  await fixtureRow.getByRole('button',{name:'Pausar publicación',exact:true}).waitFor();
  await fixtureRow.getByRole('button',{name:'Eliminar publicación',exact:true}).click();
  assert.ok(await loginPage.getByRole('button',{name:'Eliminar y notificar',exact:true}).isDisabled());
  await loginPage.getByLabel('Razón de eliminación',{exact:true}).selectOption('duplicate');
  await loginPage.getByLabel('Detalle para el propietario',{exact:true}).fill('Es una publicacion duplicada de prueba');
  await loginPage.getByRole('button',{name:'Eliminar y notificar',exact:true}).click();
  await loginPage.getByText('No hay registros que coincidan.',{exact:true}).waitFor();
  const inbox=checked(await buyer.client.rpc('notification_inbox'));
  const deletionNotice=inbox.find(item=>item.title==='Publicacion eliminada');
  assert.ok(deletionNotice);messageIds.push(deletionNotice.id);
  assert.match(deletionNotice.message,/duplicada o spam/);assert.match(deletionNotice.message,/duplicada de prueba/);
  assert.equal(checked(await master.client.rpc('notification_inbox')).some(item=>item.id===deletionNotice.id),false);
  assert.ok(checked(await buyer.client.from('activity_notifications').select('type,receipt_id')).some(item=>item.type==='system_notice'&&item.receipt_id===deletionNotice.receipt_id));
  assert.equal(checked(await service.from('articulos').select('id').eq('id',article.id)).length,0);
  console.log('OK moderation: filtered mobile/desktop preview, review remains public, reactivation icon, deletion reason delivered only to owner inbox.');
  assert.ok(checked(await master.client.rpc('staff_queue',{p_section:'audit',p_search:'chat.audit'})).total>=8);
  console.log('OK chats: filtered totals, active/history badges, read-only reasoned audit on mobile/desktop, dedicated permission, private pause notices.');
  console.log('OK publishers: names visible, owner filter preserves other filters and search, Ver todas resets only owner, detail remains clickable.');
  await loginContext.close();
  checked(await master.client.rpc('staff_action',{p_kind:'staff',p_id:admin.user.id,p_action:'disable',p_reason:'Prueba local de revocacion',p_options:{}}));
  assert.ok((await verifiedAdmin.client.rpc('staff_queue',{p_section:'reports'})).error);
  console.log('OK: staff revocation invalidates an existing aal2 session immediately.');
} finally {
  await browser.close();
  if(articleIds.length)checked(await service.from('articulos').delete().in('id',articleIds));
  if(sponsorIds.length)checked(await service.from('patrocinadores').delete().in('id',sponsorIds));
  if(messageIds.length)checked(await service.from('system_messages').delete().in('id',messageIds));
  if(users.length)checked(await service.from('system_messages').delete().in('sender_id',users));
  // Remove only explicitly disposable local fixtures and their audit records.
  if(users.length)checked(await service.from('staff_audit').delete().in('actor_id',users));
  for(const userId of users)checked(await service.auth.admin.deleteUser(userId));
}
