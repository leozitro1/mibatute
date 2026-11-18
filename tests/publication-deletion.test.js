import test from 'node:test';
import assert from 'node:assert/strict';
import { publicationDeletionStatus, publicationDeletionMessage } from '../src/supabase/publicationDeletion.js';

test('deletion confirmation explains the server deadline and distinguishes inactive publications', () => {
  const held = publicationDeletionMessage({ holdsSlot: true, releaseAt: '2026-12-01T15:00:00Z' });
  assert.match(held, /10 días desde el borrado/);
  assert.match(held, /2026/);
  assert.match(publicationDeletionMessage({ holdsSlot: false, active: true }), /primeras 12 horas/);
  assert.match(publicationDeletionMessage({ holdsSlot: false, active: false }), /ya no ocupa/);
  assert.throws(() => publicationDeletionMessage({ holdsSlot: true, releaseAt: 'invalid' }), /fecha/);
});

test('deletion preflight fails closed on unreadable server status without exposing SQL details', async () => {
  await assert.rejects(publicationDeletionStatus({ rpc: async () => ({ error: { code: '42501', message: 'private SQL detail' } }) }, 'article'), /No se pudo comprobar/);
  await assert.rejects(publicationDeletionStatus({ rpc: async () => ({ data: {} }) }, 'article'), /No se pudo comprobar/);
  const data = { holdsSlot: true, releaseAt: '2026-12-01T15:00:00Z' };
  assert.deepEqual(await publicationDeletionStatus({ rpc: async (name, args) => {
    assert.equal(name, 'publication_deletion_status');
    assert.deepEqual(args, { p_article_id: 'article' });
    return { data };
  } }, 'article'), data);
});
