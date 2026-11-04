import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Vercel serves direct client routes without intercepting API endpoints or assets',async()=>{
  const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.deepEqual(config.rewrites.map(rule=>rule.source),['/gestion/:path*','/auth/callback','/reset-password','/terminos','/privacidad','/pagos','/cookies','/datos-personales','/normas']);
  assert.ok(config.rewrites.every(rule=>rule.destination.startsWith('/seo/')&&rule.destination.endsWith('.html')));
  assert.ok(config.rewrites.every(rule=>!rule.source.startsWith('/api')&&!rule.source.startsWith('/assets')));
});

test('all routes receive basic security headers without blocking integration scripts or connections', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const globalRule = config.headers.find(rule => rule.source === '/(.*)');
  const headers = Object.fromEntries(globalRule.headers.map(header => [header.key, header.value]));
  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
  const directives = Object.fromEntries(headers['Content-Security-Policy'].split(';').map(value => {
    const [key, ...tokens] = value.trim().split(/\s+/);
    return [key, tokens.join(' ')];
  }));
  assert.equal(directives['frame-ancestors'], "'none'");
  assert.equal(directives['base-uri'], "'self'");
  assert.equal(directives['object-src'], "'none'");
  assert.equal(directives['script-src'], undefined);
  assert.equal(directives['connect-src'], undefined);
});
