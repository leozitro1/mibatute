import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { localStatus } from './seed-applicants-local.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const appUrl = process.env.LOCAL_APP_URL || 'http://127.0.0.1:5174';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(appUrl).hostname));
const status = localStatus();
const client = createClient(status.API_URL, status.ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data, error } = await client.auth.signInWithPassword({ email: 'vendedor@example.com', password: '123456' });
assert.ifError(error);
const browser = await chromium.launch({ headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}),
});
await mkdir('/private/tmp/mibatute-marketplace', { recursive: true });
try {
  for (const width of [320, 390, 768, 1024, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)),
      { key: client.auth.storageKey, session: data.session });
    const page = await context.newPage();
    const errors = [];
    let reads = 0;
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.url().includes('/rest/v1/')) reads++; });
    await page.goto(appUrl);
    await page.getByRole('button', { name: 'Ver perfil', exact: true }).click();
    await page.locator('.user-profile').waitFor();
    await page.waitForLoadState('networkidle');
    if (width < 1024) {
      const before = reads;
      await page.getByRole('button', { name: 'Filtros', exact: true }).click();
      assert.equal(await page.getByRole('combobox').filter({ visible: true }).count() >= 3, true);
      await page.getByRole('button', { name: 'Filtros', exact: true }).click();
      assert.equal(reads, before, 'Opening filter controls does not query Supabase');
    }
    const details = page.locator('#profile-personal-details');
    const toggle = page.getByRole('button', { name: 'Datos personales', exact: true });
    assert.equal(await details.isVisible(), width >= 1024);
    await page.screenshot({ path: `/private/tmp/mibatute-marketplace/perfil-${width}.png`, fullPage: true });
    if (width < 1024) {
      const before = reads;
      await toggle.click();
      assert.equal(await details.isVisible(), true);
      await toggle.click();
      assert.equal(await details.isVisible(), false);
      assert.equal(reads, before, 'Opening personal details does not query Supabase');
      await toggle.click();
    }
    await page.getByRole('button', { name: 'Editar perfil', exact: true }).click();
    assert.equal(await details.locator('select').first().isEnabled(), true);
    assert.equal(await page.getByRole('textbox', { name: 'Dirección', exact: true }).isVisible(), true);
    assert.equal(await page.locator('#profile-privacy-note').isVisible(), true);
    assert.match(await page.locator('#profile-privacy-note').innerText(), /no se muestran a otros usuarios/);
    const phone = page.getByRole('textbox', { name: 'Teléfono', exact: true });
    await phone.fill('ab300-123');
    assert.equal(await phone.inputValue(), '300123');
    const beforeInvalidSave = reads;
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    assert.equal(await phone.evaluate(input => input.validity.valid), false);
    assert.equal(reads, beforeInvalidSave, 'Invalid phone does not save or query');
    await phone.fill('300123456789');
    assert.equal(await phone.inputValue(), '3001234567');
    assert.equal(await phone.evaluate(input => input.validity.valid), true);
    await phone.evaluate(input => input.select());
    await phone.evaluate(input => {
      const clipboardData = new DataTransfer();
      clipboardData.setData('text', '300 123 4567');
      input.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
    });
    assert.equal(await phone.inputValue(), '3001234567');
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    assert.equal(await details.locator('select').first().isEnabled(), false);
    if (width < 1024) await toggle.click();
    await page.getByRole('button', { name: '+ Recargar Nequi', exact: true }).click();
    await page.getByRole('heading', { name: /Recargar/ }).waitFor();
    // Close the untouched top-up chooser without starting a transaction.
    await page.keyboard.press('Escape');
    const headingVisible = await page.getByRole('heading', { name: /Recargar/ }).isVisible();
    if (headingVisible) {
      await page.getByRole('button', { name: /Cancelar|Cerrar/ }).filter({ visible: true }).last().click();
    }
    for (const tab of ['Mis Rescates', 'Buzón', 'Mis Publicaciones']) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      await page.waitForLoadState('networkidle');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${tab}: no page overflow at ${width}`);
      const overlap = await page.locator('[data-profile-article-id]').evaluateAll(elements => elements.some(el => {
        const content = el.querySelector('[data-profile-content]')?.getBoundingClientRect();
        const actions = el.querySelector('[data-profile-actions]')?.getBoundingClientRect();
        return content && actions && Math.min(content.right, actions.right) - Math.max(content.left, actions.left) > 1
          && Math.min(content.bottom, actions.bottom) - Math.max(content.top, actions.top) > 1;
      }));
      assert.equal(overlap, false, 'Article text and actions do not overlap');
    }
    assert.deepEqual(errors, []);
    console.log(`OK ${width}px: personal details, editing, credits, activity and no overflow`);
    await context.close();
  }
} finally {
  await browser.close();
  await client.auth.signOut({ scope: 'local' });
}
