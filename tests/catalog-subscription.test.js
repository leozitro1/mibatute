import test from 'node:test';
import assert from 'node:assert/strict';
import { subscribeVisibleCatalog } from '../src/components/catalogSubscription.js';

function fixture(hidden = false) {
  const events = new Map(), channels = [], removed = [], changes = [];
  let reconnects = 0;
  const page = {
    visibilityState: hidden ? 'hidden' : 'visible',
    addEventListener: (name, callback) => events.set(name, callback),
    removeEventListener: name => events.delete(name),
  };
  const client = { channel(topic) {
    const current = { topic, on(_type, _filter, callback) { this.receive = callback; return this; }, subscribe(callback) { this.status = callback; return this; } };
    channels.push(current); return current;
  }, removeChannel: channel => removed.push(channel) };
  const stop = subscribeVisibleCatalog(client, { topic: 'city:category', document: page, onChange: payload => changes.push(payload), onReconnect: () => reconnects++ });
  const visibility = value => { page.visibilityState = value; events.get('visibilitychange')?.(); };
  return { channels, removed, changes, visibility, stop, events, reconnects: () => reconnects };
}

test('public catalog uses no channel while hidden and rejoins exactly once on return', async () => {
  const f = fixture(true);
  assert.equal(f.channels.length, 0);
  f.visibility('visible'); f.visibility('visible');
  assert.equal(f.channels.length, 1);
  f.channels[0].status('SUBSCRIBED');
  assert.equal(f.reconnects(), 0);
  f.channels[0].receive({ payload: { id: 'a' } });
  f.visibility('hidden');
  assert.equal(f.removed.length, 1);
  f.channels[0].receive({ payload: { id: 'late' } });
  f.channels[0].status('SUBSCRIBED');
  assert.equal(f.changes.length, 1);
  f.visibility('visible');
  await new Promise(resolve => queueMicrotask(() => queueMicrotask(resolve)));
  assert.equal(f.channels.length, 2);
  f.channels[1].status('SUBSCRIBED');
  assert.equal(f.reconnects(), 1);
  f.stop();
  f.channels[1].receive({ payload: { id: 'after-stop' } });
  f.visibility('visible');
  await new Promise(resolve => queueMicrotask(() => queueMicrotask(resolve)));
  assert.equal(f.channels.length, 2);
  assert.equal(f.changes.length, 1);
  assert.equal(f.events.size, 0);
});

test('recovery on an existing catalog channel marks the snapshot stale without querying or opening a new channel', () => {
  const f = fixture();
  f.channels[0].status('SUBSCRIBED');
  f.channels[0].status('CHANNEL_ERROR');
  f.channels[0].status('SUBSCRIBED');
  assert.equal(f.reconnects(), 1);
  assert.equal(f.channels.length, 1);
  f.stop();
});

test('1000 background catalog consumers create no channels; private services are not touched', () => {
  const fixtures = Array.from({ length: 1000 }, () => fixture(true));
  assert.equal(fixtures.reduce((sum, f) => sum + f.channels.length, 0), 0);
  for (const f of fixtures) f.stop();
});
