import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { articleSize } from '../src/data/articleSizes.js';
import { getEditableArticle } from '../src/components/editArticleData.js';
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const migration = await readFile(new URL('../supabase/migrations/2026-10-28-article-size-reuse-impact.sql', import.meta.url),'utf8');

test('size choices remain optional for existing articles and explain transport without weights', () => {
  assert.equal(getEditableArticle({}).sizeClass, '');
  assert.equal(getEditableArticle({size_class:'grande'}).sizeClass, 'grande');
  assert.match(articleSize('grande').description, /transporte/);
  assert.equal(articleSize('unknown'), null);
});

test('reuse total is private, transactional, retained after deletion and counted once; sizes survive publish and photo reorder', async () => {
 const db = new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;create schema auth;
   create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
   create table auth.users(id uuid,email_confirmed_at timestamptz);
   create table usuarios(id uuid,nombre text,is_blocked boolean default false,bloqueado boolean default false);
   create table articulos(id uuid primary key,owner_id uuid,usuario_id uuid,owner_name text,title text,titulo text,description text,mode text,price numeric,
    city text,locality text,category text,categoria text,subcategory text,subcategoria text,estado_producto int,status text,estado text,review_status text,
    imagenes text[],image_url text,imagen_url text,imagen_url_principal text,is_featured boolean default false,
    created_at timestamptz default now(),updated_at timestamptz,delivered_at timestamptz,home_search_document tsvector default ''::tsvector);
   create table articulo_imagenes(id uuid primary key,articulo_id uuid,url text,position int);
   create table article_publication_credits(article_id uuid primary key,usuario_id uuid,cost int,publication_ready boolean);
   create table cupos(usuario_id uuid,saldo int,updated_at timestamptz);
   create table cupos_historial(usuario_id uuid,cantidad int,concepto text,referencia_id uuid);
   create text search configuration public.article_search (copy=pg_catalog.simple);
   create function public.article_related_prefix_query(text) returns tsquery language sql as 'select plainto_tsquery($1)';
   create function public.sale_publication_status() returns jsonb language sql as 'select ''{"balance":5,"requiresCredit":false}''::jsonb';
   insert into auth.users values('${id(1)}',now());insert into usuarios(id,nombre) values('${id(1)}','Test');
   insert into articulos(id,status,estado,mode,delivered_at) values('${id(9)}','entregado','entregado','venta',now());
   grant usage on schema public,auth to anon,authenticated;
   grant select,insert,update,delete on articulos to authenticated;
   grant select on articulos to anon;
   alter table articulos enable row level security;
   create policy visible on articulos for select using(title is distinct from 'Private');
  `);
  await db.exec(migration);
  const count = async () => Number((await db.query('select market_reuse_impact() as r')).rows[0].r.articles);
  assert.equal(await count(),0, 'no historical backfill');
  await db.exec('set role anon');
  assert.equal(await count(),0);
  await assert.rejects(db.query('select * from market_impact_totals'),/permission denied/);
  await db.exec('reset role;set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(1)]);
  const article={title:'Mesa',description:'Madera',mode:'venta',price:25000,city:'Bogotá',locality:'Suba',category:'Hogar',subcategory:'Muebles',imagenes:['https://example.com/mesa.jpg'],size_class:'grande'};
  const publish=async(n,fields={})=>(await db.query('select publish_article_with_credit($1,$2,false) as r',[{...article,...fields},id(n)])).rows[0].r;
  assert.equal((await publish(10)).article.size_class,'grande');
  assert.equal((await publish(10,{size_class:'mediano'})).article.size_class,'grande','retry preserves original');
  await assert.rejects(publish(11,{size_class:'invalid'}),/check constraint/);
  await db.exec('reset role');
  assert.equal((await db.query('select * from article_publication_credits where article_id=$1',[id(11)])).rows.length,0,'invalid size rolls back the publication permit');
  await db.query('insert into articulo_imagenes values($1,$2,$3,0)',[id(20),id(10),'https://example.com/mesa.jpg']);
  await db.query('select owner_save_article_photo_order($1,$2,$3)',[id(10),[id(20)],{...article,size_class:'mediano'}]);
  assert.equal((await db.query('select size_class from articulos where id=$1',[id(10)])).rows[0].size_class,'mediano');
  await db.exec(`begin;update articulos set status='entregado',estado='entregado',delivered_at=now() where id='${id(10)}';`);
  assert.equal(await count(),1);await db.exec('rollback');assert.equal(await count(),0);
  await db.exec(`update articulos set status='entregado',estado='entregado',delivered_at=now() where id='${id(10)}';`);
  assert.equal(await count(),1);
  await db.exec(`update articulos set impact_counted_at=null where id='${id(10)}';update articulos set status='reservado' where id='${id(10)}';update articulos set status='entregado' where id='${id(10)}';`);
  assert.equal(await count(),1);
  await db.exec(`insert into articulos(id,status,estado,mode,delivered_at,impact_counted_at) values('${id(12)}','disponible','disponible','donacion',now(),now());update articulos set status='entregado',estado='entregado' where id='${id(12)}';`);
  assert.equal(await count(),2);
  await db.exec(`delete from articulos where id in ('${id(10)}','${id(12)}');`);assert.equal(await count(),2);
  await db.exec(migration);assert.equal(await count(),2,'migration replay does not reset the counter');
  await db.exec('set role anon');
  const page=(await db.query('select home_article_page() as r')).rows[0].r;
  assert.equal(page.reuseImpact.articles,2);
  assert.deepEqual(page.ids,[]);
 } finally {await db.close();}
});
