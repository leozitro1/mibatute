import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
test('manual verification protects private identity data and requires a real staff review',async t=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
   create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
   create function auth.jwt() returns jsonb language sql stable as 'select coalesce(nullif(current_setting(''request.jwt.claims'',true),''''),''{}'')::jsonb';
   create table auth.users(id uuid primary key,email_confirmed_at timestamptz,email text);
   create table auth.sessions(id uuid,user_id uuid);create table auth.mfa_factors(user_id uuid,status text,factor_type text);
   create table usuarios(id uuid primary key,nombre text,movil text,created_at timestamptz default now(),ciudad text,localidad text,foto_url text,is_blocked boolean default false,bloqueado boolean default false,ban_until timestamptz);
   create table staff_accounts(user_id uuid,role text,active boolean default true,permissions text[] default '{}');
   create table staff_sessions(session_id uuid,user_id uuid,revoked_at timestamptz,expires_at timestamptz,last_seen_at timestamptz);
   create table staff_audit(id uuid primary key default gen_random_uuid(),actor_id uuid,action text,target_id uuid,reason text,changes jsonb,created_at timestamptz not null default now());
   grant usage on schema public,auth to anon,authenticated;
   revoke all on staff_audit from anon,authenticated;`);
  const staff=await readFile(new URL('../supabase/migrations/2026-10-14-staff-console.sql',import.meta.url),'utf8');
  for(const name of ['staff_permission','staff_require']){
   const start=staff.indexOf(`create or replace function public.${name}(`);
   await db.exec(staff.slice(start,staff.indexOf('$$;',start)+3));
  }
  await db.exec(`
   create table articulos(id uuid primary key,owner_id uuid,buyer_id uuid,title text,mode text,status text,image_url text,imagen_url_principal text);
   create table cupos(usuario_id uuid primary key,saldo integer);
   create table staff_publication_history(article_id uuid,owner_id uuid);
   create table staff_publication_reports(article_id uuid);
   create function public.staff_user_stats(uuid) returns jsonb language sql stable as $$select '{}'::jsonb$$;
   create table postulaciones(id uuid primary key,articulo_id uuid,usuario_id uuid);
   create table chats(id uuid primary key,articulo_id uuid,status text);
   create table system_messages(id uuid primary key default gen_random_uuid(),sender_id uuid,title text,body text,created_at timestamptz default now());
   create table system_message_receipts(id uuid primary key default gen_random_uuid(),message_id uuid,user_id uuid,read_at timestamptz,created_at timestamptz default now());
   create table cupos_historial(id uuid primary key default gen_random_uuid(),usuario_id uuid,cantidad integer,concepto text,referencia_id uuid);
   create table wompi_topups(id uuid primary key,usuario_id uuid,state text,environment text,credits integer,amount_in_cents integer,currency text,reference text);`);
  await db.exec(await readFile(new URL('../supabase/migrations/2026-10-23-email-notifications.sql',import.meta.url),'utf8'));
  const activity=await readFile(new URL('../supabase/migrations/2026-10-08-activity-notifications.sql',import.meta.url),'utf8');
  await db.exec(activity.slice(0,activity.indexOf('-- A notification identifies'))+'commit;');
  for(const name of ['append_activity_notification','record_activity_notification']){
   const start=activity.indexOf(`create or replace function public.${name}(`);
   await db.exec(activity.slice(start,activity.indexOf('$$;',start)+3));
  }
  await db.exec('create trigger notify_system_notice after insert on system_message_receipts for each row execute function record_activity_notification()');
  for(let n=1;n<=5;n++){
   await db.query("insert into auth.users(id,email_confirmed_at,email) values($1,$2,'fixture@example.com')",[id(n),n===5?null:new Date()]);
   await db.query('insert into usuarios(id,nombre) values($1,$2)',[id(n),'Persona Prueba']);
  }
  for(const [n,permissions] of [[3,['users']],[4,['moderation']]]){
   await db.query("insert into staff_accounts(user_id,role,permissions) values($1,'admin',$2)",[id(n),permissions]);
   await db.query('insert into auth.sessions values($1,$2)',[id(n+100),id(n)]);
   await db.query("insert into auth.mfa_factors values($1,'verified','totp')",[id(n)]);
   await db.query("insert into staff_sessions values($1,$2,null,now()+interval '8 hours',now())",[id(n+100),id(n)]);
  }
  const migration=await readFile(new URL('../supabase/migrations/2026-11-04-account-verification.sql',import.meta.url),'utf8');
  await db.exec(migration);await db.exec(migration);
  const notices=await readFile(new URL('../supabase/migrations/2026-11-04-account-verification-notices.sql',import.meta.url),'utf8');
  await db.exec(notices);await db.exec(notices);
  const historyMigration=await readFile(new URL('../supabase/migrations/2026-11-04-account-verification-history.sql',import.meta.url),'utf8');
  await db.exec(historyMigration);await db.exec(historyMigration);
  const usersMigration=await readFile(new URL('../supabase/migrations/2026-11-04-staff-user-verification-filter.sql',import.meta.url),'utf8');
  await db.exec(usersMigration);await db.exec(usersMigration);
  const asUser=async(n,aal='aal2')=>{
   await db.exec(n?'reset role;set role authenticated':'reset role;set role anon');
   await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n?id(n):'']);
   await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({aal,session_id:id((n||0)+100)})]);
  };
  const mine=async()=>(await db.query('select my_account_verification() r')).rows[0].r;
  const submit=async(name='Persona Prueba',number='123456789',date='2005-01-01',consent=true)=>(await db.query('select submit_account_verification($1,$2,$3,$4) r',[name,number,date,consent])).rows[0].r;
  const list=async(status='pending')=>(await db.query('select staff_account_verifications($1,1) r',[status])).rows[0].r;
  const review=(n,rev,decision='approved',note='Datos comprobados manualmente')=>db.query('select staff_review_account_verification($1,$2,$3,$4)',[id(n),rev,decision,note]);
  const badge=async(n)=>(await db.query('select account_is_verified($1) r',[id(n)])).rows[0].r;
  await t.test('unverified by default; consent, email, valid name and dates are required',async()=>{
   await asUser(1);assert.equal((await mine()).status,'unverified');assert.equal(await badge(1),false);
   for(const args of [['Persona Prueba','123456789','2005-01-01',false],['Persona Prueba','123456789','2999-01-01'],['Persona Prueba','12.345','2005-01-01'],['Nombre','123456789','2005-01-01'],['Persona Prueba','123456789',null]])await assert.rejects(submit(...args));
   await asUser(5);await assert.rejects(submit(),/Confirma tu correo/);
   await asUser(1);assert.equal((await submit()).status,'pending');assert.equal(await badge(1),false);
   await assert.rejects(submit(),/Ya tienes/);
  });
  await t.test('no direct reads/writes, no cross-user private data, no anonymous private RPCs',async()=>{
   await asUser(2);assert.equal((await mine()).status,'unverified');
   await assert.rejects(db.exec('select * from account_verifications'),/permission denied/);
   await assert.rejects(db.exec("update account_verifications set status='approved'"),/permission denied/);
   await assert.rejects(list(),/Acceso no autorizado/);await assert.rejects(review(1,1),/Acceso no autorizado/);
   await asUser(null);await assert.rejects(mine(),/permission denied/);await assert.rejects(submit(),/permission denied/);assert.equal(await badge(1),false);
  });
  await t.test('review requires users permission, MFA and an active staff session',async()=>{
   await asUser(4);await assert.rejects(list(),/Acceso no autorizado/);
   await asUser(3,'aal1');await assert.rejects(review(1,1),/Acceso no autorizado/);
   await asUser(3);assert.equal((await list()).total,1);
   await db.exec('reset role');await db.query('update staff_sessions set revoked_at=now() where user_id=$1',[id(3)]);
   await asUser(3);await assert.rejects(list(),/Acceso no autorizado/);
   await db.exec('reset role');await db.query('update staff_sessions set revoked_at=null where user_id=$1',[id(3)]);
   await asUser(3);await submit('Administrador Prueba','987654321');await assert.rejects(review(3,1),/propia cuenta/);
  });
  await t.test('approval, stale decisions and duplicate cedulas are controlled by the server',async()=>{
   await asUser(3);await assert.rejects(review(1,1,'approved','corto'),/motivo/);
   await review(1,1);assert.equal(await badge(1),true);await assert.rejects(review(1,1),/solicitud cambió/);
   await asUser(1);assert.equal((await mine()).status,'approved');await assert.rejects(submit(),/Ya tienes/);
   await asUser(2);await submit();await asUser(3);await assert.rejects(review(2,1),/ya tiene una cuenta/);
   await asUser(2);assert.equal((await mine()).status,'pending');
  });
  await t.test('revocation removes the badge, rejections can be corrected, and history omits identity data',async()=>{
   await asUser(3);await review(1,2,'rejected','Se requiere corregir la información');assert.equal(await badge(1),false);
   await asUser(1);assert.equal((await mine()).review_note,'Se requiere corregir la información');await submit();
   await asUser(3);await assert.rejects(review(1,2),/solicitud cambió/);await review(1,4);
   await db.exec('reset role');await db.query('update usuarios set is_blocked=true where id=$1',[id(1)]);
   assert.equal(await badge(1),false);
   const audit=(await db.query('select * from staff_audit')).rows;assert.equal(audit.length,3);
   assert.ok(audit.every(row=>!JSON.stringify(row).includes('123456789')&&!JSON.stringify(row).includes('Persona Prueba')));
   assert.equal((await db.query("select relrowsecurity from pg_class where relname='account_verifications'")).rows[0].relrowsecurity,true);
  });
  await t.test('approval produces one private bell notice and one email without exposing identity data',async()=>{
   await db.exec('reset role');
   assert.equal((await db.query('select count(*)::int n from email_outbox')).rows[0].n,0,'global email switch remains off');
   assert.equal((await db.query('select count(*)::int n from activity_notifications')).rows[0].n,2,'in-app notices work even with email disabled');
   await db.exec('update email_controls set enabled=true');
   await asUser(3);await review(1,5,'rejected','Retiro de verificación para la prueba');await review(2,1);
   await assert.rejects(review(2,1),/solicitud cambió/);
   await db.exec('reset role');
   const emails=(await db.query('select * from email_outbox')).rows;
   assert.equal(emails.length,1);assert.equal(emails[0].user_id,id(2));assert.equal(emails[0].kind,'account_verified');
   assert.doesNotMatch(emails[0].detail+emails[0].title,/123456789|2005-01-01|Persona Prueba/);
   const notices=(await db.query('select * from activity_notifications where recipient_id=$1',[id(2)])).rows;
   assert.equal(notices.length,1);assert.equal(notices[0].type,'system_notice');assert.ok(notices[0].receipt_id);
   assert.equal(notices[0].title,'Tu cuenta fue verificada');
   await asUser(1);assert.equal((await db.query('select * from activity_notifications where recipient_id=$1',[id(2)])).rows.length,0);
   await asUser(null);
   const profile=(await db.query('select * from usuarios_publicos where id=$1',[id(2)])).rows[0];
   assert.equal(profile.account_verified,true);assert.equal('document_number' in profile,false);assert.equal('issue_date' in profile,false);
   await asUser(3);await review(2,2,'rejected','Retiro de verificación para corregir datos');
   await asUser(2);await submit('Persona Prueba','123456780');
   await db.exec("reset role;update email_controls set events=jsonb_set(events,'{account_verified}','false')");
   await asUser(3);await review(2,4);
   await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from email_outbox')).rows[0].n,1,'event opt-out prevents new email');
   assert.equal((await db.query('select count(*)::int n from activity_notifications where recipient_id=$1',[id(2)])).rows[0].n,2);
  });
  await t.test('shared history preserves earlier decisions and restricts reads to authorized staff',async()=>{
   const history=async(user=null,page=1)=>(await db.query('select staff_account_verification_history($1,$2) r',[user,page])).rows[0].r;
   for(const [n,aal] of [[null,'aal2'],[2,'aal2'],[4,'aal2'],[3,'aal1']]){
    await asUser(n,aal);await assert.rejects(history());
   }
   await asUser(3);const all=await history();assert.equal(all.total,7);
   const account=await history(id(1));assert.equal(account.total,4);
   assert.equal(account.rows.filter(row=>row.decision==='approved').length,2);
   assert.equal(account.rows.filter(row=>row.decision==='rejected'&&row.previous_status==='approved').length,2);
   assert.ok(account.rows.every(row=>row.current_status==='rejected'&&row.actor_id===id(3)&&row.created_at));
   assert.ok(account.rows.every(row=>!('document_number' in row)&&!('issue_date' in row)&&!('review_note' in row)));
   assert.equal((await history(id(1),2)).rows.length,0);await assert.rejects(history(null,0),/Página inválida/);
   await assert.rejects(db.exec('select * from staff_audit'),/permission denied/);
   await db.exec('reset role');await db.query("update staff_accounts set role='master',permissions='{}' where user_id=$1",[id(3)]);
   await asUser(3);assert.equal((await history()).total,7,'superadmin sees the same shared history');
  });
  await t.test('users verification filter composes with existing filters, paginates and permits audited revocation',async()=>{
   const users=async(filters={},page=1,search='')=>(await db.query('select staff_user_verification_page($1,$2,$3) r',[search,page,JSON.stringify(filters)])).rows[0].r;
   for(const [n,aal] of [[null,'aal2'],[2,'aal2'],[4,'aal2'],[3,'aal1']]){
    await asUser(n,aal);await assert.rejects(users({verification:'verified'}));
   }
   await asUser(3);assert.equal((await users()).total,5);assert.equal((await users({verification:'unverified'})).total,4);
   let verified=await users({verification:'verified'});assert.equal(verified.total,1);assert.equal(verified.rows[0].id,id(2));
   assert.ok(!('document_number' in verified.rows[0])&&!('issue_date' in verified.rows[0]));
   await assert.rejects(users({verification:'forged'}),/Filtro/);
   await db.exec('reset role');
   await db.query("update usuarios set ciudad='Bogotá',localidad='Suba',movil='3001112233' where id=$1",[id(2)]);
   await db.query('insert into staff_publication_history values($1,$2)',[id(80),id(2)]);
   await db.query('insert into staff_publication_reports values($1)',[id(80)]);
   await db.query("update staff_accounts set role='admin',permissions='{users}' where user_id=$1",[id(3)]);
   await asUser(3);
   assert.equal((await users({verification:'verified',city:'Bogotá',locality:'Suba',state:'active',reported:'yes'},1,'3001112233')).total,1);
   assert.equal((await users({verification:'verified',city:'Otra'})).total,0);
   await review(2,verified.rows[0].verification_revision,'rejected','Verificación retirada por error comprobado');
   assert.equal((await users({verification:'verified'})).total,0);assert.equal(await badge(2),false);
   await assert.rejects(review(2,verified.rows[0].verification_revision,'rejected','Otra corrección del mismo error'),/solicitud cambió/);
   const decisions=(await db.query('select staff_account_verification_history($1,1) r',[id(2)])).rows[0].r;
   assert.equal(decisions.rows.filter(row=>row.decision==='approved').length,2);
   assert.equal(decisions.rows.filter(row=>row.previous_status==='approved'&&row.decision==='rejected').length,2);
   await db.exec('reset role');
   for(let n=21;n<=45;n++){
    await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'paging@example.com',now())",[id(n)]);
    await db.query("insert into usuarios(id,nombre) values($1,'Lista paginada')",[id(n)]);
    await db.query("insert into account_verifications(user_id,full_name,document_number,issue_date,status) values($1,'Persona Prueba',$2,'2005-01-01','approved')",[id(n),String(900000000+n)]);
   }
   await asUser(3);const first=await users({verification:'verified'}),second=await users({verification:'verified'},2);
   assert.equal(first.total,25);assert.equal(first.rows.length,20);assert.equal(second.rows.length,5);assert.equal(second.pageCount,2);
   assert.equal(new Set([...first.rows,...second.rows].map(row=>row.id)).size,25);
  });
 }finally{await db.close();}
});
