import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { Buffer } from 'node:buffer';
import { localCspReview } from '../scripts/local-csp-review.mjs';

test('local CSP reports without blocking and never logs report URLs or samples', async () => {
  let middleware;
  const logged = [];
  localCspReview().configureServer({ middlewares: { use(fn) { middleware = fn; } }, config: { logger: { info(line) { logged.push(line); } } } });
  const headers = {};
  middleware({ url: '/', method: 'GET', headers: { accept: 'text/html' } }, { setHeader(k, v) { headers[k] = v; } }, () => {});
  assert.equal(headers['Content-Security-Policy'], undefined);
  assert.match(headers['Content-Security-Policy-Report-Only'], /script-src 'self' https:\/\/challenges\.cloudflare\.com/);
  assert.match(headers['Content-Security-Policy-Report-Only'], /frame-src 'self' https:\/\/challenges\.cloudflare\.com/);
  const send = body => new Promise(resolve => {
    const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), { url: '/__csp-review', method: 'POST', headers: { 'content-type': 'application/csp-report' } });
    middleware(req, { end() { resolve(this.statusCode); } });
  });
  const sample = { 'csp-report': { 'effective-directive': 'script-src-elem', 'document-uri': 'https://example.invalid/?token=fake', 'script-sample': 'private sample' } };
  assert.equal(await send(sample), 204);
  assert.equal(await send(sample), 204);
  assert.equal(logged.length, 1);
  assert.match(logged[0], /script-src-elem/);
  assert.doesNotMatch(logged[0], /example\.invalid|fake|sample/);
});
