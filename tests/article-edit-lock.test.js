import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { articleEditingLocked, assertArticleEditable, togglePublicationPause } from '../src/supabase/articleEditing.js';

test('canceling the pause confirmation makes no request; confirming preserves ownership and checks current state', async () => {
  const article = { id: 'article', status: 'disponible', estado: 'disponible' };
  const never = { from() { throw new Error('Unexpected request'); } };
  assert.equal(await togglePublicationPause(never, article, 'owner', message => {
    assert.match(message, /cupo seguirá ocupado/); return false;
  }), null);
  const calls = [];
  const query = { update(value) { calls.push(value); return this; }, eq(...args) { calls.push(args); return this; },
    select() { return this; }, async single() { return { data: { id: 'article' }, error: null }; } };
  const client = { from(name) { assert.equal(name, 'articulos'); return query; } };
  const paused = await togglePublicationPause(client, article, 'owner', () => true);
  assert.equal(paused.status, 'pausado');
  assert.deepEqual(calls, [{ estado: 'pausado', status: 'pausado' }, ['id', 'article'], ['owner_id', 'owner'], ['status', 'disponible']]);
  const active = await togglePublicationPause(client, paused, 'owner', () => { throw new Error('Reactivation needs no pause confirmation'); });
  assert.equal(active.status, 'disponible');
  assert.equal(await togglePublicationPause(never, { ...article, estado: 'reservado' }, 'owner'), null);
});

test('edit availability follows actual requests and the server preflight fails closed', async () => {
  assert.equal(articleEditingLocked({ interested_count: 1 }), true);
  assert.equal(articleEditingLocked({ interested_count: 1 }, false), false);
  assert.equal(articleEditingLocked({ buyer_id: 'buyer' }, false), true);
  assert.equal(articleEditingLocked({ transaction_chat: { status: 'pending' } }), true);
  assert.equal(articleEditingLocked({ transaction_chat: { status: 'closed' } }), false);
  let calls = 0;
  await assert.rejects(assertArticleEditable({ rpc: async (name, args) => {
    calls++; assert.equal(name, 'assert_article_editable'); assert.deepEqual(args, { p_article_id: 'article' });
    return { error: { code: 'P0001', message: 'Esta publicación ya tiene solicitudes.' } };
  } }, 'article'), /ya tiene solicitudes/);
  assert.equal(calls, 1);
});

test('PostgreSQL prevents content and photo edits after interest while keeping pause, resolution and deletion available', async () => {
  const db = new PGlite(), id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;
      create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''test.uid'',true),'''')::uuid';
      create table public.articulos(id uuid primary key,owner_id uuid,title text,description text,price numeric,mode text default 'donacion',
        status text default 'disponible',estado text default 'disponible',buyer_id uuid,ganador_id uuid,winner_id uuid,recipient_id uuid,
        image_url text,imagen_url text,imagen_url_principal text,imagenes text[] default '{}',updated_at timestamptz,created_at timestamptz default now());
      create table public.postulaciones(id uuid primary key default gen_random_uuid(),articulo_id uuid references articulos on delete cascade,usuario_id uuid);
      create table public.chats(id uuid primary key,articulo_id uuid,status text);
      create table public.articulo_imagenes(id uuid primary key,articulo_id uuid references articulos on delete cascade,url text,position integer,file_id text,path text);
      grant usage on schema public,auth to authenticated,anon;
      grant select,insert,update,delete on all tables in schema public to authenticated;
      insert into articulos(id,owner_id,title,description,price) values('${id(1)}','${id(10)}','Original','Descripción',0);
      insert into articulo_imagenes values('${id(2)}','${id(1)}','https://example.com/a.webp',0,'file-a','a'),('${id(3)}','${id(1)}','https://example.com/b.webp',1,'file-b','b');`);
    const sql = await readFile(new URL('../supabase/migrations/2026-11-20-lock-article-editing.sql', import.meta.url), 'utf8');
    await db.exec(sql); await db.exec(sql);
    const as = async n => { await db.exec('reset role;set role authenticated'); await db.query("select set_config('test.uid',$1,false)", [id(n)]); };
    await as(10);
    await db.query("update articulos set title='Permitida sin solicitudes' where id=$1", [id(1)]);
    await as(20); await db.query('insert into postulaciones(articulo_id,usuario_id) values($1,$2)', [id(1), id(20)]);
    await as(10);
    for (const change of ["title='Cambio'", "price=100", "mode='venta'", "description='Otra descripción'", "image_url='https://example.com/changed.webp'"]) {
      await assert.rejects(db.query('update articulos set '+change+' where id=$1', [id(1)]), /ya tiene ofertas/);
    }
    await assert.rejects(db.query('select assert_article_editable($1)', [id(1)]), /ya tiene ofertas/);
    await assert.rejects(db.query('update articulo_imagenes set position=2 where id=$1', [id(2)]), /ya tiene ofertas/);
    await assert.rejects(db.query('delete from articulo_imagenes where id=$1', [id(2)]), /ya tiene ofertas/);
    await assert.rejects(db.query("insert into articulo_imagenes values($1,$2,'https://example.com/new.webp',2,'new','new')", [id(4), id(1)]), /ya tiene ofertas/);
    await assert.rejects(db.query('select owner_remove_article_photo($1)', [id(2)]), /ya tiene ofertas/);
    assert.equal((await db.query('select count(*)::int n from articulo_imagenes')).rows[0].n, 2);
    await db.query("update articulos set estado='pausado',status='pausado' where id=$1", [id(1)]);
    await db.query("update articulos set estado='disponible',status='disponible' where id=$1", [id(1)]);
    await as(20); await db.query('delete from postulaciones where articulo_id=$1', [id(1)]);
    await as(10); await db.query("update articulos set title='Puede editar otra vez' where id=$1", [id(1)]);
    const removed = (await db.query('select owner_remove_article_photo($1) as r', [id(2)])).rows[0].r;
    assert.equal(removed.file_id, 'file-a');
    const remaining = (await db.query('select position from articulo_imagenes')).rows;
    assert.deepEqual(remaining, [{ position: 0 }]);
    assert.equal((await db.query('select image_url from articulos')).rows[0].image_url, 'https://example.com/b.webp');
    await db.query('insert into chats values($1,$2,\'pending\')', [id(30), id(1)]);
    await assert.rejects(db.query("update articulos set price=200 where id=$1", [id(1)]), /ya tiene ofertas/);
    await db.query("update chats set status='closed' where id=$1", [id(30)]);
    await db.query('update articulos set price=200 where id=$1', [id(1)]);
    await as(20); await assert.rejects(db.query('select assert_article_editable($1)', [id(1)]), { code: '42501' });
    await assert.rejects(db.query('select owner_remove_article_photo($1)', [id(3)]), { code: '42501' });
    await db.exec('reset role'); await db.query("select set_config('test.uid',$1,false)", [id(20)]);
    await db.query("update articulos set title='Corrección administrativa de otra cuenta' where id=$1", [id(1)]);
    await as(20); await db.query('insert into postulaciones(articulo_id,usuario_id) values($1,$2)', [id(1), id(20)]);
    await as(10); await db.query('delete from articulos where id=$1', [id(1)]);
    assert.equal((await db.query('select count(*)::int n from articulo_imagenes')).rows[0].n, 0);
    await db.exec('reset role;set role anon');
    await assert.rejects(db.query('select assert_article_editable($1)', [id(1)]), { code: '42501' });
  } finally { await db.close(); }
});
