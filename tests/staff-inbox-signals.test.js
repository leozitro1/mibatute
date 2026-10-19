import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { staffInboxNotice,subscribeStaffInbox } from '../src/components/staffInboxSignals.js';
import { fetchActivityNotifications } from '../src/components/activityNotifications.js';

const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`,at='2026-10-16T12:00:00.000Z';
test('Realtime notices contain only generic metadata and honor the general-message cutoff',()=>{
  const event={id:id(1),created_at:at,audience_cutoff:at,title:'Private subject',body:'Private body'};
  const notice=staffInboxNotice(event,'2026-10-15T12:00:00Z',true);
  assert.equal(notice.receipt_kind,'staff');assert.equal(notice.title,'Mensaje de MiBatute');
  assert.ok(!JSON.stringify(notice).includes('Private'));
  assert.equal(staffInboxNotice(event,'2026-10-16T12:00:01Z',true),null);
  assert.equal(staffInboxNotice(event,undefined,true),null);
  assert.equal(staffInboxNotice({...event,id:'not-valid'},at),null);
  assert.equal(staffInboxNotice({...event,created_at:'invalid'},at),null);
});

test('one authenticated socket uses two receive-only topics; events never request message bodies',async()=>{
  const channels=[],removed=[],received=[];let authCalls=0;
  const client={realtime:{setAuth:async()=>{authCalls++;}},channel(topic,options){
    const channel={topic,options,on(type,filter,callback){if(filter.event==='inbox_notice')this.callback=callback;return this;},subscribe(){return this;}};
    channels.push(channel);return channel;
  },removeChannel:channel=>removed.push(channel),rpc:()=>{throw new Error('Unexpected request');}};
  const stop=subscribeStaffInbox(client,{id:id(10),created_at:at},notice=>received.push(notice));
  await Promise.resolve();await Promise.resolve();assert.equal(authCalls,1);assert.equal(channels.length,2);
  assert.ok(channels.every(channel=>channel.options.config.private));
  const payload={id:id(1),created_at:at,audience_cutoff:at};channels[0].callback({payload});channels[1].callback({payload});assert.equal(received.length,2);
  stop();channels[0].callback({payload});assert.equal(received.length,2);assert.equal(removed.length,2);
  const immediate=subscribeStaffInbox(client,{id:id(11),created_at:at},()=>{});immediate();await Promise.resolve();await Promise.resolve();assert.equal(channels.length,2,'Strict Mode cleanup cancels pending subscriptions');
});

test('metadata feed replaces the existing activity request and preserves server read state',async()=>{
  let calls=0;const client={rpc:async name=>{assert.equal(name,'notification_activity_feed');calls++;return{data:[{id:'a',read:true},{id:'b',read:false}]};},from:()=>{throw new Error('Extra query');}};
  const rows=await fetchActivityNotifications(client,id(1));assert.equal(calls,1);assert.equal(rows[0].unreadCount,0);assert.equal(rows[1].unreadCount,1);
});

test('private signals, publication authorization and metadata catch-up stay bounded and body-free',async()=>{
  const db=new PGlite();
  const migration=await readFile(new URL('../supabase/migrations/2026-10-16-staff-inbox-signals.sql',import.meta.url),'utf8');
  try{
    await db.exec(`create role anon;create role authenticated;create schema auth;create schema realtime;
      create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
      create table auth.users(id uuid primary key,created_at timestamptz default now());
      create table public.staff_messages(id uuid primary key,sender_id uuid,audience text,audience_cutoff timestamptz,title text,body text,recipient_count integer,created_at timestamptz default now());
      create table public.staff_message_recipients(message_id uuid,user_id uuid,primary key(message_id,user_id));
      create table public.staff_message_states(message_id uuid,user_id uuid,read_at timestamptz,hidden_at timestamptz,primary key(message_id,user_id));
      create table public.activity_notifications(id text,recipient_id uuid,type text,articulo_id uuid,chat_id uuid,buyer_id uuid,receipt_id uuid,created_at timestamptz,title text,subtitle text,thumb text);
      create table realtime.messages(topic text,extension text,payload jsonb,is_private boolean);
      alter table realtime.messages enable row level security;
      create function realtime.topic() returns text language sql stable as 'select current_setting(''test.topic'',true)';
      create function realtime.send(payload jsonb,event text,topic text,private boolean) returns void language sql as 'insert into realtime.messages values(topic,''broadcast'',payload,private)';
      grant usage on schema auth,public,realtime to anon,authenticated;grant select,insert on realtime.messages to authenticated;
      insert into auth.users(id,created_at) values('${id(10)}',now()-interval '1 day'),('${id(11)}',now()-interval '1 day'),('${id(12)}',now()+interval '1 hour');`);
    await db.exec(migration);
    await db.exec(`insert into staff_messages(id,audience,audience_cutoff,title,body,recipient_count) values('${id(1)}','selected',now(),'Secret subject','Secret body',1);
      insert into staff_message_recipients values('${id(1)}','${id(10)}');
      insert into staff_messages(id,audience,audience_cutoff,title,body,recipient_count) values('${id(2)}','all',now(),'Secret general subject','Secret general body',2);`);
    const signals=(await db.query('select * from realtime.messages')).rows;assert.equal(signals.length,2);
    assert.ok(signals.every(row=>row.is_private));assert.deepEqual(Object.keys(signals[0].payload).sort(),['audience_cutoff','created_at','id']);
    assert.equal(signals[0].topic,`mb:inbox:user:${id(10)}`);assert.equal(signals[1].topic,'mb:inbox:all');assert.ok(!JSON.stringify(signals).includes('Secret'));
    assert.equal((await db.query('select count(*)::int n from staff_message_recipients')).rows[0].n,1,'General messages create one signal, not recipient copies');
    const as=async(user,topic='mb:inbox:all')=>{
      await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('test.topic',$2,false)",[user,topic]);
    };
    const feed=async()=>(await db.query('select public.notification_activity_feed() as item')).rows.map(row=>row.item);
    await as(id(10),`mb:inbox:user:${id(10)}`);assert.equal((await db.query('select * from realtime.messages')).rows.length,1);
    await assert.rejects(db.query("insert into realtime.messages values($1,'broadcast','{}',true)",[`mb:inbox:user:${id(10)}`]),/policy/);
    let rows=await feed();assert.equal(rows.length,2);assert.ok(!JSON.stringify(rows).includes('Secret'));assert.ok(rows.every(row=>row.receipt_kind==='staff'));
    await as(id(11),`mb:inbox:user:${id(10)}`);assert.equal((await db.query('select * from realtime.messages')).rows.length,0);
    rows=await feed();assert.equal(rows.length,1);assert.equal(rows[0].receipt_id,id(2));
    await as(id(12));assert.equal((await feed()).length,0,'Accounts created after the audience cutoff receive no old general hints');
    await db.exec(`reset role;create policy unrelated_broad_read on realtime.messages for select to authenticated using(true);
      create policy unrelated_broad_write on realtime.messages for insert to authenticated with check(true);`);
    await as(id(11),`mb:inbox:user:${id(10)}`);assert.equal((await db.query('select * from realtime.messages')).rows.length,0,'Restrictive guard prevents another policy opening private topics');
    await assert.rejects(db.query("insert into realtime.messages values('mb:inbox:all','broadcast','{}',true)"),/policy/);
    await db.exec(`reset role;insert into staff_message_states(message_id,user_id,read_at) values('${id(1)}','${id(10)}',now());
      insert into staff_message_states(message_id,user_id,hidden_at) values('${id(2)}','${id(10)}',now());`);
    await as(id(10));rows=await feed();assert.equal(rows.length,1);assert.equal(rows[0].read,true);
    await db.exec('reset role;set role anon');await assert.rejects(feed(),/permission/);
    await db.exec('reset role');await db.exec(migration);assert.equal((await db.query('select count(*)::int n from realtime.messages')).rows[0].n,2,'Reapplying does not emit old notices');
    await db.exec(`begin;insert into staff_messages(id,audience,audience_cutoff,recipient_count) values('${id(3)}','all',now(),2);rollback;`);
    assert.equal((await db.query('select count(*)::int n from realtime.messages')).rows[0].n,2,'Rolled-back admin sends do not emit notices');
  }finally{await db.close();}
});

test('support replies reuse the private user inbox topic without exposing message content',()=>{
  const notice=staffInboxNotice({id:id(7),kind:'support',created_at:at,body:'Private reply'},at);
  assert.equal(notice.receipt_kind,'support');assert.equal(notice.id,`inbox-support-${id(7)}`);
  assert.equal(notice.title,'Respuesta de MiBatute');assert.ok(!JSON.stringify(notice).includes('Private reply'));
});

test('support removal uses the existing private channel and ignores malformed identifiers',async()=>{
 const channels=[],removed=[];
 const client={realtime:{setAuth:async()=>{}},channel(topic){const callbacks={};const channel={topic,callbacks,on(type,filter,fn){callbacks[filter.event]=fn;return this;},subscribe(){return this;}};channels.push(channel);return channel;},removeChannel(){}};
 const stop=subscribeStaffInbox(client,{id:id(10),created_at:at},()=>{},null,{onSupportRemoved:value=>removed.push(value)});
 await Promise.resolve();await Promise.resolve();assert.equal(channels.length,2);
 channels[0].callbacks.support_removed({payload:{thread_id:'invalid'}});
 channels[0].callbacks.support_removed({payload:{thread_id:id(8)}});
 assert.deepEqual(removed,[id(8)]);assert.equal(channels[1].callbacks.support_removed,undefined);
 stop();channels[0].callbacks.support_removed({payload:{thread_id:id(9)}});assert.equal(removed.length,1);
});
