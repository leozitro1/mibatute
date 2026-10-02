import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { isSaleArticle, readArticleContext, resolveChatBuyerId, validateTransactionChat } from '../src/supabase/articleContext.js';

test('empty legacy type cannot turn a sale into a donation', () => {
  assert.equal(isSaleArticle({ mode: 'venta', tipo: '' }), true);
  assert.equal(isSaleArticle({ mode: 'venta', tipo: ' ' }), true);
  assert.equal(isSaleArticle({ tipo: 'VENTA' }), true);
  assert.equal(isSaleArticle({ mode: ' ', tipo_publicacion: 'venta' }), true);
  assert.equal(isSaleArticle({ mode: 'donacion', tipo: '' }), false);
});

test('chat buyer identity never substitutes the seller for the actual buyer', () => {
  const article = { id: 'a', owner_id: 'seller', buyer_id: 'buyer' };
  assert.equal(resolveChatBuyerId({ article, userId: 'buyer', otherUserId: 'seller' }), 'buyer');
  assert.equal(resolveChatBuyerId({ article, userId: 'seller', otherUserId: 'buyer' }), 'buyer');
  assert.equal(resolveChatBuyerId({ article: { owner_id: 'seller' }, userId: 'buyer', otherUserId: 'seller' }), 'buyer');
  assert.equal(resolveChatBuyerId({ article: { owner_id: 'seller', ganador_id: 'winner' }, userId: 'winner', otherUserId: 'seller' }), 'winner');
  article.transaction_chat = { id: 'chat', articulo_id: 'a', buyer_id: 'buyer', seller_id: 'seller', status: 'open' };
  assert.equal(validateTransactionChat(article, 'buyer').id, 'chat');
  assert.equal(validateTransactionChat(article, 'seller').id, 'chat');
  assert.equal(validateTransactionChat(article, 'stranger'), null);
  assert.equal(validateTransactionChat({ ...article, buyer_id: null }, 'buyer'), null);
  assert.equal(validateTransactionChat({ ...article, transaction_chat: { ...article.transaction_chat, articulo_id: 'wrong' } }, 'buyer'), null);
});

test('transaction context uses one RPC and reports missing or unreadable records', async () => {
  let calls = 0;
  const client = { rpc: async (name, args) => {
    calls++;
    assert.equal(name, 'article_context');
    assert.deepEqual(args, { p_article_id: 'a' });
    return { data: [{ id: 'a', buyer_public: { nombre: 'Buyer' } }] };
  } };
  assert.equal((await readArticleContext(client, 'a')).buyer_public.nombre, 'Buyer');
  assert.equal(calls, 1);
  await assert.rejects(readArticleContext({ rpc: async () => ({ data: [] }) }, 'a'), /permiso/);
  await assert.rejects(readArticleContext({ rpc: async () => ({ error: { code: 'PGRST202' } }) }, 'a'), /habilitar/);
});

test('grouped article context preserves participant privacy, ownership and image ordering', async () => {
  const db = new PGlite();
  const seller = '11111111-1111-1111-1111-111111111111';
  const buyer = '22222222-2222-2222-2222-222222222222';
  const stranger = '33333333-3333-3333-3333-333333333333';
  const articleId = '44444444-4444-4444-4444-444444444444';
  try {
    await db.exec(`
      create role authenticated; create role anon; create schema auth;
      create function auth.uid() returns uuid language sql stable as
        'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
      create table public.articulos (id uuid primary key, owner_id uuid, buyer_id uuid,
        ganador_id uuid, winner_id uuid, recipient_id uuid, estado text, created_at timestamptz default now());
      create table public.articulo_imagenes (id integer, articulo_id uuid, position integer, url text);
      create table public.usuarios_publicos (id uuid primary key, nombre text, foto_url text);
      create table public.chats (id uuid, articulo_id uuid, buyer_id uuid, seller_id uuid,
        owner_id uuid, usuario_id uuid, status text);
      alter table public.articulos enable row level security;
      create policy visible_articles on public.articulos for select using (true);
      alter table public.chats enable row level security;
      create policy members on public.chats for select using (auth.uid() in (buyer_id, seller_id));
      grant usage on schema public, auth to authenticated, anon;
      grant select on public.articulos, public.articulo_imagenes, public.usuarios_publicos, public.chats to authenticated;
      insert into public.articulos (id, owner_id, buyer_id, estado) values ('${articleId}', '${seller}', '${buyer}', 'reservado');
      insert into public.usuarios_publicos values ('${seller}', 'Seller', null), ('${buyer}', 'Buyer', null);
      insert into public.chats values ('55555555-5555-5555-5555-555555555555', '${articleId}', '${buyer}', '${seller}', '${seller}', null, 'open');
      insert into public.articulo_imagenes values (2, '${articleId}', 1, 'second.jpg'), (1, '${articleId}', 0, 'first.jpg');
    `);
    await db.exec(await readFile(new URL('../supabase/migrations/2026-10-01-article-context.sql', import.meta.url), 'utf8'));
    const asUser = async id => {
      await db.exec('reset role; set role authenticated');
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    };
    const context = async (id = articleId) => (await db.query('select public.article_context($1) as article', [id])).rows.map(row => row.article);
    for (const uid of [seller, buyer]) {
      await asUser(uid);
      const article = (await context())[0];
      assert.equal(article.owner_public.nombre, 'Seller');
      assert.equal(article.buyer_public.nombre, 'Buyer');
      assert.equal(article.transaction_chat.status, 'open');
      assert.equal(validateTransactionChat(article, uid).buyer_id, buyer);
      assert.deepEqual(article.articulo_imagenes.map(image => image.url), ['first.jpg', 'second.jpg']);
      assert.equal((await context(null)).length, uid === seller ? 1 : 0);
    }
    await asUser(stranger);
    const publicArticle = (await context())[0];
    assert.equal(publicArticle.buyer_public, null);
    assert.equal(publicArticle.transaction_chat, null);
    await db.exec('reset role; update public.articulos set estado = \'entregado\'; update public.chats set status = \'closed\';');
    await asUser(buyer);
    assert.equal(validateTransactionChat((await context())[0], buyer).status, 'closed');
    await db.exec('reset role; update public.articulos set buyer_id = null, estado = \'disponible\';');
    await asUser(buyer);
    assert.equal((await context())[0].transaction_chat, null);
    await db.exec('reset role; set role anon');
    await assert.rejects(context(), /permission denied/);
  } finally { await db.close(); }
});
