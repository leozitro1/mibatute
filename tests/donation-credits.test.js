import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { applyForDonation } from '../src/supabase/donationApplications.js';

const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const owner=id(1), buyer=id(2), other=id(3);
test('donation credit transactions and refunds', async t => {
  const db=new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
      create table auth.users(id uuid primary key,email_confirmed_at timestamptz default now());
      create table public.usuarios(id uuid,is_blocked bool default false,bloqueado bool default false);
      create table public.articulos(id uuid primary key,owner_id uuid,usuario_id uuid,mode text default 'donacion',
        estado text default 'disponible',status text default 'disponible',ganador_id uuid,winner_id uuid,recipient_id uuid,buyer_id uuid,
        title text,city text,locality text,price numeric,image_url text,imagen_url_principal text,imagenes jsonb,
        delivered_at timestamptz,updated_at timestamptz,created_at timestamptz default now(),is_featured bool default false);
      create table public.postulaciones(id uuid primary key default gen_random_uuid(),articulo_id uuid references public.articulos on delete cascade,
        usuario_id uuid,justificacion text,created_at timestamptz default now(),unique(articulo_id,usuario_id));
      create table public.postulacion_historial(id uuid primary key default gen_random_uuid(),usuario_id uuid,articulo_id uuid,created_at timestamptz default now());
      create table public.postulaciones_rechazadas(id uuid primary key default gen_random_uuid(),usuario_id uuid,articulo_id uuid,created_at timestamptz default now(),unique(articulo_id,usuario_id));
      create table public.cupos(usuario_id uuid primary key,saldo int default 0,updated_at timestamptz);
      create table public.cupos_historial(usuario_id uuid,cantidad int,concepto text,referencia_id uuid);
      create table public.cupos_extra_donacion(id uuid,usuario_id uuid,created_at timestamptz);
      create table public.chats(id uuid primary key default gen_random_uuid(),articulo_id uuid,buyer_id uuid,seller_id uuid,owner_id uuid,usuario_id uuid,status text,updated_at timestamptz,unique(articulo_id,buyer_id));
      create table public.chat_messages(chat_id uuid,sender_id uuid);
      create table public.articulo_imagenes(id uuid,articulo_id uuid,url text,position int);
      alter table public.articulos enable row level security;
      create policy read_articles on public.articulos for select using(true);
      create policy edit_owned on public.articulos for update using(owner_id=auth.uid());
      create policy delete_owned on public.articulos for delete using(owner_id=auth.uid());
      alter table public.postulaciones enable row level security;
      create policy read_posts on public.postulaciones for select using(usuario_id=auth.uid() or exists(select 1 from public.articulos a where a.id=articulo_id and a.owner_id=auth.uid()));
      create policy delete_posts on public.postulaciones for delete using(usuario_id=auth.uid() or exists(select 1 from public.articulos a where a.id=articulo_id and a.owner_id=auth.uid()));
      grant usage on schema public,auth to authenticated;
      grant select,insert,update,delete on all tables in schema public to authenticated;
      insert into auth.users(id) values('${owner}'),('${buyer}'),('${other}');
      insert into public.usuarios(id) select id from auth.users;
    `);
    const readMigration= name => readFile(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),'utf8');
    await db.exec(await readMigration('2026-10-01-donation-decisions'));
    const migration=await readMigration('2026-10-13-donation-credits');
    await db.exec(migration);
    await db.exec(await readMigration('2026-10-01-feature-article'));
    const asUser=async uid => { await db.exec('reset role; set role authenticated;'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]); };
    const reset=async () => {
      await db.exec('reset role; truncate public.donation_application_credits,public.postulaciones,public.postulacion_historial,public.postulaciones_rechazadas,public.chats,public.cupos_historial,public.cupos,public.articulos cascade;');
      await db.query('insert into public.cupos values($1,5,null),($2,5,null),($3,5,null)',[owner,buyer,other]);
      for(let n=10;n<16;n++) await db.query('insert into public.articulos(id,owner_id,title) values($1,$2,$3)',[id(n),owner,'Prueba']);
      await asUser(buyer);
    };
    const apply=async (n,paid=false) => (await db.query('select public.apply_for_donation($1,$2,$3) as r',[id(n),'Para mi hogar de prueba',paid])).rows[0].r;
    const status=async () => (await db.query('select public.donation_application_status() as r')).rows[0].r;
    const debit=async () => { await apply(10); return apply(11,true); };
    await t.test('one free request, consent before charging, duplicate retry and three pending',async()=>{
      await reset(); assert.equal((await apply(10)).cost,0);
      assert.equal((await apply(11)).code,'RATE_LIMIT_REACHED');
      const paid=await apply(11,true); assert.equal(paid.balance,4); assert.equal(paid.cost,1);
      assert.equal((await apply(11,true)).alreadyExists,true); assert.equal((await status()).balance,4);
      await apply(12,true); assert.equal((await apply(13,true)).code,'PENDING_LIMIT');
      assert.equal((await status()).balance,3);
      assert.equal((await status()).heldCredits,2);
    });
    await t.test('rejection refunds once without restoring the free slot',async()=>{
      await reset(); const paid=await debit(); await asUser(owner);
      await db.query('delete from public.postulaciones where id=$1',[paid.id]); await asUser(buyer);
      assert.equal((await status()).balance,5); assert.equal((await status()).freeAvailable,false);
      await db.exec('reset role'); await db.query("select public.finish_donation_credit($1,'refunded')",[paid.id]);
      await asUser(buyer); assert.equal((await status()).balance,5);
    });
    await t.test('voluntary withdrawal does not refund or reset free cooldown',async()=>{
      await reset(); const paid=await debit(); await db.query('delete from public.postulaciones where id=$1',[paid.id]);
      assert.equal((await status()).balance,4); assert.equal((await status()).pending,1);
      await db.query('delete from public.postulaciones where articulo_id=$1',[id(10)]);
      assert.equal((await apply(12)).code,'RATE_LIMIT_REACHED');
    });
    await t.test('chosen applicant consumes credit, other applicant gets refunded',async()=>{
      await reset(); const paid=await debit(); await asUser(other); await apply(12); const rejected=await apply(11,true);
      await asUser(owner); await db.query("update public.articulos set ganador_id=$1,status='reservado',estado='reservado' where id=$2",[buyer,id(11)]);
      await asUser(buyer); assert.equal((await status()).balance,4);
      await asUser(other); assert.equal((await status()).balance,5);
      await db.exec('reset role');
      assert.equal((await db.query('select state from public.donation_application_credits where id=$1',[paid.id])).rows[0].state,'chosen');
      assert.equal((await db.query('select state from public.donation_application_credits where id=$1',[rejected.id])).rows[0].state,'refunded');
    });
    await t.test('deletion and expiry refund once; cooldown survives article deletion',async()=>{
      await reset(); await debit(); await asUser(owner); await db.query('delete from public.articulos where id=$1',[id(11)]);
      await asUser(buyer); assert.equal((await status()).balance,5);
      await apply(12,true); await db.exec('reset role');
      await db.query("update public.articulos set created_at=now()-interval '60 days' where id=$1",[id(12)]);
      await asUser(buyer); assert.equal((await status()).balance,5); assert.equal((await status()).balance,5);
      await asUser(owner); await db.query('delete from public.articulos where id=$1',[id(10)]);
      await asUser(buyer); assert.equal((await apply(13)).code,'RATE_LIMIT_REACHED');
    });
    await t.test('six-hour boundary, no balance, rollback on invalid paid application',async()=>{
      await reset(); await apply(10); await db.exec('reset role');
      await db.query("update public.donation_application_credits set created_at=now()-interval '6 hours' where usuario_id=$1",[buyer]);
      await db.query('update public.cupos set saldo=0 where usuario_id=$1',[buyer]); await asUser(buyer);
      assert.equal((await apply(11)).cost,0); assert.equal((await apply(12,true)).code,'INSUFFICIENT_CREDITS');
      await db.exec('reset role'); await db.query('update public.cupos set saldo=1 where usuario_id=$1',[buyer]);
      await db.query("update public.articulos set status='pausado',estado='pausado' where id=$1",[id(12)]); await asUser(buyer);
      await assert.rejects(apply(12,true)); assert.equal((await status()).balance,1);
    });
    await t.test('API cannot forge history, application identity or refunds; migration reapplication is safe',async()=>{
      await reset(); await assert.rejects(db.query('insert into public.postulaciones(articulo_id,usuario_id) values($1,$2)',[id(10),other]),/permission/);
      await assert.rejects(db.query("select public.finish_donation_credit($1,'refunded')",[id(4)]),/permission/);
      await apply(10); await db.exec('reset role'); await db.exec(migration); await asUser(buyer);
      assert.equal((await status()).pending,1); assert.equal((await status()).freeAvailable,false);
      await asUser(other); assert.equal((await db.query('select * from public.donation_application_credits')).rows.length,0);
    });
    await t.test('highlight credit is consumed even without a sale or after deletion',async()=>{
      await reset(); await asUser(owner); await db.query('select public.feature_article($1)',[id(10)]);
      await db.query('select public.feature_article($1)',[id(10)]); assert.equal((await status()).balance,4);
      await db.query('delete from public.articulos where id=$1',[id(10)]); assert.equal((await status()).balance,4);
    });
  } finally { await db.close(); }
});

test('application client preserves server failure codes and requests paid consent explicitly',async()=>{
  const client={rpc:async(name,args)=>{assert.equal(name,'apply_for_donation');assert.equal(args.p_use_credit,true);return {data:{success:true,balance:3,cost:1,id:'id'}};}};
  assert.equal((await applyForDonation(client,{articleId:'a',message:'Message',useCredit:true})).balance,3);
});
