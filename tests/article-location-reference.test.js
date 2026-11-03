import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {getEditableArticle} from '../src/components/editArticleData.js';
import {locationReferenceIssue} from '../src/components/articleValidation.js';
import {publicationStepError} from '../src/components/publicationSteps.js';
import {filterProfileItems,DEFAULT_PROFILE_FILTERS} from '../src/components/profileFilters.js';
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const migration=name=>readFile(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),'utf8');

test('reference is optional, bounded, validated like publication text, restored for editing and searchable in profile',()=>{
 assert.equal(getEditableArticle().locationReference,'');
 assert.equal(getEditableArticle({location_reference:'Hayuelos'}).locationReference,'Hayuelos');
 assert.equal(locationReferenceIssue(''),null);assert.equal(locationReferenceIssue('Cerca al centro comercial Hayuelos'),null);
 assert.match(locationReferenceIssue('x'.repeat(101)),/100/);
 assert.match(locationReferenceIssue('Contacto 3001234567'),/contacto/);
 assert.match(locationReferenceIssue('prueba@example.com'),/correo/);
 const draft={formData:{city:'Bogotá',locality:'Fontibón',locationReference:'x'.repeat(101)},locations:{Bogotá:['Fontibón']}};
 assert.match(publicationStepError(3,draft),/100/);
 const row={id:'a',title:'Mesa',city:'Bogotá',locality:'Fontibón',location_reference:'Cerca al centro comercial Hayuelos'};
 assert.equal(filterProfileItems([row],{...DEFAULT_PROFILE_FILTERS,search:'hayuelos'}).length,1);
});

test('reference saves with publishing and photo reorder, indexes on the same document and cannot bypass validation or owner checks',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
   create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
   create table auth.users(id uuid,email_confirmed_at timestamptz);
   create table usuarios(id uuid,nombre text,is_blocked boolean default false,bloqueado boolean default false);
   create text search configuration public.article_search(copy=pg_catalog.simple);
   create table articulos(id uuid primary key,owner_id uuid,owner_name text,title text,titulo text,description text,mode text,price numeric,
    city text,locality text,category text,categoria text,subcategory text,subcategoria text,estado_producto int,size_class text,status text,estado text,
    imagenes text[],image_url text,imagen_url text,imagen_url_principal text,is_featured boolean default false,updated_at timestamptz,
    home_search_document tsvector generated always as (to_tsvector('public.article_search'::regconfig,coalesce(title,''))) stored);
   create index articulos_home_search_gin on articulos using gin(home_search_document);
   create table articulo_imagenes(id uuid primary key,articulo_id uuid,url text,position int);
   create table article_publication_credits(article_id uuid primary key,usuario_id uuid,cost int,publication_ready boolean);
   create table cupos(usuario_id uuid,saldo int,updated_at timestamptz);
   create table cupos_historial(usuario_id uuid,cantidad int,concepto text,referencia_id uuid);
   create function public.sale_publication_status() returns jsonb language sql as 'select ''{"balance":5,"requiresCredit":false}''::jsonb';
   insert into auth.users values('${id(1)}',now()),('${id(2)}',now());
   insert into usuarios(id,nombre) values('${id(1)}','Test'),('${id(2)}','Other');
   insert into articulos(id,title) values('${id(9)}','Anterior');
   grant usage on schema public,auth to anon,authenticated;
   grant select,update on articulos to authenticated;
   grant select on articulos to anon;
   alter table articulos enable row level security;
   create policy visible on articulos for select using(title is distinct from 'Private');
   create policy edit_owned on articulos for update using(owner_id=auth.uid());`);
  await db.exec(await migration('2026-10-28-publication-text-rules'));
  const sql=await migration('2026-11-03-article-location-reference');await db.exec(sql);await db.exec(sql);
  assert.equal((await db.query('select location_reference from articulos where id=$1',[id(9)])).rows[0].location_reference,'');
  const as=async n=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(n)]);await db.exec('set role authenticated');};
  await as(1);
  const fields={title:'Mesa',description:'De madera',mode:'venta',price:25000,city:'Bogotá',locality:'Fontibón',category:'Hogar',subcategory:'Muebles',imagenes:['https://example.com/mesa.jpg'],location_reference:' Cerca al centro comercial   Hayuelos '};
  const publish=async(n,more={})=>(await db.query('select public.publish_article_with_credit($1,$2,false) r',[{...fields,...more},id(n)])).rows[0].r;
  const saved=await publish(10);assert.equal(saved.article.location_reference,'Cerca al centro comercial Hayuelos');
  assert.equal((await publish(10,{location_reference:'Otro lugar'})).article.location_reference,saved.article.location_reference,'idempotent request preserves saved reference');
  await assert.rejects(publish(11,{location_reference:'x'.repeat(101)}),/100/);
  await assert.rejects(publish(12,{location_reference:'Contacto 3001234567'}),/contacto/);
  await db.exec('reset role');
  assert.equal((await db.query('select count(*) n from article_publication_credits where article_id=$1',[id(11)])).rows[0].n,0);
  await db.query('insert into articulo_imagenes values($1,$2,$3,0)',[id(20),id(10),'https://example.com/mesa.jpg']);
  await as(1);
  const save=async more=>(await db.query('select public.owner_save_article_photo_order($1,$2,$3) r',[id(10),[id(20)],{...fields,...more}])).rows[0].r;
  assert.equal((await save({location_reference:'Barrio Modelia'})).location_reference,'Barrio Modelia');
  await assert.rejects(save({location_reference:'x'.repeat(101)}),/100/);
  await db.query('update articulos set location_reference=$1 where id=$2',['Cerca al centro comercial Hayuelos',id(10)]);
  await assert.rejects(db.query('update articulos set location_reference=$1 where id=$2',['prueba@example.com',id(10)]),/correo/);
  await as(2);await assert.rejects(save({location_reference:'Ajeno'}),/Solo puedes/);
  await db.query('update articulos set location_reference=$1 where id=$2',['Ajeno',id(10)]);
  await db.exec('reset role;set role anon');
  const found=(await db.query("select id from articulos where home_search_document @@ to_tsquery('public.article_search','hayue:*')")).rows;
  assert.deepEqual(found.map(row=>row.id),[id(10)]);
  assert.equal((await db.query("select id from articulos where home_search_document @@ to_tsquery('public.article_search','fontibón & hayue:*')")).rows.length,1);
  await db.exec('reset role');
  assert.equal((await db.query("select count(*) n from pg_indexes where indexname='articulos_home_search_gin'")).rows[0].n,1);
 }finally{await db.close();}
});
