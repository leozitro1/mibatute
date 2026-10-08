import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
import { localStatus } from './seed-applicants-local.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const status = localStatus();
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const client = createClient(status.API_URL, status.ANON_KEY, options);
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, options);
const checked = ({ data, error }) => { assert.ifError(error); return data; };
const session = checked(await client.auth.signInWithPassword({ email: 'vendedor@example.com', password: '123456' })).session;
const saldo = checked(await client.from('cupos').select('saldo').eq('usuario_id', session.user.id).single()).saldo;
assert.ok(saldo > 0);
let articleId;
let browser;
try {
  articleId = checked(await client.from('articulos').insert({ owner_id: session.user.id,
    title: 'Saldo sin consultas - PRUEBA TEMPORAL', mode: 'venta', price: 1000,
    estado_producto: 8, status: 'disponible', estado: 'disponible', city: 'Bogotá', locality: 'Suba',
  }).select('id').single()).id;
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
  const context = await browser.newContext();
  await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)),
    { key: client.auth.storageKey, session });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5174/');
  await page.getByLabel(`${saldo} créditos disponibles`, { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Ver perfil', exact: true }).click();
  const feature = page.locator(`[data-profile-article-id="${articleId}"]`).getByRole('button', { name: 'Destacar publicación', exact: true });
  await feature.waitFor();
  await page.waitForLoadState('networkidle');
  let balanceReads = 0;
  page.on('request', request => { if (new URL(request.url()).pathname.endsWith('/cupos')) balanceReads++; });
  page.once('dialog', dialog => dialog.accept());
  await feature.click();
  await page.getByLabel(`${saldo - 1} créditos disponibles`, { exact: true }).waitFor();
  await page.waitForLoadState('networkidle');
  assert.equal(balanceReads, 0, 'Destacar actualiza el saldo con la respuesta del RPC, sin releer cupos.');
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new CustomEvent('mb-credit-balance-changed', { detail: { uid: 'otra-cuenta', saldo: 999 } }));
  });
  await page.waitForTimeout(500);
  assert.equal(balanceReads, 0, 'El foco reciente no duplica consultas.');
  await page.getByLabel(`${saldo - 1} créditos disponibles`, { exact: true }).waitFor();
  console.log('Correcto: gasto real, saldo inmediato, sin lecturas adicionales y aislamiento entre cuentas.');
} finally {
  if (browser) await browser.close();
  if (articleId) {
    checked(await admin.from('articulos').delete().eq('id', articleId));
    checked(await admin.from('cupos').update({ saldo }).eq('usuario_id', session.user.id));
    checked(await admin.from('cupos_historial').delete().eq('usuario_id', session.user.id).eq('referencia_id', articleId));
  }
  await client.auth.signOut({ scope: 'local' });
}
