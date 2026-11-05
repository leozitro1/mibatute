import test from 'node:test';
import assert from 'node:assert/strict';
import { createCaptchaWidget, loadTurnstile } from '../src/security/turnstile.js';

function fixture() {
  let config, stamp = 0, removed = 0, reset = 0, renders = 0;
  const messages = [];
  const api = { render: (_container, options) => { config = options; renders++; return 'widget'; }, reset: () => { reset++; }, remove: () => { removed++; } };
  const widget = createCaptchaWidget({}, { siteKey: 'public-site-key', onMessage: message => messages.push(message), load: async () => api, now: () => stamp });
  return { widget, api, messages, config: () => config, advance: ms => { stamp += ms; }, counts: () => ({ removed, reset, renders }) };
}

test('CAPTCHA tokens are single-use locally and expire even without an expiry callback', async () => {
  const env = fixture(); await env.widget.ready;
  assert.equal(env.widget.takeToken(), undefined);
  env.config().callback('one-use-token');
  assert.equal(env.widget.takeToken(), 'one-use-token');
  assert.equal(env.widget.takeToken(), undefined);
  env.config().callback('expired-token'); env.advance(290000);
  assert.equal(env.widget.takeToken(), undefined);
  env.widget.destroy();
});

test('expiry, failure and timeout invalidate tokens without background retry; manual reset requests a fresh challenge', async () => {
  const env = fixture(); await env.widget.ready;
  for (const event of ['expired-callback', 'error-callback', 'timeout-callback']) {
    env.config().callback('token'); env.config()[event]();
    assert.equal(env.widget.takeToken(), undefined);
    assert.ok(env.messages.at(-1));
  }
  assert.equal(env.config().retry, 'never');
  assert.equal(env.config()['refresh-expired'], 'manual');
  assert.equal(env.config()['refresh-timeout'], 'manual');
  assert.deepEqual(env.counts(), { removed: 0, reset: 0, renders: 1 });
  env.widget.reset();
  assert.deepEqual(env.counts(), { removed: 0, reset: 1, renders: 1 });
  env.widget.destroy();
});

test('closing the form removes the widget; late callbacks cannot restore a token or update the old view', async () => {
  const env = fixture(); await env.widget.ready;
  const callback = env.config().callback, error = env.config()['error-callback'];
  env.widget.destroy(); env.widget.destroy(); callback('late-token'); error();
  assert.equal(env.widget.takeToken(), undefined);
  assert.deepEqual(env.messages, []);
  assert.equal(env.counts().removed, 1);
  let release, renders = 0;
  const waiting = createCaptchaWidget({}, { siteKey: 'site', onMessage() {}, load: () => new Promise(resolve => { release = resolve; }) });
  waiting.destroy(); release({ render() { renders++; } }); await waiting.ready;
  assert.equal(renders, 0);
});

test('script load failures leave no token and require manual recovery', async () => {
  let loads = 0; const messages = [];
  const widget = createCaptchaWidget({}, { siteKey: 'site', onMessage: value => messages.push(value), load: async () => { loads++; throw new Error('blocked'); } });
  await widget.ready;
  assert.equal(widget.takeToken(), undefined); assert.equal(loads, 1); assert.match(messages[0], /No se pudo cargar/);
  widget.destroy();
});

test('loader shares one official script, removes a failed load, and allows a manual retry', async t => {
  const scripts = []; let removed = 0;
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const previousTurnstile = Object.getOwnPropertyDescriptor(globalThis, 'turnstile');
  t.after(() => {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument); else delete globalThis.document;
    if (previousTurnstile) Object.defineProperty(globalThis, 'turnstile', previousTurnstile); else delete globalThis.turnstile;
  });
  globalThis.document = { head: { append: script => scripts.push(script) }, createElement: () => ({ remove: () => { removed++; } }) };
  const first = loadTurnstile(), shared = loadTurnstile();
  assert.equal(first, shared); assert.equal(scripts.length, 1);
  assert.equal(scripts[0].src, 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit');
  scripts[0].onerror(); await assert.rejects(first, /No se pudo cargar/);
  assert.equal(removed, 1);
  const next = loadTurnstile(); assert.equal(scripts.length, 2);
  const api = { render() {} }; globalThis.turnstile = api;
  scripts[1].onload(); assert.equal(await next, api);
});
