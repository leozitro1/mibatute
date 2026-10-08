import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { localStatus } from './seed-applicants-local.mjs';
import { bogotaDate } from '../src/components/pickupAgreement.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const status = localStatus();
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, options);
const checked = ({ data, error }) => { assert.ifError(error); return data; };
const appUrl = process.env.LOCAL_APP_URL || 'http://127.0.0.1:5174';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(appUrl).hostname));
const proposals = checked(await admin.from('activity_notifications').select('*').eq('type', 'pickup_proposed').order('created_at', { ascending: false }).limit(10));
const users = checked(await admin.auth.admin.listUsers({ perPage: 1000 })).users;
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
const articleIds = [];
let messageId;
let receiptId;
try {
  await mkdir('/private/tmp/mibatute-marketplace', { recursive: true });
  for (const proposal of proposals) {
    const account = users.find(user => user.id === proposal.recipient_id);
    if (!account?.app_metadata?.local_fixture) continue;
    const client = createClient(status.API_URL, status.ANON_KEY, options);
    const session = checked(await client.auth.signInWithPassword({ email: account.email, password: '123456' })).session;
    const contextData = checked(await client.rpc('article_context', { p_article_id: proposal.articulo_id }));
    console.log(`Destino real: ${account.email}, articulo ${contextData[0]?.status}, chat ${contextData[0]?.transaction_chat?.status || 'no disponible'}.`);
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 } });
      await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: client.auth.storageKey, session });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') console.log(message.text()); });
      await page.goto(appUrl);
      await page.waitForFunction(({ uid, id }) => JSON.parse(localStorage.getItem(`mb_notification_history_${uid}`) || '[]').some(item => item.id === id), { uid: session.user.id, id: proposal.id });
      await page.getByRole('button', { name: 'Notificaciones', exact: true }).click();
      await page.locator(`[data-notification-id="${proposal.id}"]`).click();
      await page.getByRole('region', { name: 'Acuerdo de recogida' }).waitFor();
      await page.screenshot({ path: `/private/tmp/mibatute-marketplace/clic-recogida-real-${width}.png` });
      assert.equal(await page.locator('[data-chat-pickup]').count(), 1);
      assert.deepEqual(errors, []);
      console.log(`Correcto ${width}px: la propuesta existente abre su chat y el panel de recogida.`);
      await context.close();
    }
  }
  const seller = createClient(status.API_URL, status.ANON_KEY, options);
  const buyer = createClient(status.API_URL, status.ANON_KEY, options);
  const nextBuyer = createClient(status.API_URL, status.ANON_KEY, options);
  const sellerSession = checked(await seller.auth.signInWithPassword({ email: 'cliente1@example.com', password: '123456' })).session;
  const buyerSession = checked(await buyer.auth.signInWithPassword({ email: 'cliente2@example.com', password: '123456' })).session;
  const nextSession = checked(await nextBuyer.auth.signInWithPassword({ email: 'cliente3@example.com', password: '123456' })).session;
  const article = checked(await seller.from('articulos').insert({ owner_id: sellerSession.user.id,
    title: 'Enlaces historicos - PRUEBA TEMPORAL', mode: 'donacion', price: 0, estado_producto: 8,
    status: 'disponible', estado: 'disponible', city: 'Bogotá', locality: 'Chapinero',
  }).select('id').single());
  articleIds.push(article.id);
  checked(await buyer.from('postulaciones').insert({ articulo_id: article.id, usuario_id: buyerSession.user.id, justificacion: 'Prueba de enlaces' }));
  checked(await seller.from('articulos').update({ ganador_id: buyerSession.user.id, status: 'reservado', estado: 'reservado' }).eq('id', article.id));
  const chat = checked(await buyer.from('chats').select('id').eq('articulo_id', article.id).eq('buyer_id', buyerSession.user.id).single());
  checked(await seller.from('chat_messages').insert({ chat_id: chat.id, sender_id: sellerSession.user.id, body: 'Historia original de la recogida temporal' }));
  checked(await seller.rpc('propose_chat_pickup', { p_chat_id: chat.id,
    p_date: bogotaDate(new Date(Date.now() + 3 * 86400000)), p_start: '10:00', p_end: '12:00' }));
  const historicalProposal = checked(await buyer.from('activity_notifications').select('*').eq('articulo_id', article.id).eq('type', 'pickup_proposed').single());
  checked(await seller.from('articulos').update({ ganador_id: null, status: 'disponible', estado: 'disponible' }).eq('id', article.id));
  checked(await nextBuyer.from('postulaciones').insert({ articulo_id: article.id, usuario_id: nextSession.user.id, justificacion: 'Segunda reserva temporal' }));
  checked(await seller.from('articulos').update({ ganador_id: nextSession.user.id, status: 'reservado', estado: 'reservado' }).eq('id', article.id));
  const nextChat = checked(await nextBuyer.from('chats').select('id').eq('articulo_id', article.id).eq('buyer_id', nextSession.user.id).single());
  checked(await seller.from('chat_messages').insert({ chat_id: nextChat.id, sender_id: sellerSession.user.id, body: 'Mensaje privado de la nueva reserva temporal' }));
  messageId = checked(await admin.from('system_messages').insert({ title: 'Aviso exacto - PRUEBA TEMPORAL', body: 'Contenido completo del aviso temporal de prueba.' }).select('id').single()).id;
  receiptId = checked(await admin.from('system_message_receipts').insert({ message_id: messageId, user_id: buyerSession.user.id }).select('id').single()).id;
  const systemNotice = checked(await buyer.from('activity_notifications').select('*').eq('receipt_id', receiptId).single());
  const open = async (client, session, width) => {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 } });
    await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: client.auth.storageKey, session });
    const page = await context.newPage();
    page.on('dialog', dialog => { throw new Error(`Alerta inesperada: ${dialog.message()}`); });
    await page.goto(appUrl);
    return { context, page };
  };
  const clickNotice = async (page, session, id) => {
    await page.waitForFunction(({ uid, id }) => JSON.parse(localStorage.getItem(`mb_notification_history_${uid}`) || '[]').some(item => item.id === id), { uid: session.user.id, id });
    await page.getByRole('button', { name: 'Notificaciones', exact: true }).click();
    await page.locator(`[data-notification-id="${id}"]`).click();
  };
  for (const width of [1440, 390]) {
    const { context, page } = await open(buyer, buyerSession, width);
    await clickNotice(page, buyerSession, historicalProposal.id);
    await page.getByText('Conversación finalizada', { exact: true }).waitFor();
    await page.getByText('Historia original de la recogida temporal', { exact: true }).waitFor();
    assert.equal(await page.getByText('Mensaje privado de la nueva reserva temporal', { exact: true }).count(), 0);
    assert.equal(await page.locator('[data-chat-composer] textarea').count(), 0);
    await page.screenshot({ path: `/private/tmp/mibatute-marketplace/clic-recogida-historica-${width}.png` });
    await page.getByRole('button', { name: 'Volver', exact: true }).click();
    await clickNotice(page, buyerSession, systemNotice.id);
    const dialog = page.getByRole('dialog', { name: 'Aviso exacto - PRUEBA TEMPORAL' });
    await dialog.getByText('Contenido completo del aviso temporal de prueba.', { exact: true }).waitFor();
    assert.equal(await dialog.getAttribute('data-system-message-receipt'), receiptId);
    await page.screenshot({ path: `/private/tmp/mibatute-marketplace/clic-aviso-sistema-${width}.png` });
    await context.close();
    console.log(`Correcto ${width}px: aviso historico abre solo su chat cerrado; aviso del sistema abre su mensaje exacto.`);
  }
  // Older items must be found beyond the first profile page.
  const oldArticles = checked(await admin.from('articulos').insert(Array.from({ length: 6 }, (_, index) => ({
    owner_id: sellerSession.user.id, title: `Destino de perfil ${index + 1} - PRUEBA TEMPORAL`, mode: 'venta', price: 1000,
    estado_producto: 8, status: 'disponible', estado: 'disponible', city: 'Bogotá', locality: 'Chapinero',
    created_at: new Date(Date.now() - (index + 10) * 86400000).toISOString(),
  }))).select('id,created_at'));
  articleIds.push(...oldArticles.map(item => item.id));
  const oldest = oldArticles.sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
  checked(await admin.from('articulos').update({ status: 'en_revision', estado: 'en_revision' }).eq('id', oldest.id));
  const profileNotice = checked(await seller.from('activity_notifications').select('*').eq('articulo_id', oldest.id).eq('type', 'publication_review').single());
  for (const width of [1440, 390]) {
    const { context, page } = await open(seller, sellerSession, width);
    await clickNotice(page, sellerSession, profileNotice.id);
    await page.locator(`[data-profile-article-id="${oldest.id}"]`).waitFor();
    await page.waitForFunction(id => document.activeElement?.dataset.profileArticleId === id, oldest.id, { timeout: 10000 });
    await page.getByRole('searchbox', { name: 'Buscar en esta lista', exact: true }).fill('ningun articulo temporal coincide');
    assert.equal(await page.locator(`[data-profile-article-id="${oldest.id}"]`).count(), 0);
    await clickNotice(page, sellerSession, profileNotice.id);
    await page.waitForFunction(id => document.activeElement?.dataset.profileArticleId === id, oldest.id, { timeout: 10000 });
    assert.equal(await page.getByRole('searchbox', { name: 'Buscar en esta lista', exact: true }).inputValue(), '');
    await page.screenshot({ path: `/private/tmp/mibatute-marketplace/clic-publicacion-paginada-${width}.png` });
    await context.close();
    console.log(`Correcto ${width}px: el aviso encuentra y enfoca el articulo en otra pagina, incluso oculto por filtros.`);
  }
} finally {
  await browser.close();
  if (receiptId) {
    checked(await admin.from('activity_notifications').delete().eq('receipt_id', receiptId));
    checked(await admin.from('system_message_receipts').delete().eq('id', receiptId));
  }
  if (messageId) checked(await admin.from('system_messages').delete().eq('id', messageId));
  if (articleIds.length) {
    checked(await admin.from('articulos').delete().in('id', articleIds));
    checked(await admin.from('activity_notifications').delete().in('articulo_id', articleIds));
  }
}
