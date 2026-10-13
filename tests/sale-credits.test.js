import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { transitionSale } from '../src/supabase/saleTransaction.js';

const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const seller=id(1),buyer=id(2),other=id(3);
test('sale purchase slots, paid consent and settlement',async t=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key,email_confirmed_at timestamptz default now());
      create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
      create table public.usuarios(id uuid primary key,bloqueado bool default false);
      create table public.articulos(id uuid primary key,owner_id uuid,mode text default 'venta',status text default 'disponible',estado text default 'disponible',buyer_id uuid,comprador_id uuid,reserved_at timestamptz,delivered_at timestamptz,updated_at timestamptz);
      create table public.chats(id uuid primary key default gen_random_uuid(),articulo_id uuid,buyer_id uuid,seller_id uuid,owner_id uuid,usuario_id uuid,status text,updated_at timestamptz,unique(articulo_id,buyer_id));
      create table public.chat_messages(id uuid,chat_id uuid,sender_id uuid,body text);
      create table public.chat_reads(chat_id uuid);
      create table public.postulaciones(articulo_id uuid);
      create table public.articulo_imagenes(articulo_id uuid);
      create table public.postulaciones_rechazadas(articulo_id uuid);
      create table public.postulacion_historial(articulo_id uuid);
      create table public.reports(articulo_id uuid);
      create table public.chat_reports(articulo_id uuid);
      create table public.cupos(usuario_id uuid primary key,saldo int,updated_at timestamptz);
      create table public.cupos_historial(usuario_id uuid,cantidad int,concepto text,referencia_id uuid);
      create function public.donation_application_status() returns jsonb language sql as 'select jsonb_build_object(''balance'',(select saldo from public.cupos where usuario_id=auth.uid()),''pending'',3,''heldCredits'',0)';
      alter table public.articulos enable row level security;
      create policy read_articles on public.articulos for select using(true);
      create policy owner_edit on public.articulos for update using(owner_id=auth.uid());
      grant usage on schema public,auth to authenticated;
      grant select,update,delete on public.articulos to authenticated;
      grant select,insert,update,delete on public.chats,public.chat_messages to authenticated;
      insert into auth.users(id) values('${seller}'),('${buyer}'),('${other}');
      insert into public.usuarios(id) select id from auth.users;
    `);
    const migration=name=>readFile(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),'utf8');
    for(const name of ['2026-09-30-sale-transactions','2026-10-01-sale-chat-approval','2026-10-01-sale-cancellation','2026-10-01-approved-sale-retention','2026-10-13-sale-credits']) await db.exec(await migration(name));
    const asUser=async uid=>{await db.exec('reset role; set role authenticated;');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);};
    const reset=async(balance=5)=>{
      await db.exec('reset role; truncate public.sale_purchase_credits,public.articulos,public.chats,public.cupos,public.cupos_historial; update auth.users set email_confirmed_at=now(); update public.usuarios set bloqueado=false;');
      await db.query('insert into public.cupos values($1,$2,null)',[buyer,balance]);
      for(let n=10;n<22;n++) await db.query('insert into public.articulos(id,owner_id) values($1,$2)',[id(n),seller]);
      await asUser(buyer);
    };
    const reserve=async(n,paid=false)=>(await db.query("select public.transition_sale_with_credit($1,'reserve',$2) as r",[id(n),paid])).rows[0].r;
    const change=async(n,action)=>(await db.query('select public.transition_sale($1,$2) as r',[id(n),action])).rows[0].r;
    const status=async()=>(await db.query('select public.sale_purchase_status() as r')).rows[0].r;
    const fillFree=async()=>{for(let n=10;n<15;n++) await reserve(n);};
    const fillAll=async()=>{await fillFree();for(let n=15;n<18;n++) await reserve(n,true);};
    await t.test('five free purchases with zero balance; extra consent and maximum eight',async()=>{
      await reset(0);await fillFree();assert.equal((await status()).active,5);
      assert.equal((await reserve(15)).code,'SALE_CREDIT_REQUIRED');
      assert.equal((await reserve(15,true)).code,'INSUFFICIENT_CREDITS');
      await db.exec('reset role');await db.query('update public.cupos set saldo=3 where usuario_id=$1',[buyer]);await asUser(buyer);
      for(let n=15;n<18;n++) await reserve(n,true);
      assert.equal((await status()).active,8);assert.equal((await status()).balance,0);
      assert.equal((await reserve(18,true)).code,'SALE_LIMIT_REACHED');
      assert.equal((await reserve(15,true)).article.id,id(15));assert.equal((await status()).balance,0);
    });
    await t.test('a delivered free purchase releases a free slot even with three paid active',async()=>{
      await reset();await fillAll();await asUser(seller);await change(10,'deliver');await asUser(buyer);
      assert.equal((await reserve(18,true)).cost,0);assert.equal((await status()).paidActive,3);assert.equal((await status()).balance,2);
      await asUser(seller);await change(15,'deliver');await asUser(buyer);
      assert.equal((await status()).paidActive,2);assert.equal((await status()).balance,2);
      assert.equal((await reserve(19)).code,'SALE_CREDIT_REQUIRED');await reserve(19,true);assert.equal((await status()).balance,1);
    });
    await t.test('only seller cancellation refunds and it refunds once',async()=>{
      await reset();await fillFree();await reserve(15,true);await asUser(seller);await change(15,'cancel');
      await assert.rejects(change(15,'cancel'),/reserva activa/);await asUser(buyer);
      assert.equal((await status()).balance,5);assert.equal((await status()).active,5);
      await reserve(15,true);assert.equal((await status()).balance,4);
      await change(15,'cancel');assert.equal((await status()).balance,4);
      assert.equal((await status()).paidActive,0);await reserve(15,true);assert.equal((await status()).balance,3);
    });
    await t.test('chat approval retains slot; delivery consumes credit; existing cancellation protection remains',async()=>{
      await reset();await fillFree();await reserve(15,true);await asUser(seller);await change(15,'approve_chat');
      await asUser(buyer);assert.equal((await status()).active,6);await assert.rejects(change(15,'cancel'),/aprobada/);
      await asUser(seller);await assert.rejects(change(15,'cancel'),/aprobada/);await change(15,'deliver');
      await asUser(buyer);assert.equal((await status()).balance,4);assert.equal((await status()).active,5);
    });
    await t.test('failed reservations rollback charges; base entry point and ledger cannot be forged',async()=>{
      await reset();await fillFree();await db.exec('reset role');await db.query('update auth.users set email_confirmed_at=null where id=$1',[buyer]);await asUser(buyer);
      await assert.rejects(reserve(15,true),/correo/);assert.equal((await status()).balance,5);assert.equal((await status()).active,5);
      await assert.rejects(db.query("select public.transition_sale_unmetered($1,'reserve')",[id(15)]),/permission/);
      await assert.rejects(db.query("select public.finish_sale_credit($1,$2,'seller_canceled')",[id(15),buyer]),/permission/);
      await asUser(seller);await assert.rejects(db.query("update public.articulos set buyer_id=$1,status='reservado',estado='reservado' where id=$2",[other,id(15)]),/transaccion de cupos/);
    });
    await t.test('purchases do not count donations; ledger is private and migration preserves active charges',async()=>{
      await reset();await fillFree();await reserve(15,true);
      const account=(await db.query('select public.account_credit_status() as r')).rows[0].r;
      assert.equal(account.donations.pending,3);assert.equal(account.purchases.active,6);
      await db.exec('reset role');await db.exec(await migration('2026-10-13-sale-credits'));await asUser(buyer);
      assert.equal((await status()).balance,4);assert.equal((await status()).heldCredits,1);
      await asUser(other);assert.equal((await db.query('select * from public.sale_purchase_credits')).rows.length,0);
    });
  } finally {await db.close();}
});

test('sale client uses explicit paid endpoint and preserves quota errors',async()=>{
  await assert.rejects(transitionSale({rpc:async()=>({data:{success:false,code:'SALE_CREDIT_REQUIRED',error:'Usa 1 credito',balance:1}})},'a','reserve'),{code:'SALE_CREDIT_REQUIRED'});
  const article={id:'a',status:'reservado',estado:'reservado',buyer_id:'b'};
  const chat={id:'c',articulo_id:'a',buyer_id:'b',status:'pending'};
  const result=await transitionSale({rpc:async(name,args)=>{
    assert.equal(name,'transition_sale_with_credit');assert.equal(args.p_use_credit,true);return{data:{article,chat,balance:2,cost:1}};
  }},'a','reserve',true);
  assert.equal(result.balance,2);
});
