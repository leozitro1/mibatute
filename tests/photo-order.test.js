import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { movePhoto,orderPhotos } from '../src/components/photoOrder.js';
import { savePhotoOrder } from '../src/supabase/photoOrder.js';
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;

test('photo moves preserve file/preview correspondence and reconcile added or deleted photos without losing a draft order',()=>{
 const files=[{name:'a'},{name:'b'},{name:'c'}],urls=['a','b','c'];
 assert.deepEqual(movePhoto(files,2,0).map(file=>file.name),movePhoto(urls,2,0));
 assert.deepEqual(files.map(file=>file.name),['a','b','c']);assert.equal(movePhoto(files,0,-1),files);
 assert.deepEqual(orderPhotos([{id:'a'},{id:'c'},{id:'d'}],['c','b','a']).map(photo=>photo.id),['c','a','d']);
});

test('owner saves photo order, cover and fields atomically; invalid/stale/foreign requests never partially reorder',async t=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;create schema auth;
   create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
   create table usuarios(id uuid,is_blocked boolean default false,bloqueado boolean default false);
   create table articulos(id uuid primary key,owner_id uuid,status text,estado text,mode text,title text,titulo text,description text,category text,categoria text,subcategory text,subcategoria text,city text,locality text,price numeric,estado_producto integer,imagenes text[],image_url text,imagen_url text,imagen_url_principal text,updated_at timestamptz,is_featured boolean default false);
   create table articulo_imagenes(id uuid primary key,articulo_id uuid references articulos(id),owner_id uuid,url text,path text,position integer);
   grant usage on schema public,auth to authenticated,anon;
   insert into usuarios(id) values('${id(1)}'),('${id(2)}');
   insert into articulos(id,owner_id,status,estado,mode,title,titulo,price,estado_producto) values('${id(10)}','${id(1)}','disponible','disponible','venta','Original','Original',5000,8),('${id(11)}','${id(2)}','disponible','disponible','venta','Ajeno','Ajeno',5000,8);
   insert into articulo_imagenes values('${id(20)}','${id(10)}','${id(1)}','a.jpg','original-a',0),('${id(21)}','${id(10)}','${id(1)}','b.jpg','original-b',1),('${id(22)}','${id(10)}','${id(1)}','c.jpg','original-c',2),('${id(23)}','${id(11)}','${id(2)}','foreign.jpg','foreign',0);`);
  const migration=await readFile(new URL('../supabase/migrations/2026-10-21-article-photo-order.sql',import.meta.url),'utf8');await db.exec(migration);await db.exec(migration);
  const as=async n=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n?id(n):'']);await db.exec(n?'set role authenticated':'set role anon');};
  const save=async(order,fields=null)=>(await db.query('select owner_save_article_photo_order($1,$2,$3) r',[id(10),order.map(n=>n===null?null:id(n)),fields])).rows[0].r;
  const good=[22,20,21],fields={title:'Nuevo título',description:'Nuevo texto',category:'Hogar',subcategory:'Muebles',city:'Bogotá',locality:'Suba',price:25000,estado_producto:7,is_featured:true,mode:'donacion'};
  await t.test('the same save updates every cover alias, ordered rows and form fields, preserving file paths and paid flags',async()=>{
   await as(1);const result=await save(good,fields);assert.equal(result.title,'Nuevo título');assert.equal(result.titulo,'Nuevo título');assert.equal(result.mode,'venta');assert.equal(result.is_featured,false);
   assert.deepEqual(result.imagenes,['c.jpg','a.jpg','b.jpg']);for(const key of ['image_url','imagen_url','imagen_url_principal'])assert.equal(result[key],'c.jpg');
   assert.deepEqual(result.articulo_imagenes.map(image=>image.position),[0,1,2]);assert.deepEqual(result.articulo_imagenes.map(image=>image.path),['original-c','original-a','original-b']);assert.equal(result.price,25000);
   assert.deepEqual((await save(good,fields)).imagenes,result.imagenes);
  });
  await t.test('reject missing, duplicated, foreign, null and stale IDs while keeping the prior order',async()=>{
   for(const bad of [[],[20,21],[20,20,21],[20,21,23],[20,null,21]])await assert.rejects(save(bad),/válido|cambiaron/);
   await db.exec('reset role');await db.query('insert into articulo_imagenes values($1,$2,$3,$4,$5,3)',[id(24),id(10),id(1),'new.jpg','new',]);await as(1);
   await assert.rejects(save(good),/cambiaron/);const result=await save([22,20,21,24]);assert.equal(result.image_url,'c.jpg');
   await db.exec('reset role');await db.query('delete from articulo_imagenes where id=$1',[id(24)]);await as(1);
  });
  await t.test('ownership, authentication, blocked accounts and reserved status cannot be bypassed',async()=>{
   await as(2);await assert.rejects(save(good),/Solo puedes/);await as(null);await assert.rejects(save(good),/permission denied/);
   await db.exec('reset role');await db.query("update articulos set estado='reservado',status='reservado' where id=$1",[id(10)]);await as(1);await assert.rejects(save(good),/disponible o pausada/);
   await db.exec('reset role');await db.query("update articulos set estado='pausado',status='pausado' where id=$1",[id(10)]);await db.query('update usuarios set is_blocked=true where id=$1',[id(1)]);await as(1);await assert.rejects(save(good),/bloqueada/);
   await db.exec('reset role');await db.query('update usuarios set is_blocked=false where id=$1',[id(1)]);await as(1);
  });
  await t.test('failed metadata/cover updates roll back all photo positions',async()=>{
   await db.exec(`reset role;create function reject_test_edit() returns trigger language plpgsql as $$begin if new.title='REJECT' then raise exception 'rejected test edit';end if;return new;end;$$;create trigger reject_test_edit before update on articulos for each row execute function reject_test_edit();`);
   await as(1);await assert.rejects(save([21,20,22],{...fields,title:'REJECT'}),/rejected test edit/);
   await assert.rejects(save([21,20,22],{...fields,price:500001}),/precio/);
   const result=await save(good);assert.deepEqual(result.imagenes,['c.jpg','a.jpg','b.jpg']);assert.equal(result.title,'Nuevo título');
  });
 }finally{await db.close();}
});

test('saving existing photo order uses one RPC and exposes failures instead of doing per-photo writes',async()=>{
 let calls=0;const client={rpc:async(name,args)=>{calls++;assert.equal(name,'owner_save_article_photo_order');assert.deepEqual(args.p_order,['b','a']);assert.equal(args.p_fields.title,'Test');return {data:{id:'article',image_url:'b.jpg'}};}};
 assert.equal((await savePhotoOrder(client,'article',['b','a'],{title:'Test'})).success,true);assert.equal(calls,1);
 assert.equal((await savePhotoOrder({rpc:async()=>({error:{code:'PGRST202'}})},'a',[])).success,false);
});
