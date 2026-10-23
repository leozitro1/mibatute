import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {deliverNotifications} from '../server/emailNotifications.js';
import handler from '../api/email-dispatch.js';
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;

test('email queue: opt-in, events, recipient privacy, duplicate prevention, caps and no backlog replay',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
   create schema auth;create function auth.uid() returns uuid language sql as $$select '${id(1)}'::uuid$$;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
   create table public.usuarios(id uuid,ban_until timestamptz);
   create table public.articulos(id uuid primary key,owner_id uuid,buyer_id uuid,title text,mode text,status text);
   create table public.postulaciones(id uuid primary key,articulo_id uuid,usuario_id uuid);
   create table public.chats(id uuid primary key,articulo_id uuid,status text);
   create table public.system_messages(id uuid primary key,title text,body text);
   create table public.system_message_receipts(id uuid primary key,message_id uuid,user_id uuid);
   create table public.cupos_historial(id uuid primary key default gen_random_uuid(),usuario_id uuid,cantidad integer,concepto text,referencia_id uuid);
   create table public.wompi_topups(id uuid primary key,usuario_id uuid,state text,environment text,credits integer,amount_in_cents integer,currency text,reference text);
   create table public.staff_audit(actor_id uuid,action text,reason text,changes jsonb);
   create function public.staff_require(text) returns void language sql as $$select null::void$$;
   insert into auth.users values('${id(1)}','seller@example.com',now()),('${id(2)}','buyer@example.com',now()),('${id(3)}','unconfirmed@example.com',null);
   insert into usuarios values('${id(1)}',now()+interval '3 days');`);
  const migration=await readFile(new URL('../supabase/migrations/2026-10-23-email-notifications.sql',import.meta.url),'utf8');
  await db.exec(migration);await db.exec(migration);
  const count=async()=>Number((await db.query('select count(*) n from email_outbox')).rows[0].n);
  const claim=async()=> (await db.query('select public.email_claim() result')).rows[0].result;
  await db.exec(`insert into articulos values('${id(10)}','${id(1)}','${id(2)}','Mesa','venta','disponible')`);
  assert.equal(await count(),0,'off by default');
  const events={published:true,request:true,sale:true,suspension:true,review:true,deleted:true,credits_purchase:true,credits_gift:true};
  await db.query('update email_controls set enabled=true,events=$1',[JSON.stringify(events)]);
  await db.exec(`insert into articulos values('${id(11)}','${id(1)}',null,'Silla','donacion','disponible');
   insert into postulaciones values('${id(20)}','${id(11)}','${id(2)}');
   insert into chats values('${id(30)}','${id(10)}','pending');
   update chats set status='pending';
   update articulos set status='entregado' where id='${id(10)}';
   update articulos set title=title;
   insert into system_messages values('${id(40)}','Suspension temporal de tu cuenta','Motivo privado'),('${id(41)}','Publicacion en revision','Detalle privado'),('${id(42)}','Publicacion eliminada','Detalle privado');
   insert into system_message_receipts values('${id(50)}','${id(40)}','${id(1)}'),('${id(51)}','${id(41)}','${id(1)}'),('${id(52)}','${id(42)}','${id(1)}');`);
  assert.equal(await count(),8);
  assert.equal((await db.query("select count(*) n from email_outbox where kind='sale'")).rows[0].n,2);
  assert.match((await db.query("select detail from email_outbox where kind='suspension'")).rows[0].detail,/hora de Colombia/);
  await db.query("select queue_market_email($1,'published','duplicate','test','test')",[id(1)]);
  await db.query("select queue_market_email($1,'published','duplicate','test','test')",[id(1)]);
  await db.query("select queue_market_email($1,'published','unconfirmed','test','test')",[id(3)]);
  assert.equal(await count(),9);
  await db.exec(`insert into cupos_historial(usuario_id,cantidad,concepto) values
   ('${id(1)}',2,'compensacion_administrativa'),('${id(1)}',1,'devolucion_reserva'),('${id(1)}',-1,'destacado');
   insert into wompi_topups values
    ('${id(60)}','${id(1)}','pending','prod',3,700000,'COP','MB-TEST'),
    ('${id(61)}','${id(1)}','pending','test',3,700000,'COP','MB-SANDBOX'),
    ('${id(62)}','${id(1)}','pending','prod',3,700000,'COP','MB-NO-CREDITS');
   insert into cupos_historial(usuario_id,cantidad,concepto,referencia_id) values
    ('${id(1)}',3,'recarga_wompi','${id(60)}'),('${id(1)}',3,'recarga_wompi','${id(61)}');
   update wompi_topups set state='approved';update wompi_topups set state='approved';`);
  assert.equal(await count(),11,'one gift and one paid-and-credited production top-up, no refunds/sandbox/pending/duplicates');
  const purchase=(await db.query("select detail from email_outbox where kind='credits_purchase'")).rows;
  assert.equal(purchase.length,1);assert.match(purchase[0].detail,/7000.00 COP/);assert.match(purchase[0].detail,/MB-TEST/);
  assert.equal((await db.query("select count(*) n from email_outbox where kind='credits_gift'")).rows[0].n,1);
  await db.exec('update email_controls set daily_limit=1');
  const item=await claim();assert.ok(['seller@example.com','buyer@example.com'].includes(item.to));assert.ok(!('user_id' in item));
  assert.equal(await claim(),null,'one active worker');
  await db.query("select email_finish($1,'sent','provider-id',null)",[item.id]);
  assert.equal(await claim(),null,'attempt budget enforced');
  await db.exec("update email_outbox set attempted_at=now()-interval '25 hours' where attempted_at is not null");
  const next=await claim();assert.ok(next);
  await db.exec("update email_outbox set attempted_at=now()-interval '3 minutes' where state='processing'");
  assert.equal(await claim(),null,'uncertain attempts still consume the budget');
  assert.equal((await db.query('select state from email_outbox where id=$1',[next.id])).rows[0].state,'uncertain');
  const version=(await db.query('select updated_at from email_controls')).rows[0].updated_at;
  await db.query('select staff_email_save(false,50,$1,$2)',[JSON.stringify(events),version]);
  assert.equal((await db.query("select count(*) n from email_outbox where state='pending'")).rows[0].n,0);
  await db.exec('update email_controls set enabled=true');assert.equal(await claim(),null,'reactivating does not replay');
  await db.exec("set role authenticated");
  await assert.rejects(db.query('select * from email_controls'),/permission/);
  await assert.rejects(db.query('select public.email_claim()'),/permission/);
 }finally{await db.close();}
});

function fakeClient(items){
 const finished=[];return {finished,rpc:async(name,args)=>name==='email_claim'?{data:items.shift()||null}:{error:null,...(finished.push(args),{})}};
}
const sample={id:id(100),to:'recipient@example.com',title:'Aviso',detail:'Solo información del destinatario.'};
test('sender uses a stable idempotency key and a fixed safe destination',async()=>{
 const client=fakeClient([sample]);let payload,headers;
 const result=await deliverNotifications({client,apiKey:'test-only',from:'MiBatute <noreply@example.com>',max:1,fetcher:async(url,options)=>{
  assert.equal(url,'https://api.resend.com/emails');payload=JSON.parse(options.body);headers=options.headers;
  return new Response(JSON.stringify({id:'provider-id'}),{status:200});
 }});
 assert.equal(result.sent,1);assert.deepEqual(payload.to,[sample.to]);assert.equal(headers['Idempotency-Key'],`mibatute-event/${sample.id}`);
 assert.match(payload.text,/https:\/\/www.mibatute.com/);assert.equal(client.finished[0].p_state,'sent');
});
test('quota failure and network ambiguity stop the batch without retries or leaking provider errors',async()=>{
 for(const mode of ['quota','network']){
  const client=fakeClient([sample,{...sample,id:id(101)}]);let calls=0;
  const result=await deliverNotifications({client,apiKey:'test-only',from:'test@example.com',fetcher:async()=>{calls++;if(mode==='network')throw new Error('secret');return new Response('{}',{status:429});}});
  assert.equal(calls,1);assert.equal(result.failed,1);assert.equal(client.finished[0].p_state,mode==='quota'?'failed':'uncertain');
 }
});
test('dispatch endpoint rejects unauthenticated callers before any provider call',async()=>{
 let body,status;const res={setHeader(){},end(value){body=JSON.parse(value);status=this.statusCode;}};
 await handler({method:'POST',headers:{}},res);assert.equal(status,401);assert.equal(body.error,'Acceso no autorizado.');
});

test('inactive scheduled dispatch exits successfully without provider or database work',async()=>{
 let status,body;const res={setHeader(){},end(value){status=this.statusCode;body=JSON.parse(value);}};
 await handler({method:'GET',headers:{}},res);assert.equal(status,200);assert.deepEqual(body,{configured:false,sent:0});
});
