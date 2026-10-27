import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('confirmed credited topups create one private inbox receipt; retries and deletion do not recreate it',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;
   create table wompi_topups(id uuid primary key,usuario_id uuid,state text,environment text,credits int,amount_in_cents int,currency text,reference text,credited_at timestamptz,created_at timestamptz default now());
   create table cupos_historial(usuario_id uuid,referencia_id uuid,concepto text,cantidad int);
   create table system_messages(id uuid primary key,title text,body text,created_at timestamptz);
   create table system_message_receipts(id uuid default gen_random_uuid(),message_id uuid,user_id uuid,created_at timestamptz);
   create table notifications(kind text);
   create function record_activity_notification() returns trigger language plpgsql as $$begin insert into public.notifications values('generic');return new;end$$;
   create function notice() returns trigger language plpgsql as $$begin insert into public.notifications values('receipt');return new;end$$;
   create trigger notice after insert on system_message_receipts for each row execute function notice();`);
  const migration=await readFile(new URL('../supabase/migrations/2026-10-27-wompi-inbox-receipts.sql',import.meta.url),'utf8');
  await db.exec(migration);
  const uid='11111111-1111-1111-1111-111111111111',id='22222222-2222-2222-2222-222222222222';
  await db.query("insert into wompi_topups(id,usuario_id,state,environment,credits,amount_in_cents,currency,reference) values($1,$2,'pending','prod',3,700000,'COP','MB-TEST')",[id,uid]);
  assert.equal((await db.query('select * from system_message_receipts')).rows.length,0);
  await db.query("insert into cupos_historial values($1,$2,'recarga_wompi',3)",[uid,id]);
  await db.exec("update wompi_topups set state='approved',credited_at=now();update wompi_topups set state=state;");
  let receipts=(await db.query('select * from system_message_receipts')).rows;
  assert.equal(receipts.length,1);assert.equal(receipts[0].user_id,uid);
  const body=(await db.query('select body from system_messages')).rows[0].body;
  assert.match(body,/7000.00 COP/);assert.match(body,/3 créditos/);assert.match(body,/MB-TEST/);
  assert.deepEqual((await db.query('select kind from notifications')).rows,[{kind:'receipt'}]);
  await db.exec(migration);assert.equal((await db.query('select * from system_message_receipts')).rows.length,1);
  await db.exec('delete from system_message_receipts');await db.exec(migration);
  assert.equal((await db.query('select * from system_message_receipts')).rows.length,0);
  await db.exec("update wompi_topups set id='33333333-3333-3333-3333-333333333333',state='pending',environment='test';update wompi_topups set state='approved'");
  assert.equal((await db.query('select * from system_messages')).rows.length,1,'no cloud sandbox receipt or uncredited receipt');
  await db.query("insert into cupos_historial values($1,'33333333-3333-3333-3333-333333333333','recarga_wompi',3)",[uid]);
  await db.exec("set app.settings.wompi_test_credits='on';update wompi_topups set state='pending';update wompi_topups set state='approved'");
  assert.match((await db.query("select body from system_messages where id='33333333-3333-3333-3333-333333333333'")).rows[0].body,/Prueba Sandbox, sin dinero real/);
  await db.exec('set role authenticated');await assert.rejects(db.query('select record_wompi_inbox($1)',[id]),/permission/);
 }finally{await db.close();}
});
