import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { buildSeo, renderHead } from '../scripts/build-seo.mjs';
import { metadataFor, SITE_URL, PRIVATE_PATHS, LEGAL_PATHS } from '../src/seo/metadata.js';

test('public metadata uses the canonical domain; private and draft pages do not enter the index', () => {
  assert.equal(metadataFor('/').index, true);
  assert.ok([...PRIVATE_PATHS, ...LEGAL_PATHS, '/desconocida'].every(path => !metadataFor(path).index));
  const head = renderHead(metadataFor('/'));
  assert.match(head, /rel="canonical" href="https:\/\/www.mibatute.com\/"/);
  assert.match(head, /"inLanguage":"es-CO"/);
  assert.match(renderHead({ title: '<title>"', description: '<script>', path: '/', index: false }), /&lt;script&gt;/);
  assert.ok(!head.includes('aggregateRating'));
});

test('the build emits initial route metadata and a sitemap excluding private pages and legal drafts', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'mibatute-seo-'));
  try {
    const root = pathToFileURL(`${temp}/`);
    await writeFile(new URL('index.html', root), '<html lang="es-CO"><head><!-- seo:start --><title>old</title><!-- seo:end --></head><body><div id="root"></div></body></html>');
    await buildSeo(root);
    const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
    for (const rule of config.rewrites) {
      const html = await readFile(new URL(rule.destination.slice(1), root), 'utf8');
      assert.match(html, /content="noindex, follow"/);
      assert.equal((html.match(/<title>/g) || []).length, 1);
      if (LEGAL_PATHS.includes(rule.source)) assert.ok(html.includes(`${SITE_URL}${rule.source}`));
    }
    const home = await readFile(new URL('index.html', root), 'utf8');
    assert.match(home, /content="index, follow, max-image-preview:large"/);
    assert.ok(home.includes('site-structured-data'));
    const sitemap = await readFile(new URL('sitemap.xml', root), 'utf8');
    assert.equal((sitemap.match(/<loc>/g) || []).length, 1);
    assert.ok(sitemap.includes(`<loc>${SITE_URL}/</loc>`));
    assert.match(await readFile(new URL('robots.txt', root), 'utf8'), /Sitemap: https:\/\/www.mibatute.com\/sitemap.xml/);
    assert.ok(config.headers.every(rule => rule.headers.some(header => header.key === 'X-Robots-Tag' && header.value.includes('noindex'))));
  } finally { await rm(temp, { recursive: true, force: true }); }
});
