import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {isCatalogReservationHidden} from '../src/components/catalogVisibility.js';
const owner='11111111-1111-1111-1111-111111111111',buyer='22222222-2222-2222-2222-222222222222';
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const migration=name=>readFile(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),'utf8');
const definition=(sql,name)=>{const start=sql.indexOf(`create or replace function public.${name}(`);return sql.slice(start,sql.indexOf('$$;',start)+3);};

test('catalog deadline is exact and absent deadlines never hide pending reservations',()=>{
 const deadline=Date.parse('2026-11-26T12:00:00Z'),article={catalog_hide_at:new Date(deadline).toISOString()};
 assert.equal(isCatalogReservationHidden(article,deadline-1),false);
 assert.equal(isCatalogReservationHidden(article,deadline),true);
 assert.equal(isCatalogReservationHidden({catalog_hide_at:null},deadline),false);
 assert.equal(isCatalogReservationHidden({},deadline),false);
});

test('catalog hides accepted reservations after a day while preserving profile access and existing pagination',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create table articulos(id uuid primary key,owner_id uuid,usuario_id uuid,mode text,title text,category text,categoria text,subcategory text,subcategoria text,
    city text default 'Bogotá',locality text default 'Suba',created_at timestamptz default now(),is_featured boolean default false,
    status text default 'disponible',estado text default 'disponible',buyer_id uuid,ganador_id uuid,winner_id uuid,recipient_id uuid,reserved_at timestamptz);
   create table chats(id uuid primary key,articulo_id uuid,buyer_id uuid,status text,approved_at timestamptz);
   alter table articulos enable row level security;
   create policy public_read on articulos for select using(true);
   create policy owner_write on articulos for update to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
   grant usage on schema public,auth to anon,authenticated;
   grant select on articulos to anon,authenticated;grant update on articulos to authenticated;
   grant select,update on chats to authenticated;
  `);
  const seed=async(n,mode,state='reservado',hours=null)=>{
   await db.query(`insert into articulos(id,owner_id,usuario_id,mode,title,status,estado,buyer_id,ganador_id,reserved_at) values($1,$2,$2,$3,$4,$5,$5,$6,$7,case when $8::integer is null then null else now()-$8*interval '1 hour' end)`,[id(n),owner,mode,`Article ${n}`,state,mode==='venta'&&state==='reservado'?buyer:null,mode==='donacion'&&state==='reservado'?buyer:null,hours]);
  };
  await seed(1,'venta');await seed(2,'venta');await seed(3,'venta');
  await seed(4,'donacion','reservado',25);await seed(5,'donacion','reservado',1);await seed(6,'donacion','disponible');
  for(const [n,hours,state]of [[1,25,'open'],[2,1,'open'],[3,null,'pending']])await db.query("insert into chats values($1,$1,$2,$3,case when $4::integer is null then null else now()-$4*interval '1 hour' end)",[id(n),buyer,state,hours]);
  await db.exec(definition(await migration('2026-10-02-publication-expiry'),'home_article_page'));
  await db.exec(definition(await migration('2026-10-01-approved-sale-retention'),'record_sale_approval'));
  await db.exec('create trigger record_sale_approval before insert or update on chats for each row execute function record_sale_approval()');
  const sql=await migration('2026-11-25-hide-accepted-after-day');await db.exec(sql);await db.exec(sql);
  const article=async n=>(await db.query('select * from articulos where id=$1',[id(n)])).rows[0];
  const page=async filters=>(await db.query('select home_article_page($1,1) as r',[{city:'Bogotá',onlyActive:false,...filters}])).rows[0].r;
  await db.exec('set role anon');
  assert.deepEqual((await page()).ids.sort(),[id(2),id(3),id(5),id(6)].sort());
  assert.equal((await page({kind:'venta'})).total,2);
  assert.equal((await page({kind:'donacion'})).total,2);
  assert.ok(await article(1),'Hidden catalog articles stay readable for existing profile/detail access');
  assert.equal((await article(3)).catalog_hide_at,null,'Buyer request alone never starts the clock');
  await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
  await db.query("update chats set status='open' where id=$1",[id(3)]);
  let sale=await article(3);assert.ok(Math.abs(sale.catalog_hide_at.getTime()-Date.now()-86400000)<5000);
  const deadline=sale.catalog_hide_at.getTime();
  await db.query("update articulos set title='Edited',catalog_hide_at=now()+interval '10 days' where id=$1",[id(3)]);
  assert.equal((await article(3)).catalog_hide_at.getTime(),deadline,'Owner cannot extend the deadline');
  await db.query("update chats set approved_at=now()+interval '10 days' where id=$1",[id(3)]);
  assert.equal((await article(3)).catalog_hide_at.getTime(),deadline,'Approval timestamp remains server controlled');
  await db.query("update articulos set status='reservado',estado='reservado',ganador_id=$2,reserved_at=now()+interval '10 days' where id=$1",[id(6),buyer]);
  const donationDeadline=(await article(6)).catalog_hide_at.getTime();
  assert.ok(Math.abs(donationDeadline-Date.now()-86400000)<5000);
  await db.query("update articulos set catalog_hide_at=null where id=$1",[id(6)]);
  assert.equal((await article(6)).catalog_hide_at.getTime(),donationDeadline);
  await db.query("update articulos set status='disponible',estado='disponible',ganador_id=null where id=$1",[id(4)]);
  assert.equal((await article(4)).catalog_hide_at,null);assert.ok((await page()).ids.includes(id(4)));
  await db.query("update chats set status='closed' where id=$1",[id(1)]);
  assert.equal((await article(1)).catalog_hide_at,null);assert.ok((await page()).ids.includes(id(1)));
  await assert.rejects(db.query('select sync_sale_catalog_deadline()'),{code:'42501'});
 }finally{await db.close();}
});
