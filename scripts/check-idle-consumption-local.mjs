import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
import { localStatus } from './seed-applicants-local.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const status = localStatus();
const client = createClient(status.API_URL, status.ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data, error } = await client.auth.signInWithPassword({ email: 'vendedor@example.com', password: '123456' });
assert.ifError(error);
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
try {
  const context = await browser.newContext();
  await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)),
    { key: client.auth.storageKey, session: data.session });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5174/');
  await page.getByRole('button', { name: 'Notificaciones', exact: true }).waitFor();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000);
  await page.waitForLoadState('networkidle');
  const requests = {};
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin === new URL(status.API_URL).origin || url.pathname.startsWith('/api/')) {
      requests[url.pathname] = (requests[url.pathname] || 0) + 1;
    }
  });
  console.log('Midiendo 65 segundos en reposo con sesion iniciada...');
  await page.waitForTimeout(65000);
  console.log(JSON.stringify({ idleMs: 65000, requests }));
  if (process.env.EXPECT_ZERO_IDLE === 'true') assert.deepEqual(requests, {});
} finally {
  await browser.close();
  await client.auth.signOut({ scope: 'local' });
}
