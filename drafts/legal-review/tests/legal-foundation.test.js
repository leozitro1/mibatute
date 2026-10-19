import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {metricsAllowed,METRICS_KEY} from '../src/legal/preferences.js';
import {createMarketMetrics} from '../src/analytics/metrics.js';
import {LEGAL_READY,legalAcceptance} from '../src/legal/config.js';
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const migration=await readFile(new URL('../supabase/migrations/2026-10-19-legal-foundation.sql',import.meta.url),'utf8');
const workflowSql=await readFile(new URL('../supabase/migrations/2026-10-19-data-rights-workflow.sql',import.meta.url),'utf8');
const staffSource=await readFile(new URL('../supabase/migrations/2026-10-14-staff-console.sql',import.meta.url),'utf8');
const definition=name=>{const start=staffSource.indexOf(`create or replace function public.${name}(`);return staffSource.slice(start,staffSource.indexOf('$$;',start)+3);};
async function fixture(){
 const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
 create function auth.jwt() returns jsonb language sql stable as 'select coalesce(nullif(current_setting(''request.jwt.claims'',true),''''),''{}'')::jsonb';
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
 create table auth.sessions(id uuid primary key,user_id uuid);create table auth.mfa_factors(user_id uuid,status text,factor_type text);
 create table public.usuarios(id uuid primary key,nombre text,is_blocked boolean default false,bloqueado boolean default false,ban_until timestamptz);
 create table public.staff_accounts(user_id uuid primary key,role text,active boolean default true,permissions text[] default '{}');
 create table public.staff_sessions(session_id uuid primary key,user_id uuid,revoked_at timestamptz,expires_at timestamptz,last_seen_at timestamptz);
 create table public.wompi_topups(id uuid default gen_random_uuid(),usuario_id uuid,credits integer);
 create table public.staff_audit(actor_id uuid,action text,target_id uuid,reason text,changes jsonb);
 grant usage on schema public,auth to anon,authenticated;
 `);
 for(const n of [1,2,3,4]){await db.query('insert into auth.users(id) values($1)',[id(n)]);await db.query('insert into usuarios(id,nombre) values($1,$2)',[id(n),`Persona ${n}`]);}
 for(const [n,role]of [[3,'admin'],[4,'master']]){await db.query('insert into staff_accounts(user_id,role) values($1,$2)',[id(n),role]);await db.query("insert into auth.mfa_factors values($1,'verified','totp')",[id(n)]);await db.query('insert into auth.sessions values($1,$2)',[id(n+100),id(n)]);await db.query("insert into staff_sessions values($1,$2,null,now()+interval '1 hour',now())",[id(n+100),id(n)]);}
 await db.exec(definition('staff_permission'));await db.exec(definition('staff_require'));await db.exec(migration);await db.exec(migration);
 const as=async(n,aal='aal1')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[n?id(n):'',JSON.stringify({aal,session_id:id((n||0)+100)})]);await db.exec(n?'set role authenticated':'set role anon');};
 const rpc=async(name,args=[])=> (await db.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) result`,args)).rows[0].result;
 return{db,as,rpc};
}

test('draft legal policies cannot capture binding consent; published versions preserve server evidence',async()=>{
 const {db,as,rpc}=await fixture();try{
  assert.equal(LEGAL_READY,false);assert.equal(legalAcceptance(true,true,true),null);
  await assert.rejects(db.query('insert into auth.users(id) values($1)',[id(10)]),/políticas definitivas/);
  await assert.rejects(db.query('insert into wompi_topups(usuario_id,credits) values($1,2)',[id(1)]),/condiciones definitivas/);
  await assert.rejects(db.exec("update legal_releases set enabled=true"),/Faltan/);
  const releaseDocuments={version:'2026-10-19.1',operator:{name:'Responsable ficticio',entityType:'natural',address:'Dirección ficticia',phone:'Teléfono de prueba',email:'responsable@example.com'},policies:{'/terminos':{title:'Términos de prueba'},'/privacidad':{title:'Privacidad de prueba'},'/pagos':{title:'Pagos de prueba'}}};
  await db.query("update legal_releases set documents=$1,enabled=true where version='2026-10-19.1'",[releaseDocuments]);
  await assert.rejects(db.query('insert into auth.users(id) values($1)',[id(10)]),/aceptar/);
  await assert.rejects(db.query('insert into auth.users(id,raw_user_meta_data) values($1,$2)',[id(10),{legal_acceptance:{terms_version:'old',privacy_version:'old',adult_confirmed:true}}]),/aceptar/);
  const acceptance={terms_version:'2026-10-19.1',privacy_version:'2026-10-19.1',adult_confirmed:true};
  await db.query('insert into auth.users(id,raw_user_meta_data) values($1,$2)',[id(10),{legal_acceptance:acceptance}]);
  const proof=(await db.query('select * from legal_consents where user_id=$1',[id(10)])).rows[0];assert.equal(proof.source,'registration');assert.ok(proof.accepted_at);
  await db.query("update auth.users set raw_user_meta_data='{}' where id=$1",[id(10)]);assert.equal((await db.query('select count(*)::int n from legal_consents')).rows[0].n,1);
  await assert.rejects(db.exec("update legal_releases set documents='{}'"),/inmutable/);
  await as(1);assert.equal((await rpc('legal_consent_status')).required,true);
  await db.exec('reset role');await assert.rejects(db.query('insert into wompi_topups(usuario_id,credits) values($1,2)',[id(1)]),/acepta/);await as(1);
  await assert.rejects(rpc('accept_legal_release',['2026-10-19.1',true,false,true]),/autorizaciones/);
  await rpc('accept_legal_release',['2026-10-19.1',true,true,true]);await rpc('accept_legal_release',['2026-10-19.1',true,true,true]);
  assert.equal((await rpc('legal_consent_status')).required,false);
  await db.exec('reset role');const order=(await db.query('insert into wompi_topups(usuario_id,credits) values($1,2) returning legal_version,legal_accepted_at',[id(1)])).rows[0];assert.equal(order.legal_version,'2026-10-19.1');assert.ok(order.legal_accepted_at);await as(1);
  await assert.rejects(db.query('select * from legal_consents'),/permission denied/);
  await as(null);await assert.rejects(rpc('accept_legal_release',['2026-10-19.1',true,true,true]),/permission denied/);
 }finally{await db.close();}
});

test('rights requests are private, retry-safe, independent of the support cooldown and shared with MFA-verified staff',async()=>{
 const {db,as,rpc}=await fixture();try{
  await as(1);const key=id(200),body='Solicito consultar mis datos y la prueba de autorización.';
  assert.equal(await rpc('submit_data_request',[key,'consultation',body]),key);
  assert.equal(await rpc('submit_data_request',[key,'consultation',body]),key);
  await assert.rejects(rpc('submit_data_request',[key,'deletion',body]),/ya utilizado/);
  await rpc('submit_data_request',[id(201),'deletion','Solicito la supresión de mis datos personales.']);
  assert.equal((await rpc('data_requests_inbox')).total,2);
  await assert.rejects(rpc('submit_data_request',[id(202),'deletion','x'.repeat(501)]),/500/);
  await assert.rejects(db.query('delete from data_rights_requests'),/permission denied/);
  await as(2);assert.equal((await rpc('data_requests_inbox')).total,0);await assert.rejects(rpc('submit_data_request',[key,'consultation',body]),/ya utilizado/);
  await assert.rejects(rpc('respond_data_request',[key,'answered','Respuesta no autorizada.']),/autorizado/);
  await as(3);await assert.rejects(rpc('data_requests_inbox',[true,1,'']),/autorizado/);
  for(const n of [3,4]){await as(n,'aal2');assert.equal((await rpc('data_requests_inbox',[true,1,''])).total,2);}
  await as(3,'aal2');await rpc('respond_data_request',[key,'reviewing','Verificaremos tu solicitud y los registros correspondientes.']);
  await as(4,'aal2');await rpc('respond_data_request',[key,'answered','La consulta fue atendida y se documentó su entrega al titular.']);await rpc('respond_data_request',[key,'answered','La consulta fue atendida y se documentó su entrega al titular.']);
  await assert.rejects(rpc('respond_data_request',[key,'answered','Quiero sobrescribir la respuesta final.']),/sobrescribir/);
  await as(1);const answered=(await rpc('data_requests_inbox',[false,1,'answered'])).rows[0];assert.equal(answered.id,key);assert.ok(answered.response);assert.equal(answered.user_id,null);
  await db.exec('reset role');assert.equal((await db.query("select count(*)::int n from staff_audit where action='privacy.respond'")).rows[0].n,2);
  await db.query('update staff_accounts set active=false where user_id=$1',[id(3)]);await as(3,'aal2');await assert.rejects(rpc('data_requests_inbox',[true,1,'']),/autorizado/);
  await as(null);await assert.rejects(rpc('submit_data_request',[id(203),'consultation',body]),/permission denied/);
 }finally{await db.close();}
});

test('optional metrics are opt-in and withdrawal discards pending events without a network flush',async()=>{
 const storage=value=>({getItem:key=>key===METRICS_KEY?value:null});
 assert.equal(metricsAllowed(storage(null)),false);assert.equal(metricsAllowed(storage('rejected')),false);assert.equal(metricsAllowed(storage('accepted')),true);
 assert.equal(metricsAllowed(storage('accepted'),{doNotTrack:'1'}),false);assert.equal(metricsAllowed(storage('accepted'),{globalPrivacyControl:true}),false);
 assert.equal(metricsAllowed({getItem(){throw new Error('Denied');}}),false);
 const calls=[],cancelled=[];const tracker=createMarketMetrics({visit:'test',send:data=>calls.push(data),schedule:()=>7,cancel:value=>cancelled.push(value)});
 tracker.record({kind:'view',id:'one'});tracker.clear();await tracker.flush();assert.equal(calls.length,0);assert.deepEqual(cancelled,[7]);
});

test('withdrawing optional metrics also prevents a failed in-flight batch from being queued again',async()=>{
 let fail;const calls=[];
 const tracker=createMarketMetrics({visit:'test',send:data=>{calls.push(data);return new Promise((resolve,reject)=>{fail=reject;});},schedule:()=>1,cancel:()=>{}});
 tracker.record({kind:'view',id:'pending'});const pending=tracker.flush();await Promise.resolve();tracker.clear();fail(new Error('Network failed'));await pending;await tracker.flush();assert.equal(calls.length,1);
});

test('case assignment, internal verification and email intake preserve privacy and require a documented handoff',async()=>{
 const {db,as,rpc}=await fixture();try{
  await db.exec(workflowSql);await db.exec(workflowSql);
  await as(1);const key=id(800);await rpc('submit_data_request',[key,'deletion','Solicito revisar la supresión de mis datos.']);
  await as(3);await assert.rejects(rpc('claim_data_request',[key,0]),/autorizado/);
  await as(3,'aal2');await assert.rejects(rpc('respond_data_request',[key,'answered','Respuesta final sin gestionar.']),/Toma el caso/);
  await rpc('claim_data_request',[key,0]);await rpc('claim_data_request',[key,0]);
  await assert.rejects(rpc('respond_data_request',[key,'answered','Respuesta final sin verificar.']),/verificación/);
  await rpc('update_data_request_work',[key,1,'verified','Identidad verificada y acciones documentadas sin copiar documentos.',false]);
  await as(4,'aal2');await assert.rejects(rpc('claim_data_request',[key,1]),/caso cambió/);
  await rpc('claim_data_request',[key,2]);
  await as(3,'aal2');await assert.rejects(rpc('update_data_request_work',[key,3,'verified','Intento de editar después del relevo.',false]),/otra persona/);
  await as(4,'aal2');await rpc('respond_data_request',[key,'answered','Solicitud revisada; esta respuesta no afirma una eliminación automática.']);
  await assert.rejects(rpc('update_data_request_work',[key,4,'verified','Editar el cierre previo no está permitido.',false]),/Caso no disponible/);
  await as(1);const own=(await rpc('data_requests_inbox')).rows[0];
  assert.equal(own.internal_notes,null);assert.equal(own.verification,null);assert.equal(own.assigned_to,null);assert.ok(own.response);
  await assert.rejects(rpc('register_external_data_request',[id(801),'consultation','2026-10-18T14:00:00Z','persona@example.com','Consulta recibida por correo.']),/autorizado/);
  await as(3,'aal2');const email=id(801),received='2026-10-18T14:00:00Z';
  await rpc('register_external_data_request',[email,'consultation',received,'persona@example.com','Consulta recibida por correo, registrada manualmente.']);
  await rpc('register_external_data_request',[email,'consultation',received,'persona@example.com','Consulta recibida por correo, registrada manualmente.']);
  await assert.rejects(rpc('register_external_data_request',[email,'consultation',received,'otra@example.com','Consulta recibida por correo, registrada manualmente.']),/ya utilizado/);
  await assert.rejects(rpc('register_external_data_request',[id(802),'consultation','2999-01-01T00:00:00Z','persona@example.com','Fecha futura no permitida.']),/fecha/);
  let row=(await rpc('data_requests_inbox',[true,1,''])).rows.find(item=>item.id===email);
  assert.equal((await rpc('data_requests_inbox',[true,1,'pending'])).total,1,'The default staff queue omits answered cases');
  assert.equal(row.source,'email');assert.equal(row.received_at,'2026-10-18T14:00:00+00:00');assert.equal(row.user_id,null);assert.equal(row.assigned_to,id(3));
  await rpc('update_data_request_work',[email,0,'not_required','Respuesta general sin datos privados; envío por correo pendiente.',false]);
  await assert.rejects(rpc('respond_data_request',[email,'answered','Respuesta general para el remitente.']),/Confirma el envío/);
  await rpc('update_data_request_work',[email,1,'not_required','Respuesta general enviada por correo; original conservado en carpeta de atención.',true]);
  await rpc('respond_data_request',[email,'answered','Respuesta general para el remitente.']);
  await as(1);assert.equal((await rpc('data_requests_inbox')).total,1,'An external request is never attached to an unrelated logged-in user');
  await as(2);assert.equal((await rpc('data_requests_inbox')).total,0);
  await db.exec('reset role');const audits=(await db.query("select * from staff_audit where action like 'privacy.%'")).rows;
  assert.ok(audits.some(item=>item.action==='privacy.assign'));assert.ok(audits.some(item=>item.action==='privacy.register_email'));
  assert.ok(!JSON.stringify(audits).includes('persona@example.com'));assert.ok(!JSON.stringify(audits).includes('Identidad verificada y acciones'));
 }finally{await db.close();}
});
