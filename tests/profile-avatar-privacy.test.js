import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('profile photo markup never embeds the stored address, even while waiting for an authenticated request', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { default: ProfileAvatar } = await server.ssrLoadModule('/src/components/ProfileAvatar.jsx');
    const photo = 'https://example.com/private-avatar.jpg';
    const render = user => renderToStaticMarkup(createElement(ProfileAvatar, { user, photo, name: 'Ana' }));
    for (const user of [undefined, null, {}, { email: 'ana@example.com' }]) {
      const markup = render(user);
      assert.ok(!markup.includes('<img'));
      assert.ok(!markup.includes(photo));
      assert.ok(markup.includes('Inicia sesión'));
    }
    assert.ok(!render({ id: 'viewer' }).includes(photo));
    assert.ok(!render({ id: 'anonymous', is_anonymous: true }).includes(photo));
    const empty = renderToStaticMarkup(createElement(ProfileAvatar, { user: { id: 'viewer' }, name: 'Ana' }));
    assert.ok(!empty.includes('<img'));
    assert.ok(empty.includes('>A</span>'));
  } finally { await server.close(); }
});
