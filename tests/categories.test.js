import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CATEGORY_TREE } from '../src/data/categories.js';
import { ARTICLE_CATEGORIES } from '../src/staff/moderation.js';
import { publicationStepError } from '../src/components/publicationSteps.js';

test('existing articles keep their category and subcategory filter values', () => {
  const legacy = JSON.parse(readFileSync(new URL('./fixtures/categories-legacy.json', import.meta.url), 'utf8'));
  for (const previous of legacy) {
    const current = CATEGORY_TREE.find(category => category.key === previous.key);
    assert.ok(current, previous.key);
    for (const subcategory of previous.subs) assert.ok(current.subs.includes(subcategory), subcategory);
  }
  assert.deepEqual(ARTICLE_CATEGORIES, CATEGORY_TREE.map(category => category.key));
});

test('each category offers one final Otros option without duplicate choices', () => {
  assert.equal(new Set(ARTICLE_CATEGORIES).size, CATEGORY_TREE.length);
  for (const category of CATEGORY_TREE) {
    assert.equal(category.subs.at(-1), 'Otros');
    assert.equal(new Set(category.subs).size, category.subs.length);
  }
});

test('publishing accepts bathroom fixtures and the fallback within every category', () => {
  const choices = CATEGORY_TREE.map(category => [category.key, 'Otros']);
  choices.push(['Construcción & Herramientas', 'Baños & Sanitarios']);
  for (const [category, subcategory] of choices) {
    assert.equal(publicationStepError(2, {
      selectedMode: 'donacion', files: [{}], categories: CATEGORY_TREE,
      formData: { title: 'Inodoro para reutilizar', category, subcategory, conditionScore: 7,
        description: 'Sanitario usado en buen estado. Se entrega limpio y sin fisuras.' },
    }), '');
  }
});
