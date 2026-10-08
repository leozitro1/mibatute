import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { bogotaDate } from '../src/components/pickupAgreement.js';

const env = { ...process.env, PATH: `/Applications/Docker.app/Contents/Resources/bin:${process.env.PATH}` };
const status = JSON.parse(execFileSync('npx', ['--yes', 'supabase@2.119.0', 'status', '-o', 'json'], {
  env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
}));
assert.equal(new URL(status.API_URL).hostname, '127.0.0.1');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const seller = createClient(status.API_URL, status.ANON_KEY, options);
const buyer = createClient(status.API_URL, status.ANON_KEY, options);
const outsider = createClient(status.API_URL, status.ANON_KEY, options);
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, options);
const checked = ({ data, error }) => { assert.ifError(error); return data; };
const articles = [];
let browser;
try {
  const sellerSession = checked(await seller.auth.signInWithPassword({ email: 'cliente1@example.com', password: '123456' })).session;
  const buyerSession = checked(await buyer.auth.signInWithPassword({ email: 'cliente2@example.com', password: '123456' })).session;
  checked(await outsider.auth.signInWithPassword({ email: 'cliente3@example.com', password: '123456' }));
  const title = 'Coordinacion de recogida - PRUEBA TEMPORAL';
  const articleId = checked(await seller.from('articulos').insert({
    owner_id: sellerSession.user.id, title, mode: 'venta', price: 1000,
    estado_producto: 8, status: 'disponible', estado: 'disponible', city: 'Bogotá', locality: 'Chapinero',
  }).select('id').single()).id;
  articles.push(articleId);
  const reserved = checked(await buyer.rpc('transition_sale', { p_articulo_id: articleId, p_action: 'reserve' }));
  const chatId = reserved.chat.id;
  const slot = { p_chat_id: chatId, p_date: bogotaDate(new Date(Date.now() + 2 * 86400000)), p_start: '10:00', p_end: '12:00' };
  assert.ok((await buyer.rpc('propose_chat_pickup', slot)).error, 'Chat pendiente no puede acordar recogida.');
  checked(await seller.rpc('transition_sale', { p_articulo_id: articleId, p_action: 'approve_chat' }));
  assert.ok((await outsider.rpc('propose_chat_pickup', slot)).error);
  assert.ok((await buyer.from('chat_pickups').insert({ chat_id: chatId, proposed_by: buyerSession.user.id,
    pickup_date: slot.p_date, start_time: '10:00', end_time: '12:00' })).error, 'Escritura directa bloqueada.');
  assert.ok((await buyer.rpc('propose_chat_pickup', { ...slot, p_end: '09:00' })).error);
  const proposed = checked(await buyer.rpc('propose_chat_pickup', slot));
  assert.ok((await buyer.rpc('respond_chat_pickup', { p_pickup_id: proposed.id, p_action: 'confirm' })).error);
  assert.deepEqual(checked(await outsider.from('chat_pickups').select('id').eq('chat_id', chatId)), []);
  const confirmed = checked(await seller.rpc('respond_chat_pickup', { p_pickup_id: proposed.id, p_action: 'confirm' }));
  assert.equal(confirmed.status, 'confirmed');
  assert.equal(confirmed.confirmed_by, sellerSession.user.id);
  assert.ok((await seller.rpc('propose_chat_pickup', slot)).error, 'No reemplazar sin consentimiento.');
  checked(await buyer.rpc('respond_chat_pickup', { p_pickup_id: proposed.id, p_action: 'cancel' }));
  console.log('Correcto API local: aprobacion, participantes, RLS, franja y confirmacion bilateral.');

  const competing = await Promise.all([
    seller.rpc('propose_chat_pickup', slot), buyer.rpc('propose_chat_pickup', slot),
  ]);
  assert.equal(competing.filter(result => !result.error).length, 1, 'Solo una propuesta simultanea queda activa.');
  const winningPickup = checked(competing.find(result => !result.error));
  const responder = winningPickup.proposed_by === sellerSession.user.id ? buyer : seller;
  const confirmations = await Promise.all([
    responder.rpc('respond_chat_pickup', { p_pickup_id: winningPickup.id, p_action: 'confirm' }),
    responder.rpc('respond_chat_pickup', { p_pickup_id: winningPickup.id, p_action: 'confirm' }),
  ]);
  assert.equal(confirmations.filter(result => !result.error).length, 1);
  checked(await buyer.rpc('respond_chat_pickup', { p_pickup_id: winningPickup.id, p_action: 'cancel' }));
  console.log('Correcto concurrencia real: una propuesta y una confirmacion ante solicitudes simultaneas.');

  if (process.env.LOCAL_BROWSER_CHECK === '1') {
    checked(await buyer.from('chat_messages').insert(Array.from({ length: 12 }, (_, index) => ({
      chat_id: chatId, sender_id: buyerSession.user.id,
      body: `Mensaje temporal ${index + 1}. ${'Conversacion de prueba para comprobar el desplazamiento de mensajes. '.repeat(6)}`,
    }))));
    const require = createRequire(import.meta.url);
    const { chromium } = require('playwright');
    browser = await chromium.launch({ headless: true,
      ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}),
    });
    const appUrl = process.env.LOCAL_APP_URL || 'http://127.0.0.1:5174';
    assert.ok(['localhost', '127.0.0.1'].includes(new URL(appUrl).hostname));
    const errors = [];
    const openChat = async (session, viewport, isBuyer) => {
      const context = await browser.newContext({ viewport });
      await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), {
        key: seller.auth.storageKey, session,
      });
      const page = await context.newPage();
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(appUrl);
      await page.getByRole('button', { name: 'Ver perfil', exact: true }).click();
      if (isBuyer) await page.getByRole('button', { name: /Mis Rescates/i }).click();
      const row = page.locator('div').filter({ has: page.getByText(title, { exact: true }) })
        .filter({ has: page.locator('[data-profile-actions]') }).last();
      const messageButton = row.getByRole('button', { name: 'Ver mensajes', exact: true });
      await messageButton.click();
      await page.getByRole('region', { name: 'Acuerdo de recogida' }).waitFor();
      await page.getByRole('button', { name: /^Proponer (recogida|otro horario)$/ }).waitFor({ state: 'visible' });
      return page;
    };
    const sellerPage = await openChat(sellerSession, { width: 1440, height: 1000 }, false);
    const buyerPage = await openChat(buyerSession, { width: 390, height: 844 }, true);
    const buyerRegion = buyerPage.getByRole('region', { name: 'Acuerdo de recogida' });
    await buyerRegion.getByRole('button', { name: 'Proponer recogida', exact: true }).click();
    await buyerRegion.getByLabel('Dia', { exact: true }).fill(slot.p_date);
    await buyerRegion.getByLabel('Desde', { exact: true }).fill('10:00');
    await buyerRegion.getByLabel('Hasta', { exact: true }).fill('12:00');
    const screenshots = process.env.LOCAL_SCREENSHOT_DIR || '/private/tmp/mibatute-marketplace';
    await mkdir(screenshots, { recursive: true });
    await buyerPage.screenshot({ path: `${screenshots}/recogida-formulario-390.png` });
    await buyerRegion.getByRole('button', { name: 'Enviar propuesta', exact: true }).click();
    await buyerRegion.getByText('Esperando confirmacion de la otra persona', { exact: true }).waitFor();
    const sellerRegion = sellerPage.getByRole('region', { name: 'Acuerdo de recogida' });
    await sellerRegion.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await sellerRegion.getByText('Confirmada por ambas personas', { exact: true }).waitFor();
    await buyerRegion.getByText('Confirmada por ambas personas', { exact: true }).waitFor();
    await sellerPage.screenshot({ path: `${screenshots}/recogida-confirmada-1440.png` });
    await buyerPage.screenshot({ path: `${screenshots}/recogida-confirmada-390.png` });
    const compactPage = await openChat(buyerSession, { width: 320, height: 568 }, true);
    await compactPage.getByRole('region', { name: 'Acuerdo de recogida' }).getByRole('button', { name: 'Proponer otro horario', exact: true }).click();
    for (const page of [sellerPage, buyerPage, compactPage]) {
      assert.equal(await page.evaluate(() => {
        const messages = document.querySelector('[data-chat-messages]');
        const pickup = document.querySelector('[data-chat-pickup]');
        const composer = document.querySelector('[data-chat-composer]');
        const m = messages.getBoundingClientRect();
        const p = pickup.getBoundingClientRect();
        const c = composer.getBoundingClientRect();
        return m.bottom <= p.top + 1 && p.bottom <= c.top + 1 && c.bottom <= innerHeight
          && c.right <= innerWidth && m.height > 60 && !messages.contains(pickup);
      }), true, 'La recogida queda fuera de los mensajes, inmediatamente encima del compositor visible.');
      const before = await page.locator('[data-chat-pickup]').boundingBox();
      await page.locator('[data-chat-messages]').evaluate(element => { element.scrollTop = 0; });
      assert.equal((await page.locator('[data-chat-pickup]').boundingBox()).y, before.y, 'Desplazar mensajes no mueve la recogida.');
    }
    await compactPage.screenshot({ path: `${screenshots}/recogida-formulario-320.png` });
    assert.deepEqual(errors, []);
    assert.equal(await buyerRegion.evaluate(el => el.getBoundingClientRect().right <= window.innerWidth), true);
    console.log('Correcto navegador: propuesta movil y confirmacion escritorio sincronizadas sin refrescar.');
  }
  checked(await seller.rpc('transition_sale', { p_articulo_id: articleId, p_action: 'deliver' }));
  assert.ok((await buyer.rpc('propose_chat_pickup', slot)).error, 'Chat finalizado no acepta acuerdos.');

  const donationId = checked(await seller.from('articulos').insert({ owner_id: sellerSession.user.id,
    title: 'Recogida donacion - PRUEBA TEMPORAL', mode: 'donacion', estado_producto: 8,
    status: 'disponible', estado: 'disponible', city: 'Bogotá' }).select('id').single()).id;
  articles.push(donationId);
  checked(await buyer.from('postulaciones').insert({ articulo_id: donationId, usuario_id: buyerSession.user.id,
    justificacion: 'Comprobar el acuerdo de recogida local' }));
  checked(await seller.from('articulos').update({ ganador_id: buyerSession.user.id, status: 'reservado', estado: 'reservado' }).eq('id', donationId));
  const donationChat = checked(await buyer.from('chats').select('id').eq('articulo_id', donationId).single());
  const donationPickup = checked(await seller.rpc('propose_chat_pickup', { ...slot, p_chat_id: donationChat.id }));
  assert.equal(checked(await buyer.rpc('respond_chat_pickup', { p_pickup_id: donationPickup.id, p_action: 'confirm' })).status, 'confirmed');
  console.log('Correcto API local: recogida en donaciones aceptadas y bloqueo tras finalizar venta.');
} finally {
  if (browser) await browser.close();
  for (const id of articles) checked(await admin.from('articulos').delete().eq('id', id));
  if (articles.length) checked(await admin.from('activity_notifications').delete().in('articulo_id', articles));
  for (const client of [seller, buyer, outsider]) await client.auth.signOut({ scope: 'local' });
}
