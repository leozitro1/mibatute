import test from 'node:test';
import assert from 'node:assert/strict';
import { createBudgetFetch } from '../server/requestBudget.js';

test('one request deadline aborts work in progress and prevents starting later outbound calls', async () => {
  const controller = new AbortController(); let calls = 0;
  const fetch = createBudgetFetch({ signal: controller.signal, fetcher: (_url, { signal }) => {
    calls++;
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  } });
  const pending = fetch('https://provider.test/details');
  controller.abort(new Error('budget expired'));
  await assert.rejects(pending, /budget expired/);
  assert.throws(() => fetch('https://provider.test/delete'), /budget expired/);
  assert.equal(calls, 1);
});

test('individual cancellation stays effective, normal calls are not duplicated and options survive', async () => {
  const deadline = new AbortController(), individual = new AbortController(); let captured, calls = 0;
  const fetch = createBudgetFetch({ signal: deadline.signal, fetcher: async (_url, options) => { calls++; captured = options; return Response.json({}); } });
  assert.equal((await fetch(new Request('https://provider.test/', { signal: individual.signal }), { method: 'POST', body: 'body', headers: { 'X-Test': 'yes' } })).status, 200);
  assert.equal(calls, 1); assert.equal(captured.body, 'body'); assert.equal(captured.headers['X-Test'], 'yes');
  individual.abort(); assert.equal(captured.signal.aborted, true); assert.equal(deadline.signal.aborted, false);
});
