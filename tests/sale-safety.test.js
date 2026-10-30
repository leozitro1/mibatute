import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { saleSafetyAction, saleSafetyStatus } from '../src/supabase/saleSafety.js';
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const seller=id(1),buyer=id(2),other=id(3),admin=id(4);

test('sale safety: cancellation, declarations, review and credit conservation',async t=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon; create role authenticated; create schema auth;
   create table auth.users(id uuid primary key,email_confirmed_at timestamptz default now());
   create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
   create table public.usuarios(id uuid primary key,nombre text default 'Prueba',bloqueado bool default false);
   create table public.articulos(id uuid primary key,title text default 'Artículo',owner_id uuid,mode text default 'venta',status text default 'disponible',estado text default 'disponible',buyer_id uuid,comprador_id uuid,reserved_at timestamptz,delivered_at timestamptz,updated_at timestamptz);
   create table public.chats(id uuid primary key default gen_random_uuid(),articulo_id uuid,buyer_id uuid,seller_id uuid,owner_id uuid,usuario_id uuid,status text,updated_at timestamptz,unique(articulo_id,buyer_id));
   create table public.chat_messages(id uuid default gen_random_uuid(),chat_id uuid,sender_id uuid,body text,created_at timestamptz default now());
   create table public.chat_reads(chat_id uuid);
   create table public.postulaciones(articulo_id uuid);
   create table public.articulo_imagenes(articulo_id uuid);
   create table public.postulaciones_rechazadas(articulo_id uuid);
   create table public.postulacion_historial(articulo_id uuid);
   create table public.reports(id uuid default gen_random_uuid(),articulo_id uuid,reporter_user_id uuid,reported_user_id uuid,owner_id uuid,reason text,details text,status text,created_at timestamptz default now());
   create table public.chat_reports(id uuid primary key default gen_random_uuid(),chat_id uuid,articulo_id uuid,reporter_id uuid,reported_user_id uuid,reason text,details text,messages_snapshot jsonb,status text,created_at timestamptz default now(),resolution text,handled_at timestamptz,handled_by_user_id uuid);
   create function public.send_market_signal(uuid,jsonb) returns void language sql as $$select null::void$$;
   create table public.staff_audit(actor_id uuid,action text,target_id uuid,reason text,changes jsonb);
   create function public.staff_permission(text) returns bool language sql as $$select auth.uid()='${admin}'::uuid$$;
   create function public.staff_require(text) returns void language plpgsql as $$ begin
    if not public.staff_permission($1) or current_setting('test.mfa',true) is distinct from 'yes' then raise exception 'MFA y permiso requeridos' using errcode='42501'; end if; end $$;
   create table public.cupos(usuario_id uuid primary key,saldo int,updated_at timestamptz);
   create table public.cupos_historial(usuario_id uuid,cantidad int,concepto text,referencia_id uuid);
   create function public.donation_application_status() returns jsonb language sql as 'select ''{}''::jsonb';
   alter table public.articulos enable row level security;
   alter table public.chat_reports enable row level security;
   create policy read_articles on public.articulos for select using(true);
   create policy owner_edit on public.articulos for update using(owner_id=auth.uid());
   create policy staff_report_update on public.chat_reports for update using(public.staff_permission('reports'));
   create policy owner_delete on public.articulos for delete using(owner_id=auth.uid());
   grant usage on schema public,auth to authenticated;
   grant select,update,delete on public.articulos to authenticated;
   grant select,insert,update,delete on public.chats,public.chat_messages,public.chat_reports to authenticated;
   insert into auth.users(id) values('${seller}'),('${buyer}'),('${other}'),('${admin}');
   insert into public.usuarios(id) select id from auth.users;
  `);
  const migration=name=>readFile(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),'utf8');
  for(const name of ['2026-09-30-sale-transactions','2026-10-01-sale-chat-approval','2026-10-01-sale-cancellation','2026-10-01-approved-sale-retention','2026-10-13-sale-credits','2026-10-14-report-submission','2026-10-30-sale-safety'])await db.exec(await migration(name));
  const asUser=async uid=>{await db.exec('reset role; set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);};
  const change=async(n,action,paid=false)=>(await db.query('select public.transition_sale_with_credit($1,$2,$3) r',[id(n),action,paid])).rows[0].r;
  const status=async(n,chat=null)=>(await db.query('select public.sale_safety_status($1,$2) r',[id(n),chat])).rows[0].r;
  const act=async(state,action,reason='Motivo de prueba suficiente')=>(await db.query('select public.sale_safety_action($1,$2,$3,$4) r',[state.chat,state.reservation,action,reason])).rows[0].r;
  const resolve=async(caseId,action='resume')=>(await db.query('select public.staff_resolve_sale_dispute($1,$2,$3) r',[caseId,action,'Revisión manual realizada con ambas partes.'])).rows[0].r;
  const reset=async()=>{
   await db.exec('reset role; truncate public.sale_change_permits,public.sale_dispute_holds,public.sale_buyer_blocks,public.sale_disputes,public.sale_reservations,public.sale_purchase_credits,public.articulos,public.chats,public.chat_messages,public.cupos,public.cupos_historial,public.reports,public.chat_reports,public.staff_audit;');
   await db.query('insert into public.cupos values($1,5,null),($2,5,null)',[buyer,other]);
   for(let n=10;n<20;n++)await db.query('insert into public.articulos(id,owner_id) values($1,$2)',[id(n),seller]);
   await asUser(buyer);
  };
  const caseFor=async state=>{await db.exec('reset role');const row=(await db.query('select * from public.sale_disputes where reservation_id=$1',[state.reservation])).rows[0];await asUser(admin);await db.exec("set test.mfa='yes'");return row;};
  await t.test('seller can cancel approved sale only with reason; same buyer blocked and others eligible',async()=>{
   await reset();await change(10,'reserve');const state=await status(10);await asUser(seller);await change(10,'approve_chat');
   await assert.rejects(change(10,'cancel'),/gestión/);
   await assert.rejects(act(state,'cancel','corto'),/8 y 500/);
   await assert.rejects(db.query("update public.articulos set status='disponible',estado='disponible',buyer_id=null where id=$1",[id(10)]),/gestión/);
   const canceled=await act(state,'cancel');assert.equal(canceled.article.status,'disponible');assert.equal(canceled.state.blocked,true);
   await assert.rejects(act(state,'cancel'),/terminó/);
   await asUser(buyer);await assert.rejects(change(10,'reserve'),/canceló tu reserva/);
   await asUser(other);assert.equal((await change(10,'reserve')).article.buyer_id,other);
  });
  await t.test('buyer withdrawal does not block buyer; stale round cannot cancel a newer round',async()=>{
   await reset();await change(10,'reserve');const state=await status(10);await act(state,'cancel');await change(10,'reserve');
   const fresh=await status(10);assert.notEqual(fresh.reservation,state.reservation);assert.equal(fresh.blocked,false);
   await assert.rejects(act(state,'cancel'),/terminó/);assert.equal((await status(10)).active,true);
   await asUser(other);await assert.rejects(act(fresh,'cancel'),/ajena/);
  });
  await t.test('payment declaration is buyer-only, cancellation opens one case and pauses without settling credits',async()=>{
   await reset();for(let n=10;n<16;n++)await change(n,'reserve',true);const state=await status(15);
   await assert.rejects(act(state,'declare_payment'),/aprobada/);await asUser(seller);await change(15,'approve_chat');
   await assert.rejects(act(state,'declare_payment'),/comprador/);await asUser(buyer);await act(state,'declare_payment');await asUser(seller);
   const result=await act(state,'cancel');assert.equal(result.article.status,'en_revision');assert.equal(result.state.caseStatus,'open');
   await act(state,'cancel');await asUser(buyer);
   const slots=(await db.query('select public.sale_purchase_status() r')).rows[0].r;assert.equal(slots.active,6);assert.equal(slots.heldCredits,1);assert.equal(slots.balance,4);
   await asUser(seller);await assert.rejects(change(15,'deliver'),/reservada|revisión/);await assert.rejects(db.query("update public.chats set status='closed' where id=$1",[state.chat]),/gestión/);
   const dispute=await caseFor(state);const detail=(await db.query("select public.staff_report_detail($1,'chat') r",[dispute.report_id])).rows[0].r;
   assert.equal(detail.sale_dispute.paymentDeclaredAt!=null,true);assert.equal(detail.sale_dispute.canCancel,true);
   await assert.rejects(db.query("update public.chat_reports set status='resolved' where id=$1",[dispute.report_id]),/acciones/);
   await resolve(dispute.id);await resolve(dispute.id);await asUser(buyer);assert.equal((await status(15)).active,true);
   const restored=(await db.query('select public.sale_purchase_status() r')).rows[0].r;assert.equal(restored.heldCredits,1);assert.equal(restored.balance,4);
  });
  await t.test('payment can be reported after cancellation; old buyer cannot cancel a new buyer reservation',async()=>{
   await reset();await change(10,'reserve');const state=await status(10);await asUser(seller);await act(state,'cancel');await asUser(other);await change(10,'reserve');
   await asUser(buyer);const result=await act(state,'payment_problem');assert.equal(result.state.paused,true);
   const dispute=await caseFor(state);await assert.rejects(resolve(dispute.id,'cancel_reservation'),/otro comprador/);await resolve(dispute.id);
   await asUser(other);assert.equal((await status(10)).active,true);
  });
  await t.test('manual cancellation review can remove the buyer block; generic users cannot resolve it',async()=>{
   await reset();await change(10,'reserve');const state=await status(10);await asUser(seller);await act(state,'cancel');await asUser(buyer);await act(state,'review_cancellation');
   const dispute=await caseFor(state);await asUser(seller);await assert.rejects(resolve(dispute.id),/permiso/);
   await asUser(admin);await db.exec("set test.mfa='no'");await assert.rejects(resolve(dispute.id),/MFA/);await db.exec("set test.mfa='yes'");
   await resolve(dispute.id,'restore_buyer');await asUser(buyer);assert.equal((await status(10)).blocked,false);await change(10,'reserve');
  });
  await t.test('upgrading cancellation review to payment preserves one case and pauses; admin can cancel and refund only reserved credit once',async()=>{
   await reset();for(let n=10;n<16;n++)await change(n,'reserve',true);const state=await status(15);await asUser(seller);await change(15,'approve_chat');await asUser(buyer);await act(state,'declare_payment');await asUser(seller);await act(state,'cancel');
   const dispute=await caseFor(state);await resolve(dispute.id,'cancel_reservation');await resolve(dispute.id,'cancel_reservation');await asUser(buyer);
   const slots=(await db.query('select public.sale_purchase_status() r')).rows[0].r;assert.equal(slots.balance,5);assert.equal(slots.active,5);
   await reset();await change(10,'reserve');const previous=await status(10);await asUser(seller);await act(previous,'cancel');await asUser(buyer);await act(previous,'review_cancellation');await act(previous,'payment_problem');
   assert.equal((await status(10)).caseKind,'payment');assert.equal((await status(10)).paused,true);
  });
  await t.test('later cancellation opens a new case without overwriting a resolved decision',async()=>{
   await reset();await change(10,'reserve');const state=await status(10);await asUser(seller);await change(10,'approve_chat');await asUser(buyer);await act(state,'declare_payment');await asUser(seller);await act(state,'cancel');
   const previous=await caseFor(state);await resolve(previous.id);await asUser(seller);await act(state,'cancel');
   assert.equal((await status(10)).caseStatus,'open');
   await db.exec('reset role');const cases=(await db.query('select status,resolution from public.sale_disputes where reservation_id=$1 order by created_at',[state.reservation])).rows;
   assert.equal(cases.length,2);assert.equal(cases[0].status,'resolved');assert.ok(cases[0].resolution);assert.equal(cases[1].status,'open');
   await reset();await change(10,'reserve');const late=await status(10);await asUser(seller);await act(late,'cancel');await asUser(buyer);await act(late,'review_cancellation');const reviewed=await caseFor(late);await resolve(reviewed.id);await asUser(buyer);await act(late,'payment_problem');assert.equal((await status(10)).paused,true);
  });
  await t.test('recent cancellation and open cases preserve chat and article; private permits/history cannot be forged',async()=>{
   await reset();await change(10,'reserve');const state=await status(10);await asUser(seller);await act(state,'cancel');
   await assert.rejects(db.query('delete from public.articulos where id=$1',[id(10)]),/siete días/);
   await assert.rejects(db.query('delete from public.chats where id=$1',[state.chat]),/siete días/);
   for(const table of ['sale_change_permits','sale_reservations','sale_buyer_blocks','sale_disputes','sale_dispute_holds'])await assert.rejects(db.query(`select * from public.${table}`),/permission/);
   await asUser(other);await assert.rejects(status(10,state.chat),/reserva/);
  });
 }finally{await db.close();}
});

test('sale safety client validates reason and pins actions to the viewed reservation',async()=>{
 const state={chat:'chat',reservation:'round'};
 await assert.rejects(saleSafetyAction({},state,'cancel','corto'),/8 a 500/);
 await assert.rejects(saleSafetyAction({},null,'cancel','Un motivo correcto'),/Actualiza/);
 const client={rpc:async(name,args)=>{assert.equal(name,'sale_safety_action');assert.equal(args.p_reservation,'round');return {data:{state,notice:'Confirmado'}};}};
 assert.equal((await saleSafetyAction(client,state,'cancel','Un motivo correcto')).notice,'Confirmado');
 await assert.rejects(saleSafetyStatus({rpc:async()=>({data:{}})},'article'),/comprobar/);
});
