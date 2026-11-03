import test from 'node:test';
import assert from 'node:assert/strict';
import {rescateRequestNotice} from '../src/components/rescateRequestNotice.js';
const now=Date.parse('2026-11-03T12:00:00Z');
const base={_source:'postulaciones',articulo:{mode:'donacion',status:'disponible',created_at:new Date(now).toISOString(),owner_id:'seller'}};
const notice=(patch={},article={})=>rescateRequestNotice({...base,...patch,articulo:{...base.articulo,...article}},'buyer',now);

test('rescates distinguish gift applications, selected recipients, rejected requests and completed transactions',()=>{
 assert.equal(notice().title,'Solicitud de donación enviada');
 assert.equal(notice({}, {status:'reservado',ganador_id:'buyer'}).title,'Solicitud de donación aceptada');
 assert.equal(notice({}, {status:'entregado',ganador_id:'buyer'}).title,'Donación recibida');
 assert.equal(notice({_source:'rechazadas',_rejectedAt:new Date(now).toISOString()}).title,'Solicitud de donación rechazada');
 assert.equal(notice({_chatStatus:'closed'}).title,'Reserva de donación cancelada');
 assert.equal(notice({}, {status:'en_revision'}).title,'Donación en revisión');
 assert.equal(notice({}, {status:'pausado'}).title,'Publicación pausada');
});

test('purchase notices respect pending approval, cancellation and completion',()=>{
 assert.equal(notice({_chatStatus:'pending'}, {mode:'venta',status:'reservado',buyer_id:'buyer'}).title,'Compra pendiente de aprobación');
 assert.equal(notice({_chatStatus:'open'}, {mode:'venta',status:'reservado',buyer_id:'buyer'}).title,'Compra reservada');
 assert.equal(notice({}, {mode:'venta',status:'entregado',buyer_id:'buyer'}).title,'Compra completada');
 assert.equal(notice({_chatStatus:'closed',_canceledBy:'seller',_canceledAt:new Date(now).toISOString()}, {mode:'venta'}).title,'Compra cancelada');
});

test('rescue detail projection keeps applicant isolation and exposes only the public article fields',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');
 const {readFile}=await import('node:fs/promises');
 const db=new PGlite();
 const uid=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
   create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
   create table articulos(id uuid primary key,title text,description text,category text,subcategory text,estado_producto int,size_class text,location_reference text,
    mode text,estado text,status text,city text,locality text,price numeric,owner_id uuid,usuario_id uuid,buyer_id uuid,ganador_id uuid,winner_id uuid,recipient_id uuid,
    image_url text,imagen_url_principal text,imagenes text[],delivered_at timestamptz,updated_at timestamptz,created_at timestamptz,sensitive_field text default 'private');
   create table postulaciones(id uuid,articulo_id uuid,created_at timestamptz,justificacion text,usuario_id uuid);
   create table postulaciones_rechazadas(id uuid,articulo_id uuid,created_at timestamptz,usuario_id uuid);
   create table articulo_imagenes(id uuid,articulo_id uuid,url text,position int);
   create function public.my_rescue_applications() returns setof jsonb language sql as 'select null::jsonb where false';
   revoke all on function public.my_rescue_applications() from public,anon;
   grant execute on function public.my_rescue_applications() to authenticated;
   grant usage on schema public,auth to anon,authenticated;
   grant select on articulos,postulaciones,postulaciones_rechazadas,articulo_imagenes to authenticated;
   alter table postulaciones enable row level security;
   create policy own on postulaciones for select using(usuario_id=auth.uid());
   alter table postulaciones_rechazadas enable row level security;
   create policy own on postulaciones_rechazadas for select using(usuario_id=auth.uid());
   alter table articulos enable row level security;
   create policy visible on articulos for select using(title<>'Private');
   insert into articulos(id,title,description,mode,location_reference) values('${uid(10)}','Mesa','Descripción completa','donacion','Hayuelos'),('${uid(11)}','Private','Oculto','venta','Secreto');
   insert into postulaciones values('${uid(20)}','${uid(10)}',now(),'Mi solicitud','${uid(1)}'),('${uid(21)}','${uid(10)}',now(),'Ajena','${uid(2)}'),('${uid(22)}','${uid(11)}',now(),'Privado','${uid(1)}');
   insert into articulo_imagenes values('${uid(30)}','${uid(10)}','second.jpg',1),('${uid(31)}','${uid(10)}','first.jpg',0);`);
  const sql=await readFile(new URL('../supabase/migrations/2026-11-03-rescate-article-details.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
  const read=async n=>{
   await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid(n)]);await db.exec('set role authenticated');
   return (await db.query('select public.my_rescue_applications() r')).rows.map(row=>row.r);
  };
  const own=await read(1);assert.equal(own.length,1);assert.equal(own[0].justificacion,'Mi solicitud');
  assert.equal(own[0].articulo.description,'Descripción completa');assert.equal(own[0].articulo.location_reference,'Hayuelos');
  assert.deepEqual(own[0].articulo.articulo_imagenes.map(photo=>photo.url),['first.jpg','second.jpg']);
  assert.equal(Object.hasOwn(own[0].articulo,'sensitive_field'),false);
  assert.equal((await read(2))[0].justificacion,'Ajena');
  await db.exec('reset role;set role anon');await assert.rejects(db.query('select public.my_rescue_applications()'),/permission denied/);
 }finally{await db.close();}
});
