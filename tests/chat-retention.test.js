import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {chatRetentionNotice} from '../src/components/chatRetention.js';
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const migration=name=>readFile(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),'utf8');

test('chat expiration shows the server deadline in Colombian time and distinguishes holds and disabled cleanup',()=>{
 const now=Date.parse('2026-11-04T10:00:00Z');
 const status={delete_after:'2026-12-04T10:00:00Z',cleanup_enabled:true,held:false};
 assert.equal(chatRetentionNotice(status,now).text,'Se elimina el 04 Dic 2026');
 assert.equal(chatRetentionNotice({...status,delete_after:new Date(now+1).toISOString()},now).text,'Se elimina el 04 Nov 2026');
 assert.equal(chatRetentionNotice(status,now+30*86400000).text,'Se elimina el 04 Dic 2026');
 assert.match(chatRetentionNotice(status,now+30*86400000).detail,/plazo venció/);
 assert.equal(chatRetentionNotice({...status,delete_after:'2026-12-04T02:00:00Z'},now).text,'Se elimina el 03 Dic 2026');
 assert.match(chatRetentionNotice({...status,held:true},now).text,/aplazada/);
 assert.match(chatRetentionNotice({...status,cleanup_enabled:false},now).text,/pendiente de activación/);
 assert.equal(chatRetentionNotice({},now),null);assert.equal(chatRetentionNotice({delete_after:'invalid'},now),null);
});

test('thirty-day chat retention protects active conversations, enforces privacy and purges only expired closed chats',async t=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
   create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
   grant usage on schema public,auth to anon,authenticated,service_role;
   create table usuarios(id uuid primary key,nombre text,foto_url text,is_blocked boolean default false,bloqueado boolean default false,ban_until timestamptz);
   create view usuarios_publicos as select id,nombre,foto_url from usuarios;
   create table articulos(id uuid primary key,title text,mode text,status text,estado text,image_url text,imagen_url_principal text,delivered_at timestamptz,updated_at timestamptz default now());
   create table chats(id uuid primary key,articulo_id uuid references articulos(id),buyer_id uuid,seller_id uuid,status text,created_at timestamptz default now(),canceled_at timestamptz,updated_at timestamptz default now());
   create table chat_messages(id uuid primary key,chat_id uuid references chats(id) on delete cascade,body text);
   create table chat_reads(chat_id uuid references chats(id) on delete cascade);
   create table chat_pickups(chat_id uuid references chats(id) on delete cascade,lugar text);
   create table chat_reports(id uuid primary key,chat_id uuid references chats(id) on delete cascade,status text,messages_snapshot jsonb);
   create table sale_reservations(id uuid primary key,chat_id uuid,ended_at timestamptz);
   create table sale_disputes(id uuid primary key,reservation_id uuid references sale_reservations(id),status text);
   create table activity_notifications(chat_id uuid,title text);
   create table staff_audit(actor_id uuid,action text,reason text,changes jsonb);
   create table support_threads(id uuid,closed_at timestamptz);
   create table data_rights_requests(id uuid,status text,responded_at timestamptz);
   create function staff_require(text) returns void language plpgsql as $$begin
    if auth.uid() is distinct from '${id(3)}'::uuid then raise exception 'Acceso no autorizado';end if;end$$;
   insert into usuarios(id,nombre) values('${id(1)}','Vendedor'),('${id(2)}','Comprador'),('${id(3)}','Equipo');
   insert into articulos(id,title,mode,status,estado) values
    ('${id(10)}','Artículo','venta','disponible','disponible'),
    ('${id(11)}','Entregado','venta','entregado','entregado'),
    ('${id(12)}','Revisión','donacion','en_revision','en_revision');
   insert into chats(id,articulo_id,buyer_id,seller_id,status,created_at) values
    ('${id(20)}','${id(10)}','${id(2)}','${id(1)}','open',now()),
    ('${id(21)}','${id(10)}','${id(2)}','${id(1)}','closed',now()-interval '400 days'),
    ('${id(22)}','${id(10)}','${id(2)}','${id(1)}','pending',now()),
    ('${id(23)}','${id(11)}','${id(2)}','${id(1)}','closed',now()),
    ('${id(24)}','${id(12)}','${id(2)}','${id(1)}','open',now());
   update chats set canceled_at=now()-interval '10 days' where id='${id(21)}';
   update articulos set delivered_at=now()-interval '5 days' where id='${id(11)}';`);
  await db.exec(await migration('2026-11-03-profile-chat-type-filter'));
  const sql=await migration('2026-11-04-chat-retention');await db.exec(sql);await db.exec(sql);
  await db.exec(await migration('2026-11-04-chat-retention-preview'));
  const asUser=async(n,role='authenticated')=>{
   await db.exec(`reset role;set role ${role}`);
   await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n?id(n):'']);
  };
  const clock=async n=>(await db.query('select * from chat_retention where chat_id=$1',[id(n)])).rows[0];
  const status=async n=>(await db.query('select chat_retention_status($1) r',[id(n)])).rows[0].r;
  const purge=async(limit=100)=>(await db.query('select purge_expired_chats($1) r',[limit])).rows[0].r;
  const exists=async n=>(await db.query('select exists(select 1 from chats where id=$1) b',[id(n)])).rows[0].b;
  const expire=async n=>db.query("update chat_retention set started_at=now()-interval '31 days',delete_after=now()-interval '1 day' where chat_id=$1",[id(n)]);
  await t.test('historical clocks start at actual cancellation or delivery, pending/review/open are excluded',async()=>{
   assert.equal((await db.query('select count(*)::int n from chat_retention')).rows[0].n,2);
   assert.equal(await clock(20),undefined);assert.equal(await clock(22),undefined);assert.equal(await clock(24),undefined);
   const old=await clock(21);assert.ok(Math.abs(Date.now()-Date.parse(old.started_at)-10*86400000)<15000);
   assert.ok(Math.abs(Date.now()-Date.parse((await clock(23)).started_at)-5*86400000)<15000);
   await db.exec(await migration('2026-11-04-chat-retention-closure-dates'));
   assert.equal((await clock(21)).started_at.toISOString(),old.started_at.toISOString());
   assert.equal(Date.parse(old.delete_after)-Date.parse(old.started_at),30*86400000);
   const unchanged=await clock(21);await db.exec(sql);assert.equal((await clock(21)).delete_after.toISOString(),unchanged.delete_after.toISOString());
   assert.deepEqual(await purge(),{enabled:false,deleted:0});
  });
  await t.test('participants see only their deadline; clients cannot forge clocks, enable cleanup or invoke purge',async()=>{
   await asUser(2);assert.ok((await status(21)).delete_after);assert.equal((await status(20)).delete_after,null);
   const history=(await db.query("select profile_chat_history(1,false,'all') r")).rows[0].r;
   assert.equal(history.rows.filter(row=>row.deletion_after).length,2);
   for(const query of ['select * from chat_retention',"update chat_retention_settings set enabled=true",'select purge_expired_chats(100)',"delete from chat_retention"])await assert.rejects(db.exec(query),/permission denied/);
   await asUser(3);await assert.rejects(status(21),/ajeno/);
   await asUser(null,'anon');await assert.rejects(status(21),/permission denied/);
   await asUser(null,'service_role');assert.deepEqual(await purge(),{enabled:false,deleted:0});
   await db.exec('reset role');
  });
  await t.test('reopening clears the clock, closing starts a fresh clock, unrelated changes never reset it',async()=>{
   const previous=await clock(21);
   await db.query("update chats set status='open' where id=$1",[id(21)]);assert.equal(await clock(21),undefined);
   await db.query("update chats set status='closed' where id=$1",[id(21)]);assert.ok(Date.parse((await clock(21)).started_at)>=Date.parse(previous.started_at));
   const reset=await clock(21);
   await db.query("update chats set retention_closed_at=now()-interval '400 days',updated_at=now()+interval '1 day' where id=$1",[id(21)]);
   assert.equal((await db.query('select retention_closed_at from chats where id=$1',[id(21)])).rows[0].retention_closed_at.toISOString(),reset.started_at.toISOString());await db.query("update chats set status='closed' where id=$1",[id(21)]);
   assert.equal((await clock(21)).delete_after.toISOString(),reset.delete_after.toISOString());
   await db.query("update chats set status='closed' where id=$1",[id(20)]);assert.ok(await clock(20));
   await db.query("update articulos set status='entregado',estado='entregado' where id=$1",[id(12)]);assert.ok(await clock(24));
  });
  await t.test('expiry deletes messages, reads, pickups, resolved report snapshots and stale notifications without deleting the article',async()=>{
   for(const n of [20,21,24])await expire(n);
   await db.query("update chat_retention set started_at=now()-interval '719 hours',delete_after=now()+interval '1 hour' where chat_id=$1",[id(23)]);
   await db.exec(`insert into chat_messages values('${id(50)}','${id(21)}','Contenido privado');
    insert into chat_reads values('${id(21)}');insert into chat_pickups values('${id(21)}','Lugar privado');
    insert into chat_reports values('${id(51)}','${id(21)}','resolved','[{"body":"Copia privada"}]'),('${id(52)}','${id(20)}','open','[]');
    insert into sale_reservations(id,chat_id) values('${id(53)}','${id(24)}');insert into sale_disputes values('${id(54)}','${id(53)}','open');
    insert into activity_notifications values('${id(21)}','Aviso antiguo');
    update chat_retention_settings set enabled=true;`);
   const result=await purge();assert.equal(result.deleted,1);assert.equal(await exists(21),false);
   assert.equal(await exists(20),true);assert.equal(await exists(23),true);assert.equal(await exists(24),true);
   for(const table of ['chat_messages','chat_reads','chat_pickups','activity_notifications'])assert.equal((await db.query(`select count(*)::int n from ${table}`)).rows[0].n,0);
   assert.equal((await db.query('select count(*)::int n from articulos')).rows[0].n,3);
   assert.equal((await db.query('select count(*)::int n from chat_reports where id=$1',[id(51)])).rows[0].n,0);
  });
  await t.test('open reports and sale cases hold the chat; resolving them allows the original overdue clock to expire',async()=>{
   await asUser(2);assert.equal((await status(20)).held,true);assert.equal((await status(24)).held,true);
   await asUser(3);const preview=(await db.query('select preview_retention(20) r')).rows[0].r;assert.equal(preview.counts.chats||0,0);
   await db.exec("reset role;update chat_reports set status='resolved';update sale_disputes set status='resolved'");
   assert.equal((await purge(1)).deleted,1);assert.equal((await purge()).deleted,1);assert.equal((await purge()).deleted,0);
   assert.equal(await exists(20),false);assert.equal(await exists(24),false);
   assert.equal((await db.query('select count(*)::int n from sale_reservations')).rows[0].n,1);
   const audit=(await db.query('select * from staff_audit')).rows;assert.equal(audit.length,3);
   assert.doesNotMatch(JSON.stringify(audit),/Contenido privado|Lugar privado|Copia privada/);
  });
  await t.test('a stale or forged clock cannot erase a pending chat, and disabled/missing controls fail closed',async()=>{
   await db.query("insert into chat_retention values($1,now()-interval '31 days',now()-interval '1 day')",[id(22)]);
   assert.equal((await purge()).deleted,0);assert.equal(await exists(22),true);
   await assert.rejects(purge(0),/Lote/);await assert.rejects(purge(null),/Lote/);
   await db.exec('delete from chat_retention_settings');assert.deepEqual(await purge(),{enabled:false,deleted:0});
   await db.exec('insert into chat_retention_settings(id) values(true)');assert.equal((await purge()).deleted,0);
  });
 }finally{await db.close();}
});
