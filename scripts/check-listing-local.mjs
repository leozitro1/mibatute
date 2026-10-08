import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const url = process.env.LOCAL_APP_URL || 'http://127.0.0.1:5174';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(url).hostname), 'Solo comprobar local.');
const screenshotDir = process.env.LOCAL_SCREENSHOT_DIR || '/private/tmp/mibatute-marketplace';
await mkdir(screenshotDir, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}),
});
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    let listingRequests = 0;
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (request.url().includes('/rpc/home_article_page')) listingRequests++;
    });
    await page.goto(url);
    const next = page.getByRole('button', { name: 'Página siguiente', exact: true });
    await next.waitFor();
    await next.click();
    await page.getByText(/^Página 2 de \d+$/).waitFor();
    const card = page.locator('[role="button"][aria-disabled="false"]').filter({ has: page.locator('h3') }).first();
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    const title = await card.locator('h3').innerText();
    const before = await page.evaluate(() => window.scrollY);
    const requestsBefore = listingRequests;
    await card.click();
    await page.getByRole('heading', { name: title, exact: true, level: 1 }).waitFor();
    assert.equal(await page.evaluate(() => document.body.style.position), 'fixed');
    await page.getByRole('button', { name: 'Cerrar publicación', exact: true }).filter({ visible: true }).click();
    await page.waitForFunction(() => document.body.style.position !== 'fixed');
    const after = await page.evaluate(() => window.scrollY);
    assert.ok(Math.abs(after - before) <= 2, `Scroll ${before} -> ${after}`);
    assert.equal(listingRequests, requestsBefore, 'Cerrar el detalle no consulta otra vez el listado.');
    await page.getByText(/^Página 2 de \d+$/).waitFor();
    await page.getByRole('button', { name: 'Página anterior', exact: true }).click();
    await page.getByText(/^Página 1 de \d+$/).waitFor();
    assert.equal(listingRequests, requestsBefore, 'La pagina anterior se recupera de la cache.');
    const search = page.getByRole('textbox', { name: 'Buscar', exact: true });
    await search.fill('ficticio');
    await page.waitForTimeout(600);
    assert.equal(await page.locator('[role="button"][aria-disabled="false"]').filter({ has: page.locator('h3') }).count(), 9);
    await search.fill('BICI');
    await page.waitForTimeout(600);
    assert.ok(await page.locator('[role="button"][aria-disabled="false"]').filter({ has: page.locator('h3') }).count() > 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: `${screenshotDir}/listado-${viewport.width}.png`, fullPage: true });
    assert.deepEqual(errors, []);
    console.log(`Correcto ${viewport.width}px: pagina, scroll, cache, descripcion y prefijos.`);
    await page.close();
  }
} finally { await browser.close(); }
