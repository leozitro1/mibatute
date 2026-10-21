import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { attentionCounts, attentionBadge, attentionRow } from '../src/staff/attention.js';
import { createAttentionFeed } from '../src/staff/attentionFeed.js';
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const source=await readFile(new URL('../supabase/migrations/2026-10-14-staff-console.sql',import.meta.url),'utf8');
const migration=await readFile(new URL('../supabase/migrations/2026-10-20-staff-attention.sql',import.meta.url),'utf8');
const definition=name=>{const start=source.indexOf(`create or replace function public.${name}(`);return source.slice(start,source.indexOf('$$;',start)+3);};

test('staff attention counts are permission scoped, per-reader and protected by real MFA/session guards',async t=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema realtime;
   create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
   create function auth.jwt() returns jsonb language sql stable as 'select coalesce(nullif(current_setting(''request.jwt.claims'',true),''''),''{}'')::jsonb';
   create table auth.sessions(id uuid primary key,user_id uuid);create table auth.mfa_factors(user_id uuid,status text,factor_type text);
   create table public.usuarios(id uuid,is_blocked boolean default false,bloqueado boolean default false,ban_until timestamptz);
   create table public.staff_accounts(user_id uuid,role text,active boolean default true,permissions text[] default '{}');
   create table public.staff_sessions(session_id uuid,user_id uuid,revoked_at timestamptz,expires_at timestamptz,last_seen_at timestamptz);
   create table public.articulos(id uuid primary key,review_status text,title text);
   create table public.reports(id uuid primary key,status text,body text);
   create table public.chat_reports(id uuid primary key,status text);
   create table public.data_rights_requests(id uuid primary key,status text,body text);
   create table public.support_threads(id uuid primary key,last_user_seq bigint,last_staff_seq bigint,last_message_seq bigint,closed_at timestamptz,user_hidden_at timestamptz,user_read_seq bigint default 0);
   create table public.support_staff_reads(thread_id uuid,staff_id uuid,last_seen_seq bigint,primary key(thread_id,staff_id));
   create table public.test_signals(payload jsonb,event text,topic text,private boolean);
   create function realtime.send(payload jsonb,event text,topic text,private boolean) returns void language sql as 'insert into public.test_signals values(payload,event,topic,private)';
   grant usage on schema public,auth to authenticated,anon;
  `);
  await db.exec(definition('staff_permission'));await db.exec(definition('staff_require'));
  await db.exec(migration);await db.exec(migration);
  for(const [n,role,permissions] of [[1,'master',[]],[2,'admin',['reports']],[3,'admin',[]]]){
   await db.query('insert into public.usuarios(id) values($1)',[id(n)]);
   await db.query('insert into public.staff_accounts(user_id,role,permissions) values($1,$2,$3)',[id(n),role,permissions]);
   await db.query('insert into auth.sessions values($1,$2)',[id(n+100),id(n)]);
   await db.query("insert into auth.mfa_factors values($1,'verified','totp')",[id(n)]);
   await db.query("insert into public.staff_sessions values($1,$2,null,now()+interval '8 hours',now())",[id(n+100),id(n)]);
  }
  await db.query("insert into public.articulos values($1,'pending','Private article'),($2,'approved','Visible')",[id(10),id(11)]);
  await db.query("insert into public.reports values($1,'open','PRIVATE REPORT BODY'),($2,'resolved','Done')",[id(20),id(21)]);
  await db.query("insert into public.chat_reports values($1,'reviewing')",[id(22)]);
  await db.query("insert into public.data_rights_requests values($1,'open','PRIVATE DATA'),($2,'reviewing','PRIVATE DATA'),($3,'answered','Done')",[id(30),id(31),id(32)]);
  await db.query('insert into public.support_threads values($1,5,6,6,null,null,0)',[id(40)]);
  await db.query('insert into public.support_staff_reads values($1,$2,5)',[id(40),id(1)]);
  const asUser=async(n,aal='aal2')=>{await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(n)]);await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id(n),aal,role:'authenticated',session_id:id(n+100)})]);};
  const counts=async()=>(await db.query('select public.staff_attention_summary() as r')).rows[0].r;
  await t.test('master sees every actionable count; active team is excluded from total',async()=>{
   await asUser(1);assert.deepEqual(await counts(),{articles:1,reports:2,privacy:2,inbox:0,team:3,pending:5});
  });
  await t.test('admins see only permitted review queues and their own unread conversations',async()=>{
   await asUser(2);assert.deepEqual(await counts(),{articles:0,reports:2,privacy:2,inbox:1,team:0,pending:5});
   await asUser(3);assert.deepEqual(await counts(),{articles:0,reports:0,privacy:2,inbox:1,team:0,pending:3});
  });
  await t.test('ordinary users, missing second factor, expired and revoked sessions cannot read counts',async()=>{
   await asUser(4);await assert.rejects(counts(),/Acceso no autorizado/);
   await asUser(1,'aal1');await assert.rejects(counts(),/Acceso no autorizado/);
   await db.exec('reset role');await db.query("update public.staff_sessions set last_seen_at=now()-interval '16 minutes' where user_id=$1",[id(2)]);
   await asUser(2);await assert.rejects(counts(),/Acceso no autorizado/);
   await db.exec('reset role');await db.query('update public.staff_sessions set revoked_at=now() where user_id=$1',[id(3)]);
   await asUser(3);await assert.rejects(counts(),/Acceso no autorizado/);
   await db.exec('reset role;set role anon');await assert.rejects(counts(),/permission denied/);
  });
  await t.test('resolving cases removes counts and publications remain pending while under review',async()=>{
   await db.exec('reset role');await db.query("update public.reports set status='resolved' where id=$1",[id(20)]);
   await db.query("update public.data_rights_requests set status='answered' where id=$1",[id(30)]);
   await db.query("update public.articulos set review_status='reviewing' where id=$1",[id(10)]);
   await asUser(1);const result=await counts();assert.equal(result.reports,1);assert.equal(result.privacy,1);assert.equal(result.articles,1);
  });
  await t.test('private signals contain only metadata; user reads never wake staff and staff acknowledgements are targeted',async()=>{
   await db.exec('reset role;truncate public.test_signals');
   await db.query('update public.support_threads set user_read_seq=6 where id=$1',[id(40)]);
   await db.query("update public.articulos set title='Edit without moderation' where id=$1",[id(10)]);
   assert.equal((await db.query('select * from public.test_signals')).rows.length,0);
   await db.query('insert into public.support_staff_reads values($1,$2,5)',[id(40),id(2)]);
   const ack=(await db.query('select * from public.test_signals')).rows[0];
   assert.deepEqual(ack.payload,{section:'inbox',refresh_list:false,staff_id:id(2)});
   await db.query('update public.support_threads set last_user_seq=7,last_message_seq=7 where id=$1',[id(40)]);
   await db.query("update public.data_rights_requests set body='PRIVATE UPDATED DATA' where id=$1",[id(31)]);
   for(const signal of (await db.query('select * from public.test_signals')).rows){assert.equal(signal.topic,'mb:support:staff');assert.equal(signal.private,true);assert.equal(signal.event,'staff_attention_changed');assert.ok(Object.keys(signal.payload).every(key=>['section','refresh_list','staff_id'].includes(key)));assert.ok(!JSON.stringify(signal).includes('PRIVATE'));}
   await asUser(1);assert.equal((await counts()).inbox,1);
  });
 } finally { await db.close(); }
});

function feedFixture({hidden=false}={}) {
 let next=1;const tasks=new Map(),snapshots=[],listeners=new Set();
 const visibility={visibilityState:hidden?'hidden':'visible',addEventListener:(_,fn)=>listeners.add(fn),removeEventListener:(_,fn)=>listeners.delete(fn)};
 const channel={on(_type,_filter,handler){this.changed=handler;return this;},subscribe(handler){this.status=handler;return this;}};
 const client={calls:0,channels:0,removed:0,response:{data:{articles:1,reports:2,privacy:1,inbox:1,team:1}},rpc:async()=>{client.calls++;return client.response;},realtime:{setAuth:async()=>{}},channel(topic,config){assert.equal(topic,'mb:support:staff');assert.equal(config.config.private,true);client.channels++;return channel;},removeChannel(){client.removed++;}};
 const clock={setTimeout:fn=>{const n=next++;tasks.set(n,fn);return n;},clearTimeout:n=>tasks.delete(n)};
 let expired=0;
 const feed=createAttentionFeed({client,userId:'staff',visibility,clock,onSnapshot:snapshot=>snapshots.push(snapshot),onAccessExpired:()=>expired++});
 return {client,channel,feed,snapshots,tasks,listeners,get expired(){return expired;},async ready(){await Promise.resolve();channel.status('SUBSCRIBED');},async flush(){const work=[...tasks.values()];tasks.clear();await Promise.all(work.map(fn=>fn()));},hide(){visibility.visibilityState='hidden';},show(){visibility.visibilityState='visible';for(const fn of listeners)fn();},event(payload){channel.changed({payload});}};
}

test('default timers keep the native browser receiver instead of invoking them on the clock object',()=>{
 const originalSet=globalThis.setTimeout,originalClear=globalThis.clearTimeout;
 const listeners=new Set();let scheduled=0,cleared=0,feed;
 try {
  globalThis.setTimeout=function(){assert.equal(this,undefined);scheduled++;return 42;};
  globalThis.clearTimeout=function(timer){assert.equal(this,undefined);assert.equal(timer,42);cleared++;};
  feed=createAttentionFeed({client:{realtime:{setAuth:async()=>{}}},userId:'staff',onSnapshot:()=>{},
   visibility:{visibilityState:'visible',addEventListener:(_,fn)=>listeners.add(fn),removeEventListener:(_,fn)=>listeners.delete(fn)}});
  feed.stop();feed=null;assert.equal(scheduled,1);assert.equal(cleared,1);assert.equal(listeners.size,0);
 } finally {if(feed)feed.stop();globalThis.setTimeout=originalSet;globalThis.clearTimeout=originalClear;}
});

test('one staff channel coalesces bursts, does not poll, and isolates read acknowledgements',async()=>{
 const f=feedFixture();await f.ready();await f.flush();assert.equal(f.client.channels,1);assert.equal(f.client.calls,1);assert.equal(f.tasks.size,0);
 for(let n=0;n<20;n++)f.event({section:'reports',refresh_list:true});f.event({section:'privacy',refresh_list:true});
 assert.equal(f.tasks.size,1);await f.flush();assert.equal(f.client.calls,2);assert.equal(f.snapshots.at(-1).revisions.reports,2);
 f.event({section:'inbox',staff_id:'other',refresh_list:false});f.event({section:'invalid'});assert.equal(f.tasks.size,0);
 const revisions={...f.snapshots.at(-1).revisions};f.event({section:'inbox',staff_id:'staff',refresh_list:false});await f.flush();assert.equal(f.client.calls,3);assert.deepEqual(f.snapshots.at(-1).revisions,revisions);
 f.feed.stop();assert.equal(f.client.removed,1);assert.equal(f.listeners.size,0);
});
test('hidden tabs accumulate changes and reconnect refreshes once; stopped feeds ignore late RPCs',async()=>{
 const f=feedFixture({hidden:true});await f.ready();for(let n=0;n<10;n++)f.event({section:'reports',refresh_list:true});await f.flush();assert.equal(f.client.calls,0);
 f.show();await f.flush();assert.equal(f.client.calls,1);
 f.channel.status('CHANNEL_ERROR');f.feed.refresh();await f.flush();assert.equal(f.snapshots.at(-1).status,'error');
 f.channel.status('SUBSCRIBED');await f.flush();assert.equal(f.snapshots.at(-1).status,'ready');
 let resolve;f.client.rpc=()=>new Promise(done=>{resolve=done;});f.feed.refresh();const pending=f.flush();await Promise.resolve();const count=f.snapshots.length;f.feed.stop();resolve({data:{articles:9,reports:0,privacy:0,inbox:0}});await pending;assert.equal(f.snapshots.length,count);assert.equal(f.tasks.size,0);
});
test('failed/malformed counts preserve the last result and access expiry is handled without retry loops',async()=>{
 const f=feedFixture();await f.ready();await f.flush();const old=f.snapshots.at(-1).counts;
 f.client.response={data:null};f.feed.refresh();await f.flush();assert.deepEqual(f.snapshots.at(-1).counts,old);assert.equal(f.snapshots.at(-1).status,'error');
 f.client.response={error:{code:'42501'}};f.feed.refresh();await f.flush();assert.equal(f.expired,1);assert.equal(f.tasks.size,0);f.feed.stop();
});
test('badge totals do not double count pending or team; row dots match unresolved and unread states',()=>{
 assert.deepEqual(attentionCounts({articles:2,reports:4,privacy:1,inbox:3,team:8,pending:999},['pending','reports','privacy','inbox']),{articles:0,reports:4,privacy:1,inbox:3,pending:8,team:0});
 assert.equal(attentionBadge(102),'99+');assert.equal(attentionRow('reports',{status:'resolved'}),false);assert.equal(attentionRow('privacy',{status:'reviewing'}),true);assert.equal(attentionRow('articles',{review_status:'pending'}),true);assert.equal(attentionRow('inbox',{unread:true}),true);
});
