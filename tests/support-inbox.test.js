import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const sql=await readFile(new URL('../supabase/migrations/2026-10-19-support-inbox.sql',import.meta.url),'utf8');
const hideSql=await readFile(new URL('../supabase/migrations/2026-10-19-support-inbox-hide.sql',import.meta.url),'utf8');
const limitSql=await readFile(new URL('../supabase/migrations/2026-10-19-support-message-limit.sql',import.meta.url),'utf8');
const closureSql=await readFile(new URL('../supabase/migrations/2026-10-19-support-closure-preview.sql',import.meta.url),'utf8');
const staffSql=await readFile(new URL('../supabase/migrations/2026-10-14-staff-console.sql',import.meta.url),'utf8');
function definition(source,name){const start=source.indexOf(`create or replace function public.${name}(`);return source.slice(start,source.indexOf('$$;',start)+3);}
async function fixture(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema realtime;
 create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
 create function auth.jwt() returns jsonb language sql stable as 'select coalesce(nullif(current_setting(''request.jwt.claims'',true),''''),''{}'')::jsonb';
 create table auth.users(id uuid primary key,created_at timestamptz default now());
 create table auth.sessions(id uuid primary key,user_id uuid);create table auth.mfa_factors(user_id uuid,status text,factor_type text);
 create table public.usuarios(id uuid primary key,nombre text,is_blocked boolean default false,bloqueado boolean default false,ban_until timestamptz);
 create table public.staff_accounts(user_id uuid primary key,role text,active boolean default true,permissions text[] default '{}');
 create table public.staff_sessions(session_id uuid primary key,user_id uuid,revoked_at timestamptz,expires_at timestamptz,last_seen_at timestamptz);
 create table public.staff_audit(actor_id uuid,action text,target_id uuid,reason text,changes jsonb);
 create table realtime.messages(extension text,topic text);alter table realtime.messages enable row level security;
 create function realtime.topic() returns text language sql stable as 'select current_setting(''test.topic'',true)';
 create table public.test_signals(payload jsonb,event text,topic text);
 create function realtime.send(payload jsonb,event text,topic text,private boolean) returns void language sql as 'insert into public.test_signals values(payload,event,topic)';
 create table public.activity_notifications(id text,type text,articulo_id uuid,chat_id uuid,buyer_id uuid,receipt_id uuid,recipient_id uuid,created_at timestamptz,title text,subtitle text,thumb text);
 create table public.staff_messages(id uuid,created_at timestamptz,audience text,audience_cutoff timestamptz);
 create table public.staff_message_recipients(message_id uuid,user_id uuid);
 create table public.staff_message_states(message_id uuid,user_id uuid,read_at timestamptz,hidden_at timestamptz);
 grant usage on schema public,auth,realtime to authenticated,anon,service_role;
 grant select,insert on realtime.messages to authenticated;
 `);
 await db.exec(definition(staffSql,'staff_permission'));
 await db.exec(definition(staffSql,'staff_require'));
 for(const n of [1,2,3,4]){
  await db.query('insert into auth.users(id) values($1)',[id(n)]);
  await db.query('insert into usuarios(id,nombre) values($1,$2)',[id(n),`Persona ${n}`]);
 }
 for(const [n,role]of [[3,'admin'],[4,'master']]){
  await db.query('insert into staff_accounts(user_id,role) values($1,$2)',[id(n),role]);
  await db.query("insert into auth.mfa_factors values($1,'verified','totp')",[id(n)]);
  await db.query('insert into auth.sessions values($1,$2)',[id(n+100),id(n)]);
  await db.query("insert into staff_sessions values($1,$2,null,now()+interval '1 hour',now())",[id(n+100),id(n)]);
 }
 await db.exec(sql);await db.exec(sql);await db.exec(hideSql);await db.exec(hideSql);await db.exec(limitSql);await db.exec(limitSql);
 const as=async(n,aal='aal1')=>{
  await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n?id(n):'']);
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({aal,session_id:id((n||0)+100)})]);
  await db.exec(n?'set role authenticated':'set role anon');
 };
 const rpc=async(name,args=[])=> (await db.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) result`,args)).rows[0].result;
 return {db,as,rpc};
}

test('private support threads enforce 24-hour starts, retries and participant/staff authorization',async()=>{
 const {db,as,rpc}=await fixture();try{
  await as(1);const thread=await rpc('support_start_thread',[id(10),'Mi consulta','Necesito ayuda con una publicación.']);
  assert.equal(await rpc('support_start_thread',[id(10),'Mi consulta','Necesito ayuda con una publicación.']),thread);
  await assert.rejects(rpc('support_start_thread',[id(11),'Otra consulta','Segunda consulta de prueba.']),/24 horas/);
  await assert.rejects(rpc('support_start_thread',[id(10),'Otro asunto','Otro mensaje de prueba.']),/ya utilizado/);
  await assert.rejects(db.query('select * from support_messages'),/permission denied/);
  await assert.rejects(rpc('support_write',[thread,id(20),'Ataque',true]),/permission denied/);
  await as(2);assert.equal((await rpc('support_inbox')).total,0);
  await assert.rejects(rpc('support_thread',[thread,false,null]),/no disponible/);
  await assert.rejects(rpc('support_reply',[thread,id(21),'Acceso ajeno',false]),/no disponible/);
  await assert.rejects(rpc('support_reply',[thread,id(21),'Simular admin',true]),/no autorizado/);
  await as(3);await assert.rejects(rpc('support_inbox',[true,'',1]),/no autorizado/);
  await as(3,'aal2');assert.equal((await rpc('support_inbox',[true,'',1])).total,1);
  assert.equal((await rpc('support_inbox',[true,'',1])).rows[0].unread,true);
  const answer=await rpc('support_reply',[thread,id(22),'Hola, te ayudamos desde administración.',true]);
  assert.equal(await rpc('support_reply',[thread,id(22),'Hola, te ayudamos desde administración.',true]),answer);
  await as(4,'aal2');assert.equal((await rpc('support_thread',[thread,true,null])).messages.length,2);
  assert.equal((await rpc('support_inbox',[true,'',1])).rows[0].unread,false);
  await rpc('support_reply',[thread,id(23),'También revisamos tu consulta desde dirección.',true]);
  await as(1);const notices=await db.query('select * from notification_activity_feed()');
  assert.equal(notices.rows[0].notification_activity_feed.receipt_kind,'support');
  assert.equal(notices.rows[0].notification_activity_feed.read,false);
  const snapshot=await rpc('support_thread',[thread,false,null]);
  assert.equal(snapshot.messages.length,3);
  assert.equal(snapshot.messages.at(-1).author_name,'Equipo MiBatute');
  assert.equal((await db.query('select * from notification_activity_feed()')).rows[0].notification_activity_feed.read,true);
  // A reply is allowed while the new-conversation cooldown is still active.
  await db.exec('reset role');await db.query("update support_threads set last_user_at=now()-interval '1 minute' where id=$1",[thread]);
  await as(1);await rpc('support_reply',[thread,id(24),'Gracias por la respuesta.',false]);
  await assert.rejects(rpc('support_reply',[thread,id(25),'Otro mensaje inmediato.',false]),/unos segundos/);
  await as(3,'aal2');assert.equal((await rpc('support_inbox',[true,'',1])).rows[0].unread,true,'each admin retains its own read cursor');
  await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from support_messages')).rows[0].n,4);
  const signals=(await db.query('select * from test_signals')).rows;
  assert.ok(signals.every(signal=>!JSON.stringify(signal.payload).includes('body')));
  assert.equal(signals.filter(signal=>signal.topic===`mb:inbox:user:${id(1)}`).length,2);
  assert.equal((await db.query("select count(*)::int n from staff_audit where action='support.reply'")).rows[0].n,2);
  await db.query("update support_threads set created_at=clock_timestamp()-interval '24 hours' where id=$1",[thread]);
  await as(1);await rpc('support_start_thread',[id(11),'Otra consulta','Una nueva consulta tras el plazo.']);
  await as(3,'aal2');await db.exec('reset role');await db.query('update staff_accounts set active=false where user_id=$1',[id(3)]);
  await as(3,'aal2');await assert.rejects(rpc('support_thread',[thread,true,null]),/no autorizado/);
  await as(null);await assert.rejects(rpc('support_inbox'),/permission denied/);
 }finally{await db.close();}
});

test('support pagination stays bounded, scoped and ordered; realtime rejects unauthorized reads and writes',async()=>{
 const {db,as,rpc}=await fixture();try{
  await db.query(`insert into support_threads(id,user_id,subject,created_at,updated_at)
    select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,$1,'Consulta '||n,
      now()-n*interval '1 day',now()-n*interval '1 day' from generate_series(200,224)n`,[id(1)]);
  await db.query(`insert into support_messages(request_id,thread_id,sender_id,author_role,body)
    select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,$1,$2,'user','Mensaje '||n from generate_series(300,384)n`,[id(200),id(1)]);
  await as(1);const first=await rpc('support_inbox',[false,'',1]),second=await rpc('support_inbox',[false,'',2]);
  assert.equal(first.total,25);assert.equal(first.rows.length,20);assert.equal(second.rows.length,5);
  assert.equal(new Set([...first.rows,...second.rows].map(row=>row.id)).size,25);
  const a=await rpc('support_thread',[id(200),false,null]);
  const b=await rpc('support_thread',[id(200),false,a.messages[0].seq]);
  const c=await rpc('support_thread',[id(200),false,b.messages[0].seq]);
  assert.deepEqual([a.messages.length,b.messages.length,c.messages.length],[40,40,5]);
  assert.equal(a.more,true);assert.equal(c.more,false);
  const seqs=[...c.messages,...b.messages,...a.messages].map(m=>m.seq);
  assert.equal(new Set(seqs).size,85);assert.deepEqual(seqs,[...seqs].sort((x,y)=>x-y));
  assert.equal((await rpc('support_inbox',[false,'Consulta 200',1])).total,1);
  await as(2);assert.equal((await rpc('support_inbox',[false,'Consulta',1])).total,0);
  await db.exec(`reset role;insert into realtime.messages values('broadcast','mb:support:staff');
    create policy legacy_broad_read on realtime.messages for select to authenticated using(true);
    create policy legacy_broad_write on realtime.messages for insert to authenticated with check(true);`);
  await db.query("select set_config('test.topic','mb:support:staff',false)");
  await as(1);assert.equal((await db.query('select * from realtime.messages')).rows.length,0);
  await as(3);assert.equal((await db.query('select * from realtime.messages')).rows.length,0);
  await as(3,'aal2');assert.equal((await db.query('select * from realtime.messages')).rows.length,1);
  await assert.rejects(db.query("insert into realtime.messages values('broadcast','mb:support:staff')"),/policy/);
  await db.exec('reset role');await db.query("update staff_sessions set revoked_at=now() where user_id=$1",[id(3)]);
  await as(3,'aal2');assert.equal((await db.query('select * from realtime.messages')).rows.length,0);
 }finally{await db.close();}
});

test('user deletion hides the thread and its notices but preserves complete staff history and the 24-hour cooldown',async()=>{
 const {db,as,rpc}=await fixture();try{
  await as(1);const thread=await rpc('support_start_thread',[id(600),'Consulta eliminable','Contenido privado de prueba.']);
  await as(3,'aal2');await rpc('support_reply',[thread,id(601),'Respuesta anterior a la eliminación.',true]);
  await as(2);await assert.rejects(rpc('support_hide_thread',[thread]),/no disponible/);
  await as(1);const before=await rpc('support_inbox');assert.equal(before.total,1);
  await rpc('support_hide_thread',[thread]);await rpc('support_hide_thread',[thread]);
  const after=await rpc('support_inbox');assert.equal(after.total,0);assert.equal(after.next_thread_at,before.next_thread_at);
  assert.equal((await db.query('select * from notification_activity_feed()')).rows.length,0);
  await assert.rejects(rpc('support_thread',[thread,false,null]),/no disponible/);
  await assert.rejects(rpc('support_reply',[thread,id(602),'Reapertura no permitida',false]),/no disponible/);
  await assert.rejects(rpc('support_start_thread',[id(603),'Nueva consulta','Otro mensaje de prueba.']),/24 horas/);
  for(const admin of [3,4]){
    await as(admin,'aal2');const inbox=await rpc('support_inbox',[true,'',1]);
    assert.equal(inbox.total,1);assert.ok(inbox.rows[0].user_hidden_at);
    const history=await rpc('support_thread',[thread,true,null]);assert.ok(history.user_hidden_at);
    assert.equal(history.messages.length,2);assert.equal(history.messages[0].body,'Contenido privado de prueba.');
    await assert.rejects(rpc('support_reply',[thread,id(604),'Respuesta a hilo eliminado',true]),/solo como historial/);
  }
  await as(null);await assert.rejects(rpc('support_hide_thread',[thread]),/permission denied/);
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int n from support_messages')).rows[0].n,2);
  const signals=(await db.query("select * from test_signals where event='support_removed'")).rows;
  assert.equal(signals.length,1,'Retries do not duplicate removal broadcasts');
  assert.equal(signals[0].topic,`mb:inbox:user:${id(1)}`);
  assert.deepEqual(signals[0].payload,{thread_id:thread});
 }finally{await db.close();}
});

test('support messages and replies are capped at 500 characters for users and both staff roles without truncating history',async()=>{
 const {db,as,rpc}=await fixture();try{
  await as(1);
  await assert.rejects(rpc('support_start_thread',[id(700),'Consulta extensa','a'.repeat(501)]),/500 caracteres/);
  const thread=await rpc('support_start_thread',[id(700),'Consulta breve','a'.repeat(500)]);
  assert.equal((await rpc('support_thread',[thread,false,null])).messages[0].body.length,500);
  await assert.rejects(rpc('support_reply',[thread,id(701),'b'.repeat(501),false]),/500 caracteres/);
  await db.exec('reset role');await db.query("update support_threads set last_user_at=now()-interval '1 minute' where id=$1",[thread]);
  await as(1);await rpc('support_reply',[thread,id(701),'b'.repeat(500),false]);
  for(const n of [3,4]){
    await as(n,'aal2');await assert.rejects(rpc('support_reply',[thread,id(710+n),'c'.repeat(501),true]),/500 caracteres/);
    await rpc('support_reply',[thread,id(710+n),'c'.repeat(500),true]);
  }
  // Simulate a pre-migration message to check safe upgrades of live data.
  await db.exec('reset role;alter table support_messages drop constraint support_messages_body_check;');
  await db.query("insert into support_messages(request_id,thread_id,sender_id,author_role,body) values($1,$2,$3,'user',$4)",[id(720),thread,id(1),'Histórico '.repeat(100)]);
  await db.exec(limitSql);
  await as(3,'aal2');const history=await rpc('support_thread',[thread,true,null]);
  assert.equal(history.messages.at(-1).body,'Histórico '.repeat(100));
  await db.exec('reset role');await assert.rejects(db.query("insert into support_messages(request_id,thread_id,sender_id,author_role,body) values($1,$2,$3,'user',$4)",[id(721),thread,id(1),'d'.repeat(501)]),/support_messages_body_check/);
 }finally{await db.close();}
});

test('staff close support with a server timestamp, replies reopen it and retention preview never deletes',async()=>{
 const {db,as,rpc}=await fixture();try{
  await db.exec(`create table public.articulos(id uuid primary key,status text,delivered_at timestamptz);
    create table public.chats(id uuid primary key,articulo_id uuid);
    create table public.data_rights_requests(id uuid primary key,status text,responded_at timestamptz);`);
  await db.exec(closureSql);await db.exec(closureSql);
  await as(1);const thread=await rpc('support_start_thread',[id(900),'Caso para cerrar','Mensaje de prueba para el cierre del soporte.']);
  const seq=(await rpc('support_thread',[thread,false,null])).last_message_seq;
  await assert.rejects(rpc('support_set_closed',[thread,true,seq]),/autorizado/);
  await assert.rejects(rpc('preview_retention',[20]),/autorizado/);
  await as(3);await assert.rejects(rpc('support_set_closed',[thread,true,seq]),/autorizado/);
  await as(3,'aal2');const first=await rpc('support_set_closed',[thread,true,seq]);assert.ok(first.closed_at);
  assert.deepEqual(await rpc('support_set_closed',[thread,true,seq]),first,'Retries preserve the first closure date');
  assert.equal((await rpc('support_inbox',[true,'',1])).rows[0].closed_at,first.closed_at);
  await as(1);assert.equal((await rpc('support_thread',[thread,false,null])).closed_at,first.closed_at);
  await db.exec('reset role');await db.query("update support_threads set last_user_at=now()-interval '1 minute' where id=$1",[thread]);
  await as(1);await rpc('support_reply',[thread,id(901),'Esta respuesta reabre el caso de soporte.',false]);
  assert.equal((await rpc('support_thread',[thread,false,null])).closed_at,null);
  await as(4,'aal2');await assert.rejects(rpc('support_set_closed',[thread,true,seq]),/mensajes nuevos/);
  const current=(await rpc('support_thread',[thread,true,null])).last_message_seq;
  await rpc('support_set_closed',[thread,true,current]);
  await rpc('support_reply',[thread,id(902),'Respuesta del superadmin que también reabre el caso.',true]);
  assert.equal((await rpc('support_thread',[thread,true,null])).closed_at,null);
  const finalSeq=(await rpc('support_thread',[thread,true,null])).last_message_seq;
  await rpc('support_set_closed',[thread,true,finalSeq]);
  await db.exec('reset role');
  await db.query("update support_threads set closed_at=clock_timestamp()-interval '181 days' where id=$1",[thread]);
  await db.query("insert into support_threads(id,user_id,subject) values($1,$2,'Abierto sin cierre')",[id(903),id(1)]);
  await db.query("insert into articulos values($1,'entregado',clock_timestamp()-interval '91 days'),($2,'entregado',null),($3,'reservado',clock_timestamp()-interval '91 days')",[id(910),id(911),id(912)]);
  await db.query('insert into chats values($1,$2),($3,$4),($5,$6)',[id(920),id(910),id(921),id(911),id(922),id(912)]);
  await db.query("insert into data_rights_requests values($1,'answered',clock_timestamp()-interval '25 months'),($2,'reviewing',clock_timestamp()-interval '25 months'),($3,'answered',null)",[id(930),id(931),id(932)]);
  await as(3,'aal2');const preview=await rpc('preview_retention',[10000]);
  assert.equal(preview.deletion_enabled,false);assert.equal(preview.requires_review,true);
  assert.deepEqual(preview.counts,{support:1,data_requests:1,chats:1});
  assert.deepEqual(preview.without_event,{support:1,data_requests:2,chats:2});
  assert.equal(preview.sample.length,3);assert.ok(preview.sample.every(row=>!Object.hasOwn(row,'body')));
  assert.equal((await rpc('preview_retention',[1])).sample.length,1);
  await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from support_messages')).rows[0].n,3);
  assert.equal((await db.query('select count(*)::int n from chats')).rows[0].n,3);
  assert.equal((await db.query('select count(*)::int n from data_rights_requests')).rows[0].n,3);
  const signals=(await db.query("select * from test_signals where event='support_thread_state'")).rows;assert.ok(signals.length>0);assert.ok(signals.every(row=>Object.keys(row.payload).join()==='thread_id'));
  await as(null);await assert.rejects(rpc('preview_retention',[20]),/permission denied/);
 }finally{await db.close();}
});
