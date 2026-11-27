import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { showLocalSponsoredPreview, localSponsoredInsertionIndex } from '../src/components/localSponsoredPreview.js';

test('preview keeps advertising disclosure and offers a priced external test link', async () => {
  const source = await readFile(new URL('../src/components/LocalSponsoredCard.jsx', import.meta.url), 'utf8');
  assert.ok(source.includes('>Publicidad</span>'));
  assert.ok(source.includes('$ 80.000'));
  assert.match(source, /<a href="https:\/\/www\.google\.com\/" target="_blank" rel="sponsored noopener noreferrer"/);
  assert.match(source, />\s*Lo quiero\s*<\/a>/);
});

test('sponsored preview requires local opt-in and at least four real results', () => {
  assert.equal(showLocalSponsoredPreview({ count: 12 }), false);
  for (const count of [0, 1, 3]) assert.equal(showLocalSponsoredPreview({ enabled: true, count }), false);
  for (const count of [4, 8, 12, 20]) assert.equal(showLocalSponsoredPreview({ enabled: true, count }), true);
});

test('fictitious furniture advertiser only appears for matching local searches', () => {
  const base = { enabled: true, count: 8 };
  assert.equal(showLocalSponsoredPreview({ ...base, category: 'Hogar & Muebles', search: 'SÍLLA madera' }), true);
  assert.equal(showLocalSponsoredPreview({ ...base, search: 'bicicleta' }), false);
  assert.equal(showLocalSponsoredPreview({ ...base, category: 'Libros & Educación' }), false);
  assert.equal(showLocalSponsoredPreview({ ...base, city: 'Medellín' }), false);
});

test('desktop ad varies across positions three to ten and is stable during renders', () => {
  const positions = new Set();
  for (let page = 1; page <= 200; page++) {
    const options = { count: 11, seed: `visit:filters:${page}` };
    const index = localSponsoredInsertionIndex(options);
    assert.equal(localSponsoredInsertionIndex(options), index);
    const position = index + 2;
    assert.ok(position >= 3 && position <= 10);
    positions.add(position);
  }
  assert.equal(positions.size, 8);
});

test('mobile and app vary from third to penultimate slot without replacing articles', () => {
  for (const count of [4, 5, 8, 20]) {
    const positions = new Set();
    for (let visit = 0; visit < 200; visit++) {
      const index = localSponsoredInsertionIndex({ count, layout: 'mobile', seed: `visit-${visit}` });
      const position = index + 2;
      assert.ok(position >= 3 && position <= count);
      positions.add(position);
      const items = Array.from({ length: count }, (_, id) => id);
      const original = [...items];
      items.splice(index + 1, 0, 'ad');
      assert.deepEqual(items.filter(item => item !== 'ad'), original);
      assert.equal(items.filter(item => item === 'ad').length, 1);
    }
    assert.ok(positions.size > 1);
  }
  assert.equal(localSponsoredInsertionIndex({ count: 3 }), null);
});
