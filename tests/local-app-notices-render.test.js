import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import useLocalAppNotices from '../src/components/useLocalAppNotices.js';

test('notification hook renders safely before login in both browser and app layouts', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { navigator: {}, isSecureContext: true } });
  try {
    for (const uid of [undefined, null, 'test-user']) {
      for (const active of [false, true]) {
        function Probe() {
          const state = useLocalAppNotices({ uid, active, items: [], activeChatId: null });
          assert.equal(state.request, null);
          assert.equal(state.banner, null);
          assert.equal(state.count, 0);
          return createElement('p', null, 'Listo');
        }
        assert.equal(renderToStaticMarkup(createElement(Probe)), '<p>Listo</p>');
      }
    }
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else delete globalThis.window;
  }
});
