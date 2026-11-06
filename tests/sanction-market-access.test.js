import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { transactionChatReadOnly } from '../src/components/chatAvailability.js';
import { accountMarketPaused, articleOwnerMarketPaused } from '../src/supabase/accountProfile.js';

const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const migration=name=>readFile(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),'utf8');
const owner=id(1), buyer=id(2), normal=id(3), staff=id(4);

test('temporary sanctions pause discovery and new requests while preserving existing read-only conversations',async t=>{
 const db=new PGlite({extensions:{unaccent}});
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema realtime;
   create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
   create table auth.users(id uuid primary key,email_confirmed_at timestamptz default now());
   create table public.usuarios(id uuid primary key,nombre text default 'Usuario',foto_url text default '',is_blocked boolean default false,bloqueado boolean default false,ban_until timestamptz);
   create view public.usuarios_publicos as select * from public.usuarios;
   create function public.staff_permission(text) returns boolean language sql stable as 'select auth.uid()=''${staff}''::uuid';
   create function public.account_is_verified(uuid) returns boolean language sql stable as 'select true';
   create function public.market_reuse_impact() returns jsonb language sql stable as 'select ''{}''::jsonb';
   create table public.test_signals(payload jsonb,event text,topic text);
   create function realtime.send(jsonb,text,text,boolean) returns void language sql as 'insert into public.test_signals values($1,$2,$3)';
   create table public.articulos(id uuid primary key,owner_id uuid,usuario_id uuid,mode text default 'donacion',
    estado text default 'disponible',status text default 'disponible',ganador_id uuid,winner_id uuid,recipient_id uuid,buyer_id uuid,comprador_id uuid,
    title text default 'Sillón',titulo text,description text default 'Madera',category text default 'Hogar',categoria text,subcategory text default 'Muebles',subcategoria text,
    city text default 'Bogotá',locality text default 'Suba',estado_producto integer default 8,price numeric,
    image_url text,imagen_url_principal text,imagenes jsonb,delivered_at timestamptz,reserved_at timestamptz,
    updated_at timestamptz default now(),created_at timestamptz default now(),is_featured boolean default false);
   create table public.postulaciones(id uuid primary key default gen_random_uuid(),articulo_id uuid references articulos,usuario_id uuid,justificacion text,created_at timestamptz default now(),unique(articulo_id,usuario_id));
   create table public.postulacion_historial(id uuid primary key default gen_random_uuid(),usuario_id uuid,articulo_id uuid,created_at timestamptz default now());
   create table public.postulaciones_rechazadas(id uuid primary key default gen_random_uuid(),usuario_id uuid,articulo_id uuid,created_at timestamptz default now(),unique(articulo_id,usuario_id));
   create table public.cupos(usuario_id uuid primary key,saldo integer default 5,updated_at timestamptz);
   create table public.cupos_historial(usuario_id uuid,cantidad integer,concepto text,referencia_id uuid);
   create table public.cupos_extra_donacion(id uuid,usuario_id uuid,created_at timestamptz);
   create table public.chats(id uuid primary key default gen_random_uuid(),articulo_id uuid,buyer_id uuid,seller_id uuid,owner_id uuid,usuario_id uuid,status text,created_at timestamptz default now(),updated_at timestamptz,last_message_at timestamptz,unique(articulo_id,buyer_id));
   create table public.chat_messages(id uuid primary key default gen_random_uuid(),chat_id uuid,sender_id uuid,body text,message text,created_at timestamptz default now());
   create table public.chat_reads(chat_id uuid,user_id uuid,last_read_at timestamptz);
   create table public.articulo_imagenes(id uuid,articulo_id uuid,url text,position integer);
   create table public.reports(articulo_id uuid);create table public.chat_reports(articulo_id uuid);
   grant usage on schema public,auth to anon,authenticated;
   grant select on articulos,usuarios_publicos to anon,authenticated;
   grant select,insert,update,delete on articulos,postulaciones,chats,chat_messages to authenticated;
   grant select on cupos,cupos_historial to authenticated;
   alter table articulos enable row level security;
   create policy article_read on articulos for select using(true);
   create policy article_update on articulos for update using(owner_id=auth.uid());
   alter table chat_messages enable row level security;
   create policy participant_messages on chat_messages for select using(exists(select 1 from chats c where c.id=chat_id and auth.uid() in(c.buyer_id,c.seller_id)));
   create policy own_message on chat_messages for insert with check(sender_id=auth.uid());
   create policy own_message_update on chat_messages for update using(sender_id=auth.uid()) with check(sender_id=auth.uid());
   insert into auth.users(id) values('${owner}'),('${buyer}'),('${normal}'),('${staff}');
   insert into usuarios(id) select id from auth.users;insert into cupos(usuario_id) select id from auth.users;`);
  for(const name of ['2026-10-01-home-pagination','2026-10-02-publication-expiry','2026-10-08-home-article-search',
   '2026-10-08-related-article-search','2026-10-09-condition-filter','2026-10-16-home-desktop-page-size',
   '2026-10-30-mobile-app-page-size','2026-11-04-home-verified-accounts','2026-11-04-mobile-uniform-grid','2026-11-05-catalog-query-budget',
   '2026-09-30-sale-transactions','2026-10-01-sale-chat-approval','2026-10-01-donation-decisions',
   '2026-10-13-donation-credits','2026-10-20-donation-daily-quota',
   '2026-10-27-profile-chat-history','2026-10-28-profile-chat-open-filter','2026-11-03-profile-chat-type-filter']) await db.exec(await migration(name));
  const activity=await migration('2026-10-08-activity-notifications');
  const contextStart=activity.indexOf('create or replace function public.notification_chat_context(');
  await db.exec(activity.slice(contextStart,activity.indexOf("grant execute on function public.notification_chat_context(uuid) to authenticated;",contextStart)+"grant execute on function public.notification_chat_context(uuid) to authenticated;".length));
  const staffSql=await migration('2026-10-14-staff-console');
  const guardStart=staffSql.indexOf('create or replace function public.guard_staff_suspension()');
  await db.exec(staffSql.slice(guardStart,staffSql.indexOf('$$;',guardStart)+3));
  await db.exec('create trigger guard_staff_suspension before insert or update on chat_messages for each row execute function public.guard_staff_suspension()');
  await db.exec(`insert into articulos(id,owner_id,is_featured) values('${id(10)}','${owner}',true);
   insert into articulos(id,owner_id,mode) values('${id(11)}','${owner}','venta');
   insert into articulos(id,owner_id,status,estado) values('${id(12)}','${owner}','pausado','pausado');
   insert into articulos(id,owner_id,mode,status,estado,buyer_id,comprador_id) values('${id(13)}','${owner}','venta','reservado','reservado','${buyer}','${buyer}');
   insert into articulos(id,owner_id,status,estado) values('${id(14)}','${owner}','entregado','entregado');
   insert into articulos(id,owner_id,created_at) values('${id(15)}','${owner}',now()-interval '61 days');
   insert into articulos(id,owner_id) values('${id(16)}','${normal}');
   insert into chats(id,articulo_id,buyer_id,seller_id,owner_id,status) values('${id(30)}','${id(13)}','${buyer}','${owner}','${owner}','pending');
   select set_config('request.jwt.claim.sub','${owner}',false);
   select transition_sale('${id(13)}','approve_chat');
   insert into chat_messages(chat_id,sender_id,body) values('${id(30)}','${owner}','Historial privado de prueba');
   select set_config('request.jwt.claim.sub','',false);`);
  const pauseSql=await migration('2026-11-06-sanction-publication-pause');
  const chatSql=await migration('2026-11-06-suspended-chat-readonly');
  await db.exec(pauseSql);await db.exec(pauseSql);await db.exec(chatSql);await db.exec(chatSql);
  const as=async(uid=null)=>{await db.exec(`reset role;set role ${uid?'authenticated':'anon'}`);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid||'']);};
  const admin=async()=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub','',false)");};
  const page=async(filters={})=>(await db.query('select home_article_page($1,1) r',[JSON.stringify({city:'Bogotá',onlyActive:false,...filters})])).rows[0].r;
  const before=(await db.query('select id,status,estado,buyer_id,created_at,updated_at,is_featured from articulos order by id')).rows;

  await t.test('suspension removes sales/donations from searches, featured and page totals for every viewer',async()=>{
   await as();assert.equal((await page()).total,4);
   await admin();await db.query("update usuarios set ban_until=now()+interval '1 day' where id=$1",[owner]);
   for(const viewer of [null,buyer,owner,staff]){
    await as(viewer);
    for(const filters of [{},{search:'sillon'},{layout:'mobile',mobileUniformGrid:true,mobilePageRows:10},{onlyVerified:true}]){
     const result=await page(filters);assert.equal(result.total,1);assert.deepEqual(result.ids,[id(16)]);assert.deepEqual(result.featuredIds,[]);
    }
   }
   await admin();assert.deepEqual((await db.query('select id,status,estado,buyer_id,created_at,updated_at,is_featured from articulos order by id')).rows,before);
   const signals=(await db.query('select * from test_signals')).rows;
   assert.equal(signals.length,2,'One signal for all categories and one for Hogar');
   assert.ok(signals.every(row=>row.payload.owner_state_changed&&row.event==='catalog_changed'));
  });

  await t.test('direct links stay private but owner, staff and current buyers retain their existing records',async()=>{
   await as();assert.equal((await db.query('select id from articulos where owner_id=$1',[owner])).rows.length,0);
   await as(buyer);assert.deepEqual((await db.query('select id from articulos where owner_id=$1',[owner])).rows.map(row=>row.id),[id(13)]);
   await as(owner);assert.equal((await db.query('select id from articulos where owner_id=$1',[owner])).rows.length,6);
   await as(staff);assert.equal((await db.query('select id from articulos where owner_id=$1',[owner])).rows.length,6);
  });

  await t.test('RPC and direct writes reject new applications, purchases and chats without charging credits',async()=>{
   await admin();await db.exec(`insert into donation_application_credits(id,usuario_id,articulo_id,cost,state) values
    ('${id(90)}','${buyer}','${id(16)}',0,'withdrawn'),('${id(91)}','${buyer}','${id(16)}',0,'withdrawn')`);
   await as(buyer);
   await assert.rejects(db.query('select apply_for_donation($1,$2,true)',[id(10),'Solicitud de prueba para mi hogar']),/pausada/);
   await assert.rejects(db.query('select transition_sale($1,$2)',[id(11),'reserve']),/pausada/);
   await assert.rejects(db.query('insert into postulaciones(articulo_id,usuario_id,justificacion) values($1,$2,$3)',[id(10),buyer,'Solicitud directa de prueba']),/pausada|permission denied/);
   await assert.rejects(db.query("insert into chats(articulo_id,buyer_id,seller_id,owner_id,status) values($1,$2,$3,$3,'pending')",[id(11),buyer,owner]));
   await admin();assert.equal((await db.query('select saldo from cupos where usuario_id=$1',[buyer])).rows[0].saldo,5);
   assert.equal((await db.query('select count(*) n from postulaciones')).rows[0].n,0);
   assert.equal((await db.query('select count(*) n from donation_application_credits')).rows[0].n,2);
   assert.equal((await db.query('select count(*) n from cupos_historial')).rows[0].n,0);
  });

  await t.test('suspended participants can list and read their chats but cannot send or edit messages',async()=>{
   await as(owner);
   for(const query of ['select profile_chat_history(1) r','select profile_chat_history(1,false) r',"select profile_chat_history(1,false,'all') r"])
    assert.equal((await db.query(query)).rows[0].r.rows.length,1);
   assert.equal((await db.query('select * from notification_chat_context($1)',[id(30)])).rows.length,1);
   assert.equal((await db.query('select body from chat_messages where chat_id=$1',[id(30)])).rows.length,1);
   await assert.rejects(db.query('insert into chat_messages(chat_id,sender_id,body) values($1,$2,$3)',[id(30),owner,'No debe enviarse']),/suspension/);
   await assert.rejects(db.query('update chat_messages set body=$1 where chat_id=$2',['No debe editarse',id(30)]),/suspension/);
   await as(normal);assert.deepEqual((await db.query("select profile_chat_history(1,false,'all') r")).rows[0].r.rows,[]);
   assert.equal((await db.query('select * from notification_chat_context($1)',[id(30)])).rows.length,0);
   assert.equal((await db.query('select body from chat_messages')).rows.length,0);
   await admin();await db.query('update usuarios set is_blocked=true where id=$1',[owner]);await as(owner);
   await assert.rejects(db.query("select profile_chat_history(1,false,'all')"),/cuenta/);
   assert.equal((await db.query('select * from notification_chat_context($1)',[id(30)])).rows.length,0);
   await admin();await db.query('update usuarios set is_blocked=false where id=$1',[owner]);
  });

  await t.test('expiry or removal restores only prior availability and never extends expiry or opens a closed chat',async()=>{
   await admin();await db.query("update usuarios set ban_until=now()-interval '1 second' where id=$1",[owner]);
   await as();assert.equal((await page()).total,4);
   await admin();assert.deepEqual((await db.query('select id,status,estado,buyer_id,created_at,updated_at,is_featured from articulos order by id')).rows,before);
   await as(owner);await db.query('select transition_sale($1,$2)',[id(13),'approve_chat']);
   await db.query('insert into chat_messages(chat_id,sender_id,body) values($1,$2,$3)',[id(30),owner,'Mensaje tras levantar sanción']);
   await admin();await db.query("update usuarios set ban_until=now()+interval '1 hour' where id=$1",[owner]);
   await as();assert.equal((await page()).total,1);
   await admin();await db.query('update usuarios set ban_until=null where id=$1',[owner]);await as();assert.equal((await page()).total,4);
   await as(buyer);assert.equal((await db.query('select apply_for_donation($1,$2,true) r',[id(10),'Solicitud después de levantar sanción'])).rows[0].r.success,true);
   assert.equal((await db.query('select transition_sale($1,$2) r',[id(11),'reserve'])).rows[0].r.article.status,'reservado');
  });
 }finally{await db.close();}
});

test('client availability follows the sanction deadline and writing returns only to active transaction chats',()=>{
 const now=Date.now(),profile={id:owner,ban_until:new Date(now+1000).toISOString()};
 assert.equal(accountMarketPaused(profile,now),true);
 assert.equal(articleOwnerMarketPaused({owner_id:owner},profile,now),true);
 assert.equal(articleOwnerMarketPaused({owner_id:owner,owner_public:profile},{id:buyer},now),true);
 assert.equal(accountMarketPaused(profile,now+1000),false);
 assert.equal(transactionChatReadOnly('reservado','open',{suspended:true}),true);
 assert.equal(transactionChatReadOnly('reservado','open'),false);
 for(const state of ['disponible','pausado','entregado','en_revision'])assert.equal(transactionChatReadOnly(state,'open'),true);
 for(const state of ['closed','pending',undefined])assert.equal(transactionChatReadOnly('reservado',state),true);
});
