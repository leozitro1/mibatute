import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { localStatus, seedApplicants } from './seed-applicants-local.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const appUrl = process.env.LOCAL_APP_URL || 'http://127.0.0.1:5174';
const expectedReads = Number(process.env.LOCAL_EXPECT_APPLICANT_READS || (new URL(appUrl).port === '5174' ? 2 : 1));
assert.ok(['localhost', '127.0.0.1'].includes(new URL(appUrl).hostname));
const status = localStatus();
const fixtureId = await seedApplicants(status);
const demoTitle = 'Notificación de postulaciones - PRUEBA TEMPORAL';
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const checked = ({ data, error }) => { assert.ifError(error); return data; };
const client = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await client.auth.signInWithPassword({ email: 'cliente1@example.com', password: '123456' });
assert.ifError(error);
const articleId = checked(await client.from('articulos').insert({ owner_id: data.session.user.id,
  title: demoTitle, mode: 'donacion', price: 0, status: 'disponible', estado: 'disponible',
  city: 'Bogotá', locality: 'Chapinero', estado_producto: 8,
}).select('id').single()).id;
const applicants = checked(await admin.from('postulaciones').select('usuario_id,justificacion').eq('articulo_id', fixtureId));
checked(await admin.from('postulaciones').insert(applicants.map(row => ({ ...row, articulo_id: articleId }))));
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
await mkdir('/private/tmp/mibatute-marketplace', { recursive: true });
try {
  for (const width of [320, 390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)),
      { key: client.auth.storageKey, session: data.session });
    const page = await context.newPage();
    let applicantReads = 0;
    let failRead = false;
    const publicReads = [];
    const embeds = [];
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/rest/v1/postulaciones?**', async route => {
      const url = new URL(route.request().url());
      const select = url.searchParams.get('select') || '';
      if (select.includes('usuarios(')) {
        embeds.push(select);
        return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({
          code: 'PGRST200', message: "Could not find a relationship between 'postulaciones' and 'usuarios' in the schema cache",
        }) });
      }
      if (url.searchParams.get('articulo_id') === `eq.${articleId}` && select.includes('justificacion')) {
        applicantReads++;
        if (failRead) return route.fulfill({ status: 503, contentType: 'application/json',
          body: JSON.stringify({ message: 'Error temporal de lectura' }) });
      }
      await route.continue();
    });
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.pathname.endsWith('/usuarios_publicos')) publicReads.push(url.searchParams.get('select'));
    });
    await page.goto(appUrl);
    await page.waitForFunction(({ uid, articleId }) => JSON.parse(localStorage.getItem(`mb_notification_history_${uid}`) || '[]')
      .some(item => item.id === `post-${articleId}`), { uid: data.session.user.id, articleId });
    const open = async () => {
      await page.getByRole('button', { name: 'Notificaciones', exact: true }).click();
      await page.locator(`[data-notification-id="post-${articleId}"]`).click();
      return page.getByRole('dialog', { name: demoTitle, exact: true });
    };
    const dialog = await open();
    await dialog.locator('[data-applicant-row]').nth(9).waitFor();
    await page.waitForLoadState('networkidle');
    assert.equal(applicantReads, expectedReads, 'One application query per mount; dev StrictMode mounts twice');
    assert.deepEqual(embeds, []);
    assert.equal(await dialog.getByRole('heading', { name: 'Camila Andrea Fernández Restrepo' }).count(), 1);
    assert.ok(publicReads.some(select => select.replaceAll(' ', '') === 'id,nombre,foto_url'));
    assert.equal(await dialog.getByText(/schema cache/).count(), 0);
    const reject = dialog.getByRole('button', { name: /^Rechazar a/ }).first();
    assert.equal(await reject.innerText(), 'Rechazar');
    assert.equal(await reject.locator('svg.lucide-ban').count(), 1);
    assert.ok((await reject.boundingBox()).height >= 44);
    assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), true);
    let confirmation;
    page.once('dialog', async prompt => {
      confirmation = { type: prompt.type(), message: prompt.message() };
      await prompt.dismiss();
    });
    await reject.click();
    assert.equal(confirmation?.type, 'confirm');
    assert.match(confirmation.message, /Rechazar/);
    assert.equal(await dialog.locator('[data-applicant-row]').count(), 10, 'Canceling keeps all applications');
    await page.screenshot({ path: `/private/tmp/mibatute-marketplace/notificacion-postulaciones-${width}.png` });
    const beforeExpand = applicantReads;
    await dialog.getByRole('button', { name: 'Ver más' }).first().click();
    assert.equal(applicantReads, beforeExpand);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    failRead = true;
    await open();
    await dialog.getByText('Error temporal de lectura', { exact: true }).waitFor();
    assert.equal(await dialog.getByText('Nadie se ha postulado todavía...', { exact: true }).count(), 0);
    await page.keyboard.press('Escape');
    failRead = false;
    await open();
    await dialog.locator('[data-applicant-row]').nth(9).waitFor();
    assert.deepEqual(errors, []);
    console.log(`OK ${width}px: notification applicants, public names, no FK embed, failure and reopening`);
    await context.close();
  }
} finally {
  await browser.close();
  checked(await admin.from('articulos').delete().eq('id', articleId));
  checked(await admin.from('activity_notifications').delete().eq('articulo_id', articleId));
  await client.auth.signOut({ scope: 'local' });
}
