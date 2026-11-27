import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const sql=name=>readFile(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),'utf8');
const owner='11111111-1111-1111-1111-111111111111';
const other='22222222-2222-2222-2222-222222222222';
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;

test('seller filter applies before counts, featured IDs and pagination, respects RLS and preserves ordinary city search',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon; create role authenticated; create schema auth;
   create function auth.uid() returns uuid language sql stable as 'select null::uuid';
   create table articulos(id uuid primary key,created_at timestamptz default now(),is_featured boolean default true,
    usuario_id uuid,owner_id uuid,estado text default 'disponible',status text,mode text default 'venta',
    title text,category text,categoria text,subcategory text,subcategoria text,city text,locality text default 'Todas');
   grant usage on schema public,auth to anon,authenticated; grant select on articulos to anon,authenticated;
   alter table articulos enable row level security;
   create policy visible on articulos for select using(title<>'Private');`);
  for(let n=1;n<=24;n++)await db.query('insert into articulos(id,owner_id,title,city,estado) values($1,$2,$3,$4,$5)',
   [id(n),n<=15?owner:other,n===15?'Private':'Artículo',n%2?'Bogotá':'Medellín',n===14?'pausado':'disponible']);
  await db.exec(await sql('2026-10-01-home-pagination'));
  const page=async(filters={},n=1)=>(await db.query('select home_article_page($1,$2) result',[filters,n])).rows[0].result;
  await db.exec('set role anon');const before=await page({city:'Bogotá'});
  await db.exec('reset role');await db.exec(await sql('2026-11-26-seller-catalog'));await db.exec(await sql('2026-11-26-seller-catalog'));
  await db.exec('set role anon');
  const ordinary=await page({city:'Bogotá'});assert.deepEqual(ordinary,{...before,sellerId:null});
  const first=await page({sellerId:owner}),second=await page({sellerId:owner},2);
  assert.equal(first.sellerId,owner);assert.equal(first.total,13);assert.equal(first.ids.length,9);assert.equal(second.ids.length,4);
  for(const value of [...first.ids,...second.ids,...first.featuredIds])assert.ok(Number(value.slice(-12))<=13);
  assert.equal(new Set([...first.ids,...second.ids]).size,13);
  assert.equal((await page({sellerId:other})).total,9);
  assert.equal((await page({sellerId:owner,search:'inexistente'})).total,0);
  await assert.rejects(page({sellerId:'not-a-uuid'}),/uuid/);
  const metadata=(await db.query("select prosecdef,has_function_privilege('anon',oid,'EXECUTE') allowed from pg_proc where oid='public.home_article_page(jsonb,integer)'::regprocedure")).rows[0];
  assert.deepEqual(metadata,{prosecdef:false,allowed:true});
 }finally{await db.close();}
});
