import test from 'node:test';
import assert from 'node:assert/strict';
import { createListingCache } from '../src/components/listingCache.js';

test('listing results are reused briefly and expire at the TTL boundary', () => {
  let time = 100;
  const cache = createListingCache({ now: () => time });
  const page = { ids: ['one'], page: 2, products: [{ id: 'one' }] };
  cache.set('buyer:filters:2', page);
  time += 59_999;
  assert.equal(cache.get('buyer:filters:2'), page);
  assert.equal(cache.get('seller:filters:2'), null);
  time += 1;
  assert.equal(cache.get('buyer:filters:2'), null);
});

test('listing cache is bounded, keeps recently read entries and clears after mutations', () => {
  const cache = createListingCache({ limit: 2 });
  cache.set('first', 1);
  cache.set('second', 2);
  assert.equal(cache.get('first'), 1);
  cache.set('third', 3);
  assert.equal(cache.get('second'), null);
  assert.equal(cache.get('first'), 1);
  assert.equal(cache.get('third'), 3);
  cache.clear();
  assert.equal(cache.get('first'), null);
  assert.equal(cache.get('third'), null);
});
