import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { demoTitle, localStatus, seedApplicants } from './seed-applicants-local.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const status = localStatus();
const articleId = await seedApplicants(status);
const checked = ({ data, error }) => { assert.ifError(error); return data; };
const seller = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const session = checked(await seller.auth.signInWithPassword({ email: 'cliente1@example.com', password: '123456' })).session;
const appUrl = process.env.LOCAL_APP_URL || 'http://127.0.0.1:5174';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(appUrl).hostname));
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
const directory = '/private/tmp/mibatute-marketplace';
await mkdir(directory, { recursive: true });
let temporaryId;
try {
  for (const [width, height] of [[1440, 1000], [390, 844], [320, 568]]) {
    const context = await browser.newContext({ viewport: { width, height } });
    await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: seller.auth.storageKey, session });
    const page = await context.newPage();
    const errors = [];
    let applicantReads = 0;
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.pathname.endsWith('/postulaciones') && url.searchParams.get('articulo_id') === `eq.${articleId}` && url.searchParams.get('select')?.includes('justificacion')) applicantReads++;
    });
    await page.goto(appUrl);
    await page.getByRole('button', { name: 'Ver perfil', exact: true }).click();
    const row = page.locator('div').filter({ has: page.getByText(demoTitle, { exact: true }) }).filter({ has: page.locator('[data-profile-actions]') }).last();
    await row.locator('img').first().click();
    const dialog = page.getByRole('dialog', { name: demoTitle });
    await dialog.locator('[data-applicant-row]').nth(9).waitFor();
    assert.equal(await dialog.locator('[data-applicant-row]').count(), 10);
    assert.equal(await dialog.getByRole('heading', { name: 'Camila Andrea Fernández Restrepo' }).count(), 1);
    const before = applicantReads;
    const longRow = dialog.locator('[data-applicant-row]').filter({ hasText: 'Camila Andrea' });
    await longRow.getByRole('button', { name: 'Ver más' }).click();
    assert.equal(await longRow.getByRole('button', { name: 'Ver menos' }).getAttribute('aria-expanded'), 'true');
    assert.equal(applicantReads, before, 'Desplegar mensajes no consulta la base de datos.');
    await longRow.getByRole('button', { name: 'Ver menos' }).click();
    await dialog.locator('[data-management-body]').evaluate(el => { el.scrollTop = 0; });
    assert.equal(await dialog.evaluate(el => {
      const rect = el.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth && el.scrollWidth <= el.clientWidth;
    }), true, 'El diálogo cabe en la pantalla.');
    assert.equal(await dialog.locator('[data-management-body]').evaluate(el => el.scrollHeight > el.clientHeight), true);
    await page.screenshot({ path: `${directory}/postulaciones-${width}.png` });
    await dialog.locator('[data-applicant-row]').last().getByRole('button', { name: /^Elegir a/ }).scrollIntoViewIfNeeded();
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert.deepEqual(errors, []);
    console.log(`Correcto ${width}x${height}: diez personas, scroll interno, texto completo y sin consultas adicionales.`);

    if (width === 1440) {
      const source = checked(await admin.from('articulos').select('image_url').eq('id', articleId).single());
      temporaryId = checked(await seller.from('articulos').insert({ owner_id: session.user.id, title: 'Decisiones de postulaciones - PRUEBA TEMPORAL',
        mode: 'donacion', price: 0, status: 'disponible', estado: 'disponible', estado_producto: 8, image_url: source.image_url,
        city: 'Bogotá', locality: 'Chapinero',
      }).select('id').single()).id;
      const applicants = checked(await admin.from('postulaciones').select('usuario_id,justificacion').eq('articulo_id', articleId).limit(2));
      checked(await admin.from('postulaciones').insert(applicants.map(p => ({ ...p, articulo_id: temporaryId }))));
      await page.reload();
      await page.getByRole('button', { name: 'Ver perfil', exact: true }).click();
      const temporaryRow = page.locator('div').filter({ has: page.getByText('Decisiones de postulaciones - PRUEBA TEMPORAL', { exact: true }) }).filter({ has: page.locator('[data-profile-actions]') }).last();
      await temporaryRow.locator('img').first().click();
      const temporaryDialog = page.getByRole('dialog', { name: 'Decisiones de postulaciones - PRUEBA TEMPORAL' });
      await temporaryDialog.locator('[data-applicant-row]').nth(1).waitFor();
      page.on('dialog', prompt => prompt.accept());
      await temporaryDialog.getByRole('button', { name: /^Rechazar a/ }).first().click();
      await page.waitForFunction(() => document.querySelectorAll('[data-applicant-row]').length === 1);
      await temporaryDialog.getByRole('button', { name: /^Elegir a/ }).click();
      await page.getByRole('button', { name: 'Volver', exact: true }).waitFor();
      const reserved = checked(await seller.from('articulos').select('status,ganador_id').eq('id', temporaryId).single());
      assert.equal(reserved.status, 'reservado');
      assert.ok(reserved.ganador_id);
      console.log('Correcto: rechazo elimina una solicitud y elección reserva la donación y abre el chat.');
      checked(await admin.from('articulos').delete().eq('id', temporaryId));
      checked(await admin.from('activity_notifications').delete().eq('articulo_id', temporaryId));
      temporaryId = null;
    }
    await context.close();
  }
} finally {
  await browser.close();
  if (temporaryId) {
    checked(await admin.from('articulos').delete().eq('id', temporaryId));
    checked(await admin.from('activity_notifications').delete().eq('articulo_id', temporaryId));
  }
}
