import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { acknowledgeNotificationBell } from '../src/components/notificationBellSync.js';
import { fetchActivityNotifications } from '../src/components/activityNotifications.js';
const uid='11111111-1111-1111-1111-111111111111',other='22222222-2222-2222-2222-222222222222';
const item=(id,extra={})=>({id:`inbox-staff-${id}`,type:'system_notice',receipt_id:id,receipt_kind:'staff',created_at:'2026-01-01T12:00:00Z',read:false,...extra});

test('bell acknowledgements batch a single write, contain no message content and failures do not pretend success',async()=>{
 const calls=[],client={rpc:async(name,args)=>{calls.push({name,args});return {error:null};}};
 await acknowledgeNotificationBell(client,[item('a',{title:'Private title'}),item('b')]);
 assert.equal(calls.length,1);assert.equal(calls[0].name,'notification_bell_ack');
 assert.deepEqual(calls[0].args,{p_items:[{key:'receipt|staff|a',created_at:new Date(item('a').created_at).toISOString()},{key:'receipt|staff|b',created_at:new Date(item('b').created_at).toISOString()}],p_action:'read'});
 await acknowledgeNotificationBell(client,[]);assert.equal(calls.length,1);
 await assert.rejects(acknowledgeNotificationBell({rpc:async()=>({error:{message:'internal details'}})},[item('a')]),/sincronizar/);
 const feed=await fetchActivityNotifications({rpc:async name=>{assert.equal(name,'notification_activity_feed');return {data:[item('a',{bellRead:true})]};}},uid);
 assert.equal(feed[0].bellRead,true);assert.equal(feed[0].read,false);
});

test('account acknowledgements survive a second client without extra reads or changing inbox receipt states',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
   create table auth.users(id uuid primary key);insert into auth.users values('${uid}'),('${other}');
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create table public.feed(recipient uuid,item jsonb,position integer);
   create function public.notification_receipt_action(p_receipt_id uuid,p_action text) returns void language plpgsql security definer set search_path='' as $$begin
    if not exists(select 1 from public.feed where recipient=auth.uid() and item->>'receipt_id'=p_receipt_id::text) then raise exception 'No permission' using errcode='42501';end if;
    update public.feed set item=jsonb_set(item,'{read}',to_jsonb(p_action='read')) where recipient=auth.uid() and item->>'receipt_id'=p_receipt_id::text;
   end;$$;
   create function public.staff_message_receipt_action(p_message uuid,p_action text) returns void language plpgsql security definer set search_path='' as $$begin
    if not exists(select 1 from public.feed where recipient=auth.uid() and item->>'receipt_id'=p_message::text) then raise exception 'No permission' using errcode='42501';end if;
    update public.feed set item=jsonb_set(item,'{read}',to_jsonb(p_action='read')) where recipient=auth.uid() and item->>'receipt_id'=p_message::text;
   end;$$;
   create function public.notification_activity_feed() returns setof jsonb language sql stable security definer set search_path='' as $$select item from public.feed where recipient=auth.uid() order by position$$;
   grant usage on schema public,auth to anon,authenticated;
   grant execute on function public.notification_activity_feed() to authenticated;`);
  const sql=await readFile(new URL('../supabase/migrations/2026-11-24-notification-bell-sync.sql',import.meta.url),'utf8');
  await db.exec(sql);await db.exec(sql);
  const records=[item('old'),item('thread',{receipt_kind:'support'}),item('new',{created_at:'2026-01-01T12:01:00Z'})];
  for(let i=0;i<records.length;i++)await db.query('insert into feed values($1,$2,$3)',[uid,records[i],i]);
  await db.query('insert into feed values($1,$2,0)',[other,item('old')]);
  const login=async id=>{await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);};
  const ack=async(items,action='read')=>db.query('select notification_bell_ack($1,$2)',[items,action]);
  const feed=async()=>(await db.query('select notification_activity_feed() as item')).rows.map(r=>r.item);
  await login(uid);
  await ack([{key:'receipt|staff|old',created_at:records[0].created_at},{key:'receipt|support|thread',created_at:records[1].created_at}]);
  // A fresh authenticated session reads the same feed, including acknowledgements.
  await login(other);assert.equal((await feed())[0].bellRead,false);
  await login(uid);let refreshed=await feed();
  assert.deepEqual(refreshed.map(r=>r.bellRead),[true,true,false]);
  assert.ok(refreshed.every(r=>r.read===false));
  await assert.rejects(db.query('select * from notification_bell_reads'),{code:'42501'});
  await assert.rejects(db.query('delete from notification_bell_reads'),{code:'42501'});
  await assert.rejects(db.query('select notification_activity_feed_before_bell_sync()'),{code:'42501'});
  await db.exec('reset role');
  await db.query("update feed set item=jsonb_set(item,'{created_at}','\"2026-01-01T12:02:00Z\"') where recipient=$1 and position=1",[uid]);
  await login(uid);assert.equal((await feed())[1].bellRead,false);
  await ack([{key:'receipt|staff|old',created_at:records[0].created_at}],'unread');
  assert.equal((await feed())[0].bellRead,false);
  await assert.rejects(ack(Array.from({length:301},()=>({key:'a',created_at:records[0].created_at}))),{code:'22023'});
  await assert.rejects(ack([{key:'future',created_at:'2999-01-01T00:00:00Z'}]),{code:'22023'});
  await db.exec('reset role');
  await db.query('insert into feed values($1,$2,4)',[uid,item(other)]);
  await login(uid);await db.query("select staff_message_receipt_action($1,'read')",[other]);
  await login(uid);assert.equal((await feed()).find(r=>r.receipt_id===other).bellRead,true);
  await db.query("select staff_message_receipt_action($1,'unread')",[other]);
  assert.equal((await feed()).find(r=>r.receipt_id===other).bellRead,false);
  await login(other);await assert.rejects(db.query("select staff_message_receipt_action($1,'read')",[other]),{code:'42501'});
  await db.exec('reset role;set role anon');await assert.rejects(ack([]),{code:'42501'});
 }finally{await db.close();}
});
