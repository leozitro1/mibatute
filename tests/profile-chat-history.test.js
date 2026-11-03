import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {userChatType} from '../src/components/userChatType.js';
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;

test('chat type is relative to the participant and distinguishes donations from paid transactions',()=>{
 const row={buyer_id:'buyer',seller_id:'seller',mode:'venta'};
 assert.deepEqual(userChatType(row,'buyer'),{key:'purchases',label:'Compra'});
 assert.deepEqual(userChatType(row,'seller'),{key:'sales',label:'Venta'});
 assert.deepEqual(userChatType({...row,mode:'donacion'},'buyer'),{key:'donations',label:'Rescate'});
 assert.deepEqual(userChatType({...row,mode:'donacion'},'seller'),{key:'donations',label:'Donación'});
 assert.equal(userChatType(row,'unrelated'),null);
});

test('profile chat history is participant-only, paginated, includes closed chats and hides deleted articles',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create table usuarios(id uuid primary key,nombre text,email text,is_blocked boolean default false,bloqueado boolean default false,ban_until timestamptz);
   create view usuarios_publicos as select id,nombre from usuarios;
   create table articulos(id uuid primary key,title text,mode text,status text,imagen_url_principal text,image_url text);
   create table chats(id uuid primary key,articulo_id uuid references articulos(id) on delete cascade,buyer_id uuid,seller_id uuid,status text,created_at timestamptz default now());
   create table chat_messages(chat_id uuid references chats(id) on delete cascade,body text);
   insert into usuarios(id,nombre,email) values('${id(1)}','Vendedor','private@example.com'),('${id(2)}','Comprador','private2@example.com'),('${id(3)}','Ajeno','private3@example.com');
   insert into articulos values('${id(10)}','Bicicleta','venta','disponible',null,null),('${id(11)}','Mesa','donacion','entregado',null,null);
   insert into chats values('${id(20)}','${id(10)}','${id(2)}','${id(1)}','closed',now()),('${id(21)}','${id(11)}','${id(2)}','${id(1)}','closed',now());
   insert into chat_messages values('${id(20)}','Mensaje privado');`);
  const sql=await readFile(new URL('../supabase/migrations/2026-10-27-profile-chat-history.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
  const asUser=async n=>{await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(n)]);};
  const read=async(page=1)=>(await db.query('select profile_chat_history($1) result',[page])).rows[0].result;
  await asUser(3);assert.deepEqual((await read()).rows,[]);
  await asUser(2);const buyer=await read();assert.equal(buyer.rows.length,2);assert.ok(buyer.rows.every(row=>row.other_name==='Vendedor'&&row.chat_status==='closed'));
  assert.doesNotMatch(JSON.stringify(buyer),/private@|Mensaje privado|email|body/);
  await assert.rejects(read(0),/válida/);await assert.rejects(read(501),/válida/);
  await asUser(1);assert.ok((await read()).rows.every(row=>row.other_name==='Comprador'));
  await db.exec(`reset role;insert into chats select md5(n::text)::uuid,'${id(10)}','${id(2)}','${id(1)}','open',now()-n*interval '1 day' from generate_series(30,42) n;`);
  await asUser(1);assert.equal((await read()).rows.length,12);assert.equal((await read()).hasMore,true);assert.equal((await read(2)).rows.length,3);
  await db.exec('reset role');
  const filterSql=await readFile(new URL('../supabase/migrations/2026-10-28-profile-chat-open-filter.sql',import.meta.url),'utf8');
  await db.exec(filterSql);await db.exec(filterSql);
  const filtered=async(page=1,onlyOpen=true)=>(await db.query('select profile_chat_history($1,$2) result',[page,onlyOpen])).rows[0].result;
  await asUser(1);
  assert.equal((await filtered()).rows.length,12);assert.equal((await filtered()).hasMore,true);
  assert.ok((await filtered()).rows.every(row=>row.chat_status==='open'));
  assert.equal((await filtered(2)).rows.length,1,'closed recent chats must not consume slots before filtering');
  assert.equal((await filtered(1,false)).rows.length,12);
  assert.equal((await filtered(2,false)).rows.length,3);
  await assert.rejects(filtered(0),/válida/);await assert.rejects(filtered(1,null),/válido/);
  await asUser(3);assert.deepEqual((await filtered()).rows,[]);
  await db.exec(`reset role;update chats set status='pending' where id=md5('30')::uuid;`);
  await asUser(1);assert.equal((await filtered()).hasMore,false);assert.equal((await filtered()).rows.length,12);
  await db.exec(`reset role;update articulos set status='entregado' where id='${id(10)}';`);
  await asUser(1);assert.deepEqual((await filtered()).rows,[],'delivered article is read-only even if chat status is stale');
  await db.exec(`reset role;update articulos set status='disponible' where id='${id(10)}';`);
  await asUser(2);assert.doesNotMatch(JSON.stringify(await filtered()),/private@|Mensaje privado|email|body/);
  await db.exec('reset role;set role anon');await assert.rejects(filtered(),/permission/);
  await db.exec(`reset role;delete from articulos where id='${id(10)}'`);
  await asUser(2);assert.equal((await read()).rows.length,1);
  await db.exec('reset role');assert.equal((await db.query('select count(*) n from chat_messages')).rows[0].n,0);
  await db.exec(`update usuarios set ban_until=now()+interval '1 day' where id='${id(2)}'`);
  await asUser(2);await assert.rejects(read(),/cuenta/);await assert.rejects(filtered(),/cuenta/);
  await db.exec('reset role;set role anon');await assert.rejects(read(),/permission/);
  await db.exec(`reset role;update usuarios set ban_until=null;delete from chats;delete from articulos;
   insert into articulos values('${id(100)}','Artículo de venta','venta','reservado',null,null),('${id(101)}','Artículo de donación','donacion','reservado',null,null);
   insert into chats select md5(('purchase-'||n)::text)::uuid,'${id(100)}','${id(1)}','${id(2)}','open',now()-n*interval '1 second' from generate_series(1,13) n;
   insert into chats select md5(('sale-'||n)::text)::uuid,'${id(100)}','${id(2)}','${id(1)}','open',now()-(n+20)*interval '1 second' from generate_series(1,3) n;
   insert into chats values('${id(300)}','${id(100)}','${id(2)}','${id(1)}','closed',now()),
    ('${id(301)}','${id(101)}','${id(1)}','${id(2)}','open',now()),
    ('${id(302)}','${id(101)}','${id(2)}','${id(1)}','open',now()),
    ('${id(303)}','${id(100)}','${id(2)}','${id(3)}','open',now());`);
  const typeSql=await readFile(new URL('../supabase/migrations/2026-11-03-profile-chat-type-filter.sql',import.meta.url),'utf8');
  await db.exec(typeSql);await db.exec(typeSql);
  const byType=async(kind='all',page=1,openOnly=true)=>(await db.query('select profile_chat_history($1,$2,$3) result',[page,openOnly,kind])).rows[0].result;
  await asUser(1);
  const purchases=await byType('purchases');assert.equal(purchases.rows.length,12);assert.equal(purchases.hasMore,true);
  assert.ok(purchases.rows.every(row=>row.buyer_id===id(1)&&row.mode==='venta'));
  const second=await byType('purchases',2);assert.equal(second.rows.length,1);assert.equal(second.hasMore,false);
  assert.ok(!new Set(purchases.rows.map(row=>row.chat_id)).has(second.rows[0].chat_id));
  assert.equal((await byType('sales')).rows.length,3);assert.equal((await byType('sales',1,false)).rows.length,4);
  assert.ok((await byType('sales')).rows.every(row=>row.seller_id===id(1)));
  const donations=await byType('donations');assert.equal(donations.rows.length,2);assert.ok(donations.rows.every(row=>row.mode==='donacion'));
  assert.equal((await byType()).rows.length,12);assert.equal((await byType('all',2)).rows.length,6);
  assert.doesNotMatch(JSON.stringify(await byType()),/private@|Mensaje privado|email|body/);
  assert.equal((await read()).hasMore,true,'Legacy one-argument API stays available');
  assert.equal((await filtered()).hasMore,true,'Legacy two-argument API stays available');
  for(const kind of [null,'buyer','invalid'])await assert.rejects(byType(kind),/válido/);
  await assert.rejects(byType('all',0),/válida/);await assert.rejects(byType('all',1,null),/válido/);
  await asUser(2);assert.equal((await byType('sales',2)).rows.length,1,'Seller sees the same purchases as sales');
  await asUser(4);assert.deepEqual((await byType()).rows,[]);
  await db.exec(`reset role;update usuarios set is_blocked=true where id='${id(1)}'`);
  await asUser(1);await assert.rejects(byType(),/cuenta/);
  await db.exec('reset role;set role anon');await assert.rejects(byType(),/permission/);
 }finally{await db.close();}
});
