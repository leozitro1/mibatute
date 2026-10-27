import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {recordArticleView} from '../src/components/articleViews.js';
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;

test('article counters exclude owner/admin, deduplicate across sessions, isolate totals and never update articles',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create table auth.users(id uuid primary key,raw_app_meta_data jsonb default '{}');
   create table public.staff_accounts(user_id uuid,role text);
   create function public.staff_permission(text) returns boolean language sql stable security definer as $$select exists(select 1 from public.staff_accounts where user_id=auth.uid())$$;
   create table public.articulos(id uuid primary key,owner_id uuid,usuario_id uuid,status text,estado text,review_status text);
   create table public.article_updates(id uuid);
   create function detect_updates() returns trigger language plpgsql as $$begin insert into public.article_updates values(new.id);return new;end$$;
   create trigger changes after update on articulos for each row execute function detect_updates();
   grant usage on schema auth,public to anon,authenticated;grant select on articulos to authenticated;
   insert into auth.users(id) values('${id(1)}'),('${id(2)}'),('${id(3)}');
   insert into staff_accounts values('${id(3)}','admin');
   insert into articulos values('${id(10)}','${id(1)}','${id(1)}','disponible','disponible','approved');`);
  await db.exec(await readFile(new URL('../supabase/migrations/2026-10-27-article-views.sql',import.meta.url),'utf8'));
  const as=async n=>{await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n?id(n):'']);};
  const view=async(n=20)=>(await db.query('select record_article_view($1,$2) result',[id(10),id(n)])).rows[0].result;
  await as(1);assert.equal(await view(),false);
  await as(3);assert.equal(await view(),false);
  await as(2);assert.equal(await view(),true);assert.equal(await view(21),false,'same authenticated visitor across sessions');
  assert.equal((await db.query('select * from article_view_totals')).rows.length,0,'other users cannot read private statistics');
  await assert.rejects(db.query('update article_view_totals set view_count=999'),/permission/);
  await assert.rejects(db.query('select * from article_view_visitors'),/permission/);
  await db.exec("reset role;update article_view_visitors set viewed_at=now()-interval '25 hours'");
  await as(2);assert.equal(await view(),true);
  await as(null);await db.exec('set role anon');assert.equal(await view(22),true);assert.equal(await view(22),false);
  await as(1);assert.equal(Number((await db.query('select view_count from article_view_totals')).rows[0].view_count),3);
  await as(3);assert.equal((await db.query('select * from article_view_totals')).rows.length,1);
  await db.exec('reset role');assert.equal((await db.query('select * from article_updates')).rows.length,0);
  await db.exec('delete from articulos');assert.equal((await db.query('select * from article_view_totals')).rows.length,0);
  assert.equal((await db.query('select * from article_view_visitors')).rows.length,0);
 }finally{await db.close();}
});

test('browser skips own/staff visits and reopens, including concurrent detail mounts and failed requests',async()=>{
 const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
 let calls=0,release;
 const client={rpc:()=>{calls++;return new Promise(resolve=>{release=resolve;});}};
 const args={articleId:id(40),ownerId:id(1),userId:id(2),storage};
 assert.equal(await recordArticleView(client,{...args,userId:id(1)}),false);
 assert.equal(await recordArticleView(client,{...args,staff:true}),false);assert.equal(calls,0);
 const pending=recordArticleView(client,args);
 assert.equal(await recordArticleView(client,args),false);assert.equal(calls,1);
 release({data:true,error:null});assert.equal(await pending,true);
 assert.equal(await recordArticleView(client,args),false);assert.equal(calls,1);
 let failures=0;
 const broken={rpc:async()=>{failures++;return {error:{message:'offline'}};}};
 await recordArticleView(broken,{...args,articleId:id(41)});await recordArticleView(broken,{...args,articleId:id(41)});
 assert.equal(failures,2,'failure does not mark a view as recorded');
});
