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
const seller = createClient(status.API_URL, status.ANON_KEY, options);
const buyer = createClient(status.API_URL, status.ANON_KEY, options);
const outsider = createClient(status.API_URL, status.ANON_KEY, options);
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, options);
const checked = ({ data, error }) => { assert.ifError(error); return data; };
const appUrl = process.env.LOCAL_APP_URL || 'http://127.0.0.1:5174';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(appUrl).hostname));
const articleIds = [];
let browser;
try {
  const sellerSession = checked(await seller.auth.signInWithPassword({ email: 'cliente1@example.com', password: '123456' })).session;
  const buyerSession = checked(await buyer.auth.signInWithPassword({ email: 'cliente2@example.com', password: '123456' })).session;
  const outsiderSession = checked(await outsider.auth.signInWithPassword({ email: 'cliente3@example.com', password: '123456' })).session;
  const title = 'Avisos de recogida - PRUEBA TEMPORAL';
  const articleId = checked(await seller.from('articulos').insert({ owner_id: sellerSession.user.id, title, mode: 'venta', price: 1000,
    estado_producto: 8, status: 'disponible', estado: 'disponible', city: 'Bogotá', locality: 'Chapinero',
  }).select('id').single()).id;
  articleIds.push(articleId);
  const reserved = checked(await buyer.rpc('transition_sale', { p_articulo_id: articleId, p_action: 'reserve' }));
  const chatId = reserved.chat.id;
  checked(await seller.rpc('transition_sale', { p_articulo_id: articleId, p_action: 'approve_chat' }));
  const events = async (client, id = articleId) => checked(await client.from('activity_notifications').select('*').eq('articulo_id', id));
  assert.ok((await events(buyer)).some(item => item.type === 'sale_approved'));
  const slot = { p_chat_id: chatId, p_date: bogotaDate(new Date(Date.now() + 3 * 86400000)), p_start: '10:00', p_end: '12:00' };
  const first = checked(await buyer.rpc('propose_chat_pickup', slot));
  const proposal = (await events(seller)).find(item => item.type === 'pickup_proposed');
  assert.ok(proposal);
  assert.equal((await events(buyer)).some(item => item.type === 'pickup_proposed'), false);
  assert.deepEqual(await events(outsider), []);
  assert.ok((await buyer.from('activity_notifications').insert({ id: 'fake', recipient_id: sellerSession.user.id, type: 'pickup_proposed', title: 'Fake' })).error);
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
  const errors = [];
  const open = async (session, width) => {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 } });
    await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: seller.auth.storageKey, session });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(appUrl);
    await page.getByRole('button', { name: 'Notificaciones', exact: true }).waitFor();
    return page;
  };
  const sellerPage = await open(sellerSession, 1440);
  let activityReads = 0;
  sellerPage.on('request', request => { if (new URL(request.url()).pathname.endsWith('/activity_notifications')) activityReads++; });
  await sellerPage.waitForFunction(({ uid, id }) => JSON.parse(localStorage.getItem(`mb_notification_history_${uid}`) || '[]').some(item => item.id === id), { uid: sellerSession.user.id, id: proposal.id });
  await sellerPage.getByRole('button', { name: 'Notificaciones', exact: true }).click();
  const sellerMenu = sellerPage.getByRole('menu', { name: 'Notificaciones', exact: true });
  const notification = sellerMenu.locator(`[data-notification-id="${proposal.id}"]`);
  await notification.waitFor();
  await mkdir('/private/tmp/mibatute-marketplace', { recursive: true });
  await sellerPage.screenshot({ path: '/private/tmp/mibatute-marketplace/actividad-notificaciones-1440.png' });
  await notification.click();
  const region = sellerPage.getByRole('region', { name: 'Acuerdo de recogida' });
  await region.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await region.getByText('Confirmada por ambas personas', { exact: true }).waitFor();
  const confirmation = (await events(buyer)).find(item => item.type === 'pickup_confirmed');
  assert.ok(confirmation);
  const buyerPage = await open(buyerSession, 390);
  await buyerPage.waitForFunction(({ uid, id }) => JSON.parse(localStorage.getItem(`mb_notification_history_${uid}`) || '[]').some(item => item.id === id), { uid: buyerSession.user.id, id: confirmation.id });
  await buyerPage.getByRole('button', { name: 'Notificaciones', exact: true }).click();
  const buyerMenu = buyerPage.getByRole('menu', { name: 'Notificaciones', exact: true });
  await buyerMenu.locator(`[data-notification-id="${confirmation.id}"]`).waitFor();
  await buyerPage.screenshot({ path: '/private/tmp/mibatute-marketplace/actividad-notificaciones-390.png' });
  await buyerMenu.locator(`[data-notification-id="${confirmation.id}"]`).click();
  await buyerPage.getByRole('region', { name: 'Acuerdo de recogida' }).getByText('Confirmada por ambas personas', { exact: true }).waitFor();
  const second = checked(await buyer.rpc('propose_chat_pickup', { ...slot, p_start: '14:00', p_end: '16:00', p_replace_id: first.id }));
  const replacement = (await events(seller)).find(item => item.title === 'Nuevo horario de recogida');
  assert.ok(replacement);
  await sellerPage.waitForFunction(({ uid, id }) => JSON.parse(localStorage.getItem(`mb_notification_history_${uid}`) || '[]').some(item => item.id === id), { uid: sellerSession.user.id, id: replacement.id });
  await sellerPage.getByRole('button', { name: 'Volver', exact: true }).click();
  await sellerPage.getByRole('button', { name: 'Notificaciones', exact: true }).click();
  assert.equal(await sellerMenu.locator(`[data-notification-id="${proposal.id}"]`).getAttribute('data-read'), 'true');
  assert.equal(await sellerMenu.locator(`[data-notification-id="${replacement.id}"]`).getAttribute('data-read'), 'false');
  const before = activityReads;
  await sellerPage.getByRole('button', { name: 'Cerrar notificaciones', exact: true }).click();
  await sellerPage.getByRole('button', { name: 'Notificaciones', exact: true }).click();
  assert.equal(activityReads, before, 'Reabrir la campana reutiliza la cache.');
  checked(await seller.rpc('respond_chat_pickup', { p_pickup_id: second.id, p_action: 'reject' }));
  assert.ok((await events(buyer)).some(item => item.type === 'pickup_rejected'));
  const third = checked(await buyer.rpc('propose_chat_pickup', slot));
  checked(await seller.rpc('respond_chat_pickup', { p_pickup_id: third.id, p_action: 'cancel' }));
  assert.ok((await events(buyer)).some(item => item.type === 'pickup_canceled'));
  checked(await seller.rpc('transition_sale', { p_articulo_id: articleId, p_action: 'deliver' }));
  assert.ok((await events(buyer)).some(item => item.type === 'delivery_completed'));
  console.log('Correcto API y navegador: propuesta, confirmacion, cambio de horario, rechazo, cancelacion, entrega, privacidad y cache.');

  const donationId = checked(await seller.from('articulos').insert({ owner_id: sellerSession.user.id, title: 'Decisiones notificadas - PRUEBA TEMPORAL', mode: 'donacion', price: 0,
    estado_producto: 8, status: 'disponible', estado: 'disponible', city: 'Bogotá', locality: 'Chapinero',
  }).select('id').single()).id;
  articleIds.push(donationId);
  checked(await buyer.from('postulaciones').insert({ articulo_id: donationId, usuario_id: buyerSession.user.id, justificacion: 'Prueba de aviso' }));
  checked(await outsider.from('postulaciones').insert({ articulo_id: donationId, usuario_id: outsiderSession.user.id, justificacion: 'Prueba de rechazo' }));
  checked(await seller.from('articulos').update({ ganador_id: buyerSession.user.id, status: 'reservado', estado: 'reservado' }).eq('id', donationId));
  assert.ok((await events(buyer, donationId)).some(item => item.type === 'donation_accepted'));
  assert.ok((await events(outsider, donationId)).some(item => item.type === 'donation_rejected'));
  checked(await seller.from('articulos').update({ ganador_id: null, status: 'disponible', estado: 'disponible' }).eq('id', donationId));
  assert.ok((await events(buyer, donationId)).some(item => item.type === 'reservation_canceled'));
  checked(await admin.from('articulos').delete().eq('id', donationId));
  assert.ok((await events(buyer, donationId)).some(item => item.type === 'reservation_canceled'), 'Eliminar el origen no elimina el aviso.');
  assert.deepEqual(errors, []);
  console.log('Correcto: aceptacion/rechazo de donaciones, cancelacion y conservacion despues de borrar el origen.');
} finally {
  if (browser) await browser.close();
  if (articleIds.length) {
    checked(await admin.from('articulos').delete().in('id', articleIds));
    checked(await admin.from('activity_notifications').delete().in('articulo_id', articleIds));
  }
}
