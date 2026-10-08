import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const env = { ...process.env, PATH: `/Applications/Docker.app/Contents/Resources/bin:${process.env.PATH}` };
const status = JSON.parse(execFileSync('npx', ['--yes', 'supabase@2.119.0', 'status', '-o', 'json'], {
  env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
}));
assert.equal(new URL(status.API_URL).hostname, '127.0.0.1');
const appUrl = process.env.LOCAL_APP_URL || 'http://127.0.0.1:5174';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(appUrl).hostname));
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const seller = createClient(status.API_URL, status.ANON_KEY, options);
const buyer = createClient(status.API_URL, status.ANON_KEY, options);
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, options);
const checked = ({ data, error }) => { assert.ifError(error); return data; };
const articles = [];
let browser;
try {
  const session = checked(await seller.auth.signInWithPassword({ email: 'cliente1@example.com', password: '123456' })).session;
  const buyerSession = checked(await buyer.auth.signInWithPassword({ email: 'cliente2@example.com', password: '123456' })).session;
  const chats = [];
  for (let i = 1; i <= 12; i++) {
    const id = checked(await seller.from('articulos').insert({ owner_id: session.user.id,
      title: `Aviso ${String(i).padStart(2, '0')} - PRUEBA TEMPORAL`, mode: 'venta', price: 1000,
      estado_producto: 8, status: 'disponible', estado: 'disponible', city: 'Bogotá', locality: 'Chapinero',
    }).select('id').single()).id;
    articles.push(id);
    chats.push(checked(await buyer.rpc('transition_sale', { p_articulo_id: id, p_action: 'reserve' })).chat.id);
  }
  browser = await chromium.launch({ headless: true,
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}),
  });
  const directory = process.env.LOCAL_SCREENSHOT_DIR || '/private/tmp/mibatute-marketplace';
  await mkdir(directory, { recursive: true });
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 } });
    await context.addInitScript(({ key, session }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(session));
    }, { key: seller.auth.storageKey, session });
    const page = await context.newPage();
    const errors = [];
    let notificationReads = 0;
    let serviceReads = 0;
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.origin === new URL(status.API_URL).origin || url.pathname.startsWith('/api/')) serviceReads++;
      const select = (url.searchParams.get('select') || '').replaceAll(' ', '');
      if (url.pathname.endsWith('/chats') && select === 'id,articulo_id,buyer_id,seller_id,status,created_at,last_message_at'
        || url.pathname.endsWith('/chat_messages') && select === 'id,chat_id,sender_id,created_at'
        || url.pathname.endsWith('/postulaciones') && select === 'id,articulo_id,created_at') notificationReads++;
    });
    await page.goto(appUrl);
    const button = page.getByRole('button', { name: 'Notificaciones', exact: true });
    await button.waitFor();
    await page.waitForFunction(uid =>
      JSON.parse(localStorage.getItem(`mb_notification_history_${uid}`) || '[]').length === 10,
    session.user.id);
    await button.click();
    const menu = page.getByRole('menu', { name: 'Notificaciones', exact: true });
    assert.equal(await menu.getByRole('menuitem').count(), 10);
    const first = menu.getByRole('menuitem').first();
    const firstId = await first.getAttribute('data-notification-id');
    const listIds = await menu.getByRole('menuitem').evaluateAll(items => items.map(item => item.dataset.notificationId));
    assert.equal(listIds.includes(`venta-${articles[0]}`), false);
    const before = notificationReads;
    const unreadBefore = await menu.locator('[data-read="false"]').count();
    await page.getByRole('button', { name: 'Cerrar notificaciones', exact: true }).click();
    await button.click();
    assert.equal(await menu.locator('[data-read="false"]').count(), unreadBefore, 'Abrir el panel no marca todo leido.');
    assert.equal(notificationReads, before, 'Reabrir el panel reutiliza la cache.');
    await menu.locator(`[data-notification-id="${firstId}"]`).click();
    await page.getByRole('button', { name: 'Volver', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Volver', exact: true }).click();
    const close = page.getByRole('dialog').getByRole('button', { name: /^Cerrar / });
    if (await close.count()) await close.first().click();
    await button.click();
    assert.equal(await menu.getByRole('menuitem').count(), 10);
    assert.equal(await menu.locator(`[data-notification-id="${firstId}"]`).getAttribute('data-read'), 'true');
    assert.equal(notificationReads, before, 'Leer la notificacion no recarga su historial.');
    await page.reload();
    await button.click();
    await menu.locator(`[data-notification-id="${firstId}"][data-read="true"]`).waitFor();
    await page.waitForTimeout(500);
    assert.equal(await menu.locator(`[data-notification-id="${firstId}"]`).getAttribute('data-read'), 'true');
    assert.equal(await menu.getByRole('menuitem').count(), 10);
    assert.equal(await menu.evaluate(el => {
      const rect = el.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= window.innerWidth;
    }), true);
    await page.screenshot({ path: `${directory}/notificaciones-${width}.png` });
    assert.deepEqual(errors, []);
    console.log(`Correcto ${width}px: ultimas 10, lectura sin borrar, persistencia y reapertura sin consultas.`);

    if (width === 1440 && Number(process.env.LOCAL_IDLE_CHECK_MS) > 0) {
      await page.waitForLoadState('networkidle');
      const idleBefore = serviceReads;
      await page.waitForTimeout(Number(process.env.LOCAL_IDLE_CHECK_MS));
      assert.equal(serviceReads, idleBefore, 'El reloj y la campana no hacen consultas mientras la pagina esta inactiva.');
      console.log(`Correcto consumo: cero solicitudes a Supabase o /api/ durante ${process.env.LOCAL_IDLE_CHECK_MS} ms de inactividad.`);
    }

    if (width === 1440) {
      checked(await seller.rpc('transition_sale', { p_articulo_id: articles[11], p_action: 'approve_chat' }));
      checked(await buyer.from('chat_messages').insert({ chat_id: chats[11], sender_id: buyerSession.user.id, body: 'Mensaje nuevo para comprobar el aviso' }));
      await page.reload();
      await button.click();
      await menu.locator(`[data-notification-id="chat-${chats[11]}"][data-read="false"]`).waitFor();
      checked(await admin.from('articulos').delete().eq('id', articles[11]));
      await page.reload();
      await button.click();
      await menu.locator(`[data-notification-id="chat-${chats[11]}"]`).waitFor();
      assert.equal(await menu.getByRole('menuitem').count(), 10, 'Eliminar el origen no borra el historial local.');
      await page.evaluate(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), {
        key: seller.auth.storageKey, session: buyerSession,
      });
      await page.reload();
      await button.click();
      await page.waitForFunction(uid => JSON.parse(localStorage.getItem(`mb_notification_history_${uid}`) || '[]').length > 0, buyerSession.user.id);
      assert.equal(await menu.locator(`[data-notification-id="venta-${articles[10]}"]`).count(), 0,
        'La otra cuenta recibe sus propios avisos, nunca la venta pendiente del vendedor.');
      console.log('Correcto: eventos nuevos, historial sin origen y aislamiento al cambiar de cuenta.');
    }
    await context.close();
  }
} finally {
  if (browser) await browser.close();
  for (const id of articles) checked(await admin.from('articulos').delete().eq('id', id));
  if (articles.length) checked(await admin.from('activity_notifications').delete().in('articulo_id', articles));
  for (const client of [seller, buyer]) await client.auth.signOut({ scope: 'local' });
}
