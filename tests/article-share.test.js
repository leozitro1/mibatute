import test from 'node:test';
import assert from 'node:assert/strict';
import { articleShareUrl, sharedArticleId, shareArticle } from '../src/components/articleShare.js';

const id = 'f21a24a9-63f0-4c21-9f31-b8ca7f5f7031';
const href = 'https://www.mibatute.com/gestion/direccion?reference=private&wompi_return=1&design=propuesta#private';
const url = `https://www.mibatute.com/?articulo=${id}`;

test('sharing creates an article link without private parameters or admin paths', () => {
  assert.equal(articleShareUrl(id, href), url);
  assert.equal(sharedArticleId(url), id);
  assert.equal(sharedArticleId('https://www.mibatute.com/?articulo=invalid'), null);
  assert.equal(articleShareUrl('invalid', href), null);
  assert.equal(articleShareUrl(id, 'http://127.0.0.1:5174/'), `http://127.0.0.1:5174/?articulo=${id}`);
});

test('native sharing passes only the public title and URL; cancelling does not copy', async () => {
  let copied = 0;
  const browser = {
    share: async data => assert.deepEqual(data, { title: 'Mesa · MiBatute', url }),
    clipboard: { writeText: async () => copied++ },
  };
  assert.equal((await shareArticle({ id, title: 'Mesa', href, navigator: browser })).status, 'shared');
  browser.share = async () => { throw Object.assign(new Error('cancelled'), { name: 'AbortError' }); };
  assert.equal((await shareArticle({ id, href, navigator: browser })).status, 'cancelled');
  assert.equal(copied, 0);
});

test('unsupported/denied sharing falls back to copy or a selectable link', async () => {
  let copied;
  const browser = { clipboard: { writeText: async text => { copied = text; } } };
  assert.equal((await shareArticle({ id, href, navigator: browser })).status, 'copied');
  assert.equal(copied, url);
  browser.share = async () => { throw new Error('denied'); };
  browser.clipboard.writeText = async () => { throw new Error('denied'); };
  assert.deepEqual(await shareArticle({ id, href, navigator: browser }), { status: 'manual', url });
  assert.equal((await shareArticle({ id, href, navigator: {} })).status, 'manual');
});
