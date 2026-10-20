import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Vercel serves direct client routes without intercepting API endpoints or assets',async()=>{
  const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.deepEqual(config.rewrites.map(rule=>rule.source),['/gestion/:path*','/auth/callback','/reset-password','/terminos','/privacidad','/pagos','/cookies','/datos-personales','/normas']);
  assert.ok(config.rewrites.every(rule=>rule.destination.startsWith('/seo/')&&rule.destination.endsWith('.html')));
  assert.ok(config.rewrites.every(rule=>!rule.source.startsWith('/api')&&!rule.source.startsWith('/assets')));
});
