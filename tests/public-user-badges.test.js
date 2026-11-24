import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const a='11111111-1111-1111-1111-111111111111',b='22222222-2222-2222-2222-222222222222';

test('public badges separate registration from manual verification and never reveal seller data',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;
   create table usuarios(id uuid primary key,nombre text,ciudad text,localidad text,foto_url text,is_blocked boolean,bloqueado boolean,ban_until timestamptz);
   create table seller_registrations(user_id uuid primary key,consent_version text,document_number text,notification_address text,phone text);
   create table account_verifications(user_id uuid,status text);
   revoke all on seller_registrations,account_verifications,usuarios from anon,authenticated;
   grant usage on schema auth,public to anon,authenticated;
   insert into usuarios(id,nombre,foto_url) values('${a}','Alice','private-photo'),('${b}','Bob','private-photo');
  `);
  const verification=await readFile(new URL('../supabase/migrations/2026-11-04-account-verification.sql',import.meta.url),'utf8');
  const start=verification.indexOf('create or replace function public.account_is_verified(');
  await db.exec(verification.slice(start,verification.indexOf('$$;',start)+3));
  const view=await readFile(new URL('../supabase/migrations/2026-11-10-private-profile-photos.sql',import.meta.url),'utf8');
  await db.exec(view);await db.exec('grant select on usuarios_publicos to anon,authenticated');
  const sql=await readFile(new URL('../supabase/migrations/2026-11-24-public-user-badges.sql',import.meta.url),'utf8');
  await db.exec(sql);await db.exec(sql);
  await db.query("insert into seller_registrations values($1,'seller-2026-11-10.1','secret-document','secret-address','secret-phone')",[a]);
  await db.query("insert into account_verifications values($1,'approved')",[b]);
  await db.exec('set role anon');
  const badges=async id=>(await db.query('select account_public_badges($1) as value',[id])).rows[0].value;
  assert.deepEqual(await badges(a),{account_verified:false,seller_registered:true});
  assert.deepEqual(await badges(b),{account_verified:true,seller_registered:false});
  assert.deepEqual(await badges(null),{account_verified:false,seller_registered:false});
  const rows=(await db.query('select * from usuarios_publicos order by id')).rows;
  assert.equal(rows[0].seller_registered,true);assert.equal(rows[0].foto_url,null);
  assert.ok(rows.every(row=>!('document_number'in row)&&!('notification_address'in row)&&!('phone'in row)));
  await assert.rejects(db.query('select * from seller_registrations'),{code:'42501'});
  await db.exec('reset role');await db.query('update usuarios set is_blocked=true where id=$1',[a]);
  await db.exec('set role authenticated');
  assert.equal((await badges(a)).seller_registered,false);
  await db.exec('reset role');await db.query("update usuarios set is_blocked=false where id=$1",[a]);
  await db.query("update seller_registrations set consent_version='outdated' where user_id=$1",[a]);
  assert.equal((await badges(a)).seller_registered,false);
 }finally{await db.close();}
});
