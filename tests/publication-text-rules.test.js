import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {publicationTextIssue,validatePublicationText} from '../src/components/articleValidation.js';
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const contactCases=[
 'Escríbeme al 3001234567','3 0 0 1 2 3 4 5 6 7','+57 (300) 123-45-67','tel: 6011234',
 'Escríbeme al tres cero cero uno dos tres cuatro cinco seis siete',
 'juan@example.com','juan[at]example[dot]com','3️⃣0️⃣0️⃣1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣','juan arroba gmail punto com','juan (arroba) gmail (punto) com',
 'https://example.com/oferta','www.example.com','example.com','wa.me/573001234567','bit.ly/ejemplo',
 'instagram: mi_perfil','Mi instagram es ejemplo','@mi_perfil','i n s t a g r a m: perfil',
 'insta\u200bgram: perfil','іnstagram: perfil','３００１２３４５６７',
];
const validCases=[
 'Impresora HP funcionando','Computador para reparar','Celular compatible con WhatsApp',
 'Figura antigua de colección','Mesa por 250.000 pesos','Modelo 1234567890123',
 'Tres sillas y dos mesas','Escríbeme por el chat interno','Caja de correo decorativa',
 'No doy mi dirección exacta aquí','Silla para mamá','Mesa 120 x 80 cm, año 2020',
];

test('publication preview rejects contact evasions and permits innocent product descriptions',()=>{
 for(const text of contactCases)assert.ok(publicationTextIssue(text),text);
 for(const text of validCases)assert.equal(publicationTextIssue(text),null,text);
 assert.ok(validatePublicationText('Escríbeme al 3001234567','Mesa de comedor'));
 for(const text of ['Venta peligrosa','vеnta peligrosa','venta p3ligr0sa','venta p.e.l.i.g.r.o.s.a'])assert.ok(publicationTextIssue(text,['venta peligrosa']),text);
 assert.equal(publicationTextIssue('Hermoso computador',['puta']),null);
});

test('database enforces text rules on direct writes, keeps staff-only controls and matches the browser',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create function public.staff_require(text) returns void language plpgsql as $$begin if auth.uid() is distinct from '${id(1)}'::uuid then raise exception 'Acceso no autorizado' using errcode='42501';end if;end$$;
   create table public.staff_audit(actor_id uuid,action text,reason text,changes jsonb);
   create table public.articulos(id uuid primary key,title text,titulo text,description text,status text);
   grant usage on schema public,auth to anon,authenticated;
   grant insert,select,update on articulos to authenticated;`);
  const migration=await readFile(new URL('../supabase/migrations/2026-10-28-publication-text-rules.sql',import.meta.url),'utf8');
  await db.exec(migration);
  for(const text of [...contactCases,...validCases]){
   const problem=(await db.query('select public.publication_text_problem($1) problem',[text])).rows[0].problem;
   assert.equal(!!problem,!!publicationTextIssue(text),text);
  }
  const as=async uid=>{await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(uid)]);};
  await as(2);await assert.rejects(db.query('select staff_publication_rules()'),/autorizado/);
  await assert.rejects(db.query("select staff_save_publication_rule(null,'venta peligrosa',true)"),/autorizado/);
  await assert.rejects(db.query('select * from publication_text_rules'),/permission/);
  await assert.rejects(db.query('insert into articulos values($1,$2,$2,$3,$4)',[id(10),'3001234567','Mesa','disponible']),/contacto/);
  await as(1);
  for(const term of ['HP','.*','casino|apuesta','1234'])await assert.rejects(db.query('select staff_save_publication_rule(null,$1,true)',[term]),/palabra o frase/);
  const rule=(await db.query("select staff_save_publication_rule(null,'venta peligrosa',true) result")).rows[0].result;
  await assert.rejects(db.query("select staff_save_publication_rule(null,'Vénta peligrosa',true)"),/ya existe/);
  await as(2);
  await assert.rejects(db.query('insert into articulos values($1,$2,$2,$3,$4)',[id(11),'Venta p3ligr0sa','Descripción','disponible']),/palabra o frase/);
  await db.query('insert into articulos values($1,$2,$2,$3,$4)',[id(12),'Impresora HP','Funciona bien','disponible']);
  await assert.rejects(db.query('update articulos set description=$1 where id=$2',['mi instagram es vendedor',id(12)]),/contacto/);
  await db.query("update articulos set status='reservado' where id=$1",[id(12)]);
  await db.exec('reset role');
  const variants=['Venta peligrosa','vеnta peligrosa','venta p3ligr0sa','venta p.e.l.i.g.r.o.s.a'];
  for(const text of variants)assert.ok((await db.query('select publication_text_problem($1) problem',[text])).rows[0].problem,text);
  await as(1);
  await assert.rejects(db.query('select staff_save_publication_rule($1,$2,false,null)',[rule.id,rule.term]),/cambió/);
  const inactive=(await db.query('select staff_save_publication_rule($1,$2,false,$3) result',[rule.id,rule.term,rule.updated_at])).rows[0].result;
  assert.equal(inactive.active,false);
  assert.equal((await db.query('select publication_text_rules() rules')).rows[0].rules.length,0);
  await as(2);await db.query('update articulos set title=$1 where id=$2',['Venta peligrosa',id(12)]);
  await db.exec('reset role');assert.equal((await db.query('select count(*)::int total from staff_audit')).rows[0].total,2);
  await db.exec(migration);assert.equal((await db.query('select count(*)::int total from publication_text_rules')).rows[0].total,1);
 }finally{await db.close();}
});
