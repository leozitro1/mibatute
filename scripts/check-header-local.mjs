import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { localStatus } from './seed-applicants-local.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const status = localStatus();
const appUrl = process.env.LOCAL_APP_URL || 'http://127.0.0.1:5174';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(appUrl).hostname));
const client = createClient(status.API_URL, status.ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const checked = ({ data, error }) => { assert.ifError(error); return data; };
const session = checked(await client.auth.signInWithPassword({
  email: 'vendedor@example.com', password: '123456',
})).session;
const saldo = checked(await client.from('cupos').select('saldo')
  .eq('usuario_id', session.user.id).single()).saldo;
const title = 'Casco urbano - PRUEBA TEMPORAL BUSQUEDA';
let articleId;
let browser;
try {
  articleId = checked(await client.from('articulos').insert({
    owner_id: session.user.id, title, description: 'Proteccion para ciclistas',
    category: 'Deportes & Movilidad', subcategory: 'Accesorios',
    city: 'Bogotá', locality: 'Suba', mode: 'venta', price: 20000,
    estado_producto: 8, status: 'disponible', estado: 'disponible',
  }).select('id').single()).id;
  browser = await chromium.launch({ headless: true,
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}),
  });
  await mkdir('/private/tmp/mibatute-marketplace', { recursive: true });
  for (const width of [1440, 768, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)),
      { key: client.auth.storageKey, session });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(appUrl);
    await page.getByLabel(`${saldo} créditos disponibles`, { exact: true }).waitFor();
    const search = page.getByRole('textbox', { name: 'Buscar', exact: true });
    await search.fill('bici');
    await page.getByRole('heading', { name: title, exact: true }).waitFor();
    await page.getByRole('button', { name: 'Específica', exact: true }).click();
    await page.getByRole('heading', { name: title, exact: true }).waitFor({ state: 'hidden' });
    assert.equal(await page.getByRole('button', { name: 'Específica', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: 'Relacionados', exact: true }).click();
    await page.getByRole('heading', { name: title, exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const inputBox = await search.boundingBox();
    const modeBox = await page.getByRole('group', { name: 'Modo de búsqueda' }).boundingBox();
    assert.ok(modeBox.y >= inputBox.y + inputBox.height, 'El selector no tapa el texto de búsqueda.');
    await page.screenshot({ path: `/private/tmp/mibatute-marketplace/cabecera-${width}.png` });
    assert.deepEqual(errors, []);
    console.log(`Correcto ${width}px: saldo real, búsqueda relacionada/específica, controles y sin desbordamiento.`);
    await context.close();
  }
} finally {
  if (browser) await browser.close();
  if (articleId) checked(await client.from('articulos').delete().eq('id', articleId));
  await client.auth.signOut({ scope: 'local' });
}
