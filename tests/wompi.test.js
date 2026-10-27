import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { wompiConfig, checkoutUrl, sha256, verifyWompiEvent } from '../server/wompi.js';
import checkout from '../api/wompi-checkout.js';
import events from '../api/wompi-events.js';

const configEnv = {
  WOMPI_ENABLED:'true', WOMPI_ENVIRONMENT:'test', WOMPI_PUBLIC_KEY:'pub_test_fixture', WOMPI_PRIVATE_KEY:'prv_test_fixture',
  WOMPI_INTEGRITY_SECRET:'test_integrity_fixture', WOMPI_EVENTS_SECRET:'test_events_fixture',
  SUPABASE_URL:'https://fixture.supabase.co', SUPABASE_ANON_KEY:'fixture-anon', SUPABASE_SERVICE_ROLE_KEY:'fixture-service',
};
const makeEvent = () => {
  const data = { transaction:{id:'transaction-1',status:'APPROVED',amount_in_cents:200000,reference:'untrusted-reference',currency:'USD'} };
  const timestamp=1234567890;
  return { event:'transaction.updated',environment:'test',data,timestamp,
    signature:{properties:['transaction.id','transaction.status','transaction.amount_in_cents'],
      checksum:sha256(`transaction-1APPROVED200000${timestamp}${configEnv.WOMPI_EVENTS_SECRET}`)} };
};
const call = async (handler,method,body) => {
  let status,result;
  const headers={};
  await handler({method,body,headers:{},url:'/api/wompi-checkout'},
    {setHeader(k,v){headers[k]=v;},end(value){status=this.statusCode;result=JSON.parse(value);}});
  return {status,result,headers};
};

test('Wompi is opt-in, separates environments and never exposes secrets in checkout URLs', () => {
  assert.equal(wompiConfig({...configEnv,WOMPI_ENABLED:undefined}).configured,false);
  assert.equal(wompiConfig({...configEnv,WOMPI_ENABLED:'false'}).configured,false);
  assert.equal(wompiConfig(configEnv).configured,true);
  assert.equal(wompiConfig({...configEnv,WOMPI_ENVIRONMENT:'prod'}).configured,false);
  const order={reference:'MB-fixture',amount_in_cents:200000,currency:'COP',expires_at:'2026-10-14T00:00:00Z'};
  const url=new URL(checkoutUrl(order,wompiConfig(configEnv)));
  assert.equal(url.origin,'https://checkout.wompi.co');
  assert.equal(url.searchParams.get('amount-in-cents'),'200000');
  assert.equal(url.searchParams.get('signature:integrity'),sha256(`MB-fixture200000COP${order.expires_at}${configEnv.WOMPI_INTEGRITY_SECRET}`));
  for(const key of ['WOMPI_PRIVATE_KEY','WOMPI_INTEGRITY_SECRET','WOMPI_EVENTS_SECRET','SUPABASE_SERVICE_ROLE_KEY']) {
    assert.equal(url.href.includes(configEnv[key]),false);
  }
  const event=makeEvent();
  assert.equal(verifyWompiEvent(event,configEnv.WOMPI_EVENTS_SECRET),true);
  event.data.transaction.amount_in_cents=100000;
  assert.equal(verifyWompiEvent(event,configEnv.WOMPI_EVENTS_SECRET),false);
  assert.equal(verifyWompiEvent({signature:{properties:['__proto__']},timestamp:0},'secret'),false);
});

test('disabled payment routes do no network work; signed webhooks use canonical server-side payment data', async t => {
  const previous=Object.fromEntries(Object.keys(configEnv).map(key=>[key,process.env[key]]));
  Object.assign(process.env,configEnv);
  t.after(()=>{for(const [key,value] of Object.entries(previous)) {if(value===undefined)delete process.env[key];else process.env[key]=value;}});
  const calls=[];
  t.mock.method(globalThis,'fetch',async(input,options)=>{
    const url=String(input);calls.push({url,options});
    if(url.includes('/transactions/')) {
      return new Response(JSON.stringify({data:{id:'transaction-1',status:'APPROVED',amount_in_cents:200000,currency:'COP',reference:'MB-canonical'}}),{status:200});
    }
    if(url.endsWith('/rpc/credit_wompi_topup')) return new Response(JSON.stringify({credited:true,balance:2}),{status:200});
    throw new Error('Unexpected network request');
  });
  process.env.WOMPI_ENABLED='false';
  const disabled=await call(checkout,'GET');
  assert.equal(disabled.status,200);assert.equal(disabled.result.configured,false);
  assert.equal(disabled.headers['Cache-Control'],'no-store');
  assert.equal((await call(checkout,'POST',{credits:2})).status,503);
  assert.equal((await call(events,'POST',makeEvent())).status,503);
  assert.equal(calls.length,0);
  process.env.WOMPI_ENABLED='true';
  assert.equal((await call(events,'POST',{...makeEvent(),environment:'prod'})).status,401);
  assert.equal((await call(events,'POST',{...makeEvent(),signature:{checksum:'bad'}})).status,401);
  assert.equal((await call(checkout,'POST',{credits:999})).status,503);
  assert.equal(calls.length,0);
  assert.equal((await call(events,'POST',makeEvent())).status,200);
  assert.equal(calls.length,2);
  assert.equal(calls[0].options.headers.Authorization,`Bearer ${configEnv.WOMPI_PRIVATE_KEY}`);
  const settlement=JSON.parse(calls[1].options.body);
  assert.equal(settlement.p_reference,'MB-canonical');assert.equal(settlement.p_currency,'COP');
  assert.equal(settlement.p_environment,'test');
});

test('Wompi ledger protects balances, packages, ownership, environment and duplicate payments', async () => {
  const db=new PGlite();
  const uid='11111111-1111-1111-1111-111111111111';
  const other='22222222-2222-2222-2222-222222222222';
  const migration=await readFile(new URL('../supabase/migrations/2026-10-13-wompi-topups.sql',import.meta.url),'utf8');
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
      create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
      create table auth.users(id uuid primary key,email_confirmed_at timestamptz default now());
      create table public.usuarios(id uuid,is_blocked boolean default false,bloqueado boolean default false);
      create table public.cupos(usuario_id uuid primary key,saldo integer,updated_at timestamptz);
      create table public.cupos_historial(usuario_id uuid,cantidad integer,concepto text,referencia_id uuid);
      grant usage on schema public,auth to authenticated,anon,service_role;
      insert into auth.users(id) values('${uid}'),('${other}');insert into public.usuarios(id) select id from auth.users;`);
    await db.exec(migration);
    const asUser=async user=>{await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);};
    const create=async(credits=2,env='test')=>(await db.query('select create_wompi_topup($1,$2) as result',[credits,env])).rows[0].result;
    const settle=async(order,tx='tx-1',amount=order.amount_in_cents,env=order.environment)=>
      (await db.query("select credit_wompi_topup($1,$2,$3,'COP',$4) as result",[order.reference,tx,amount,env])).rows[0].result;
    await asUser(uid);
    await assert.rejects(create(999));
    const sandbox=await create();
    assert.equal(sandbox.amount_in_cents,200000);assert.equal((await create()).id,sandbox.id);
    await assert.rejects(settle(sandbox),/permission/);
    await assert.rejects(db.query("update wompi_topups set state='approved'"),/permission/);
    await asUser(other);
    assert.equal((await db.query('select * from wompi_topups')).rows.length,0);
    const status=(await db.query("select wompi_topup_status('test',$1) as result",[sandbox.reference])).rows[0].result;
    assert.equal(status.order,null);
    await db.exec('reset role;set role service_role');
    await assert.rejects(settle(sandbox,'tx-1',1));await assert.rejects(settle(sandbox,'tx-1',200000,'prod'));
    await settle(sandbox);
    await db.exec('reset role');
    assert.equal((await db.query('select * from cupos')).rows.length,0,'Sandbox must not grant cloud credits');
    await asUser(uid);
    const history=await db.query("select reference,amount_in_cents,credits,state,credited_at from wompi_topups where environment='test' order by created_at desc,id desc limit 11");
    assert.equal(history.rows.length,1);assert.equal(history.rows[0].reference,sandbox.reference);
    assert.equal(history.rows[0].state,'approved');assert.equal(history.rows[0].amount_in_cents,200000);
    assert.ok(history.rows[0].credited_at);
    const production=await create(5,'prod');
    await db.exec('reset role;set role service_role');
    assert.equal((await settle(production,'tx-prod')).balance,5);
    assert.equal((await settle(production,'tx-prod')).credited,false);
    await assert.rejects(settle(production,'different-tx'));
    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int as count from cupos_historial')).rows[0].count,1);
    await db.exec(migration);await asUser(uid);
    assert.equal((await create(5,'prod')).state,'pending');
    await db.exec(`reset role;update usuarios set is_blocked=true where id='${uid}';`);await asUser(uid);
    await assert.rejects(create());
  } finally {await db.close();}
});

test('sandbox checkout requires a loopback database and return origin; production stays off',()=>{
 const local={...configEnv,WOMPI_LOCAL_SANDBOX:'true',SUPABASE_URL:'http://127.0.0.1:54321'};
 assert.equal(wompiConfig(local).checkoutEnabled,true);
 assert.equal(wompiConfig({...local,SUPABASE_URL:'https://fixture.supabase.co'}).checkoutEnabled,false);
 assert.equal(wompiConfig({...local,WOMPI_RETURN_ORIGIN:'https://external.example'}).checkoutEnabled,false);
 assert.equal(wompiConfig({...local,WOMPI_ENVIRONMENT:'prod'}).checkoutEnabled,false);
 const url=new URL(checkoutUrl({reference:'MB-test',amount_in_cents:250000,currency:'COP',expires_at:'2030-01-01T00:00:00Z'},wompiConfig(local)));
 assert.equal(url.searchParams.has('redirect-url'),false);
 const productionUrl=new URL(checkoutUrl({reference:'MB-test',amount_in_cents:250000,currency:'COP',expires_at:'2026-11-01T00:00:00Z'},{...wompiConfig(local),localSandbox:false,returnOrigin:'https://www.mibatute.com'}));
 assert.equal(new URL(productionUrl.searchParams.get('redirect-url')).origin,'https://www.mibatute.com');
});

test('updated packages quote exact totals and preserve older pending order amounts',async()=>{
 const db=new PGlite();const uid='11111111-1111-1111-1111-111111111111';
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
   create function auth.uid() returns uuid language sql as $$select '${uid}'::uuid$$;
   create table auth.users(id uuid primary key,email_confirmed_at timestamptz default now());
   create table usuarios(id uuid,is_blocked boolean default false,bloqueado boolean default false);
   create table cupos(usuario_id uuid primary key,saldo integer,updated_at timestamptz);
   create table cupos_historial(usuario_id uuid,cantidad integer,concepto text,referencia_id uuid);
   insert into auth.users(id) values('${uid}');insert into usuarios(id) values('${uid}');`);
  await db.exec(await readFile(new URL('../supabase/migrations/2026-10-13-wompi-topups.sql',import.meta.url),'utf8'));
  const create=async amount=>(await db.query("select create_wompi_topup($1,'test') result",[amount])).rows[0].result;
  const legacy=await create(5);assert.equal(legacy.amount_in_cents,500000);
  const pricing=await readFile(new URL('../supabase/migrations/2026-10-27-wompi-pack-pricing.sql',import.meta.url),'utf8');await db.exec(pricing);await db.exec(pricing);
  for(const [credits,amount] of [[1,250000],[3,700000],[5,1100000]]){
   const order=await create(credits);assert.equal(order.amount_in_cents,amount);assert.equal((await create(credits)).id,order.id);
  }
  assert.notEqual((await create(5)).id,legacy.id);
  assert.equal((await db.query('select amount_in_cents from wompi_topups where id=$1',[legacy.id])).rows[0].amount_in_cents,500000);
  await assert.rejects(create(2));await assert.rejects(create(10));
  await db.exec("select set_config('app.settings.wompi_test_credits','on',false)");
  const order=await create(3);
  const declined=await create(1);
  await assert.rejects(db.query("select wompi_record_failure($1,'declined-tx','APPROVED','test')",[declined.reference]));
  await db.query("select wompi_record_failure($1,'declined-tx','DECLINED','test')",[declined.reference]);
  assert.notEqual((await create(1)).reference,declined.reference);
  const settle=async()=>(await db.query("select credit_wompi_topup($1,'sandbox-local',700000,'COP','test') result",[order.reference])).rows[0].result;
  assert.equal((await settle()).balance,3);assert.equal((await settle()).credited,false);
  assert.equal((await db.query('select count(*) n from cupos_historial')).rows[0].n,1);
 }finally{await db.close();}
});

test('return verification requires the owner, canonical amount/currency/reference and approval before crediting',async t=>{
 const local={...configEnv,WOMPI_LOCAL_SANDBOX:'true',SUPABASE_URL:'http://127.0.0.1:54321'};
 const previous=Object.fromEntries(Object.keys(local).map(key=>[key,process.env[key]]));Object.assign(process.env,local);
 t.after(()=>{for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
 const reference='MB-11111111-1111-1111-1111-111111111111';
 const order={id:'order',reference,credits:1,amount_in_cents:250000,currency:'COP',state:'pending',expires_at:'2030-01-01T00:00:00Z'};
 let owner=true,state='APPROVED',amount=250000,credited=0,providerCalls=0;
 t.mock.method(globalThis,'fetch',async(input,options)=>{
  const url=String(input);
  if(url.includes('/auth/v1/user'))return new Response(JSON.stringify({id:'11111111-1111-1111-1111-111111111111'}),{status:200});
  if(url.endsWith('/rpc/wompi_topup_status'))return new Response(JSON.stringify({order:owner?{...order,state:credited?'approved':'pending'}:null,balance:credited}),{status:200});
  if(url.includes('/transactions/')){providerCalls++;return new Response(JSON.stringify({data:{id:'tx-1',reference,currency:'COP',amount_in_cents:amount,status:state}}),{status:200});}
  if(url.endsWith('/rpc/wompi_record_failure'))return new Response('null',{status:200});
  if(url.endsWith('/rpc/credit_wompi_topup')){credited++;assert.equal(JSON.parse(options.body).p_amount,250000);return new Response('{"credited":true}',{status:200});}
  throw new Error('Unexpected request');
 });
 const check=async()=>{
  let status,body;await checkout({method:'GET',headers:{authorization:'Bearer fixture-token'},url:`/api/wompi-checkout?reference=${reference}&transaction_id=tx-1`},{setHeader(){},end(value){status=this.statusCode;body=JSON.parse(value);}});return {status,body};
 };
 owner=false;assert.equal((await check()).status,404);assert.equal(providerCalls,0);
 owner=true;amount=1;assert.equal((await check()).status,409);assert.equal(credited,0);
 amount=250000;state='PENDING';assert.equal((await check()).body.paymentStatus,'PENDING');assert.equal(credited,0);
 state='DECLINED';assert.equal((await check()).body.paymentStatus,'DECLINED');assert.equal(credited,0);
 state='APPROVED';assert.equal((await check()).body.order.state,'approved');assert.equal(credited,1);
});


test('local widget accepts only signed unexpired Sandbox options without redirects',async()=>{
 const {sandboxWidgetOptions}=await import('../src/components/wompiWidget.js');
 const config=wompiConfig({...configEnv,WOMPI_LOCAL_SANDBOX:'true',SUPABASE_URL:'http://127.0.0.1:54321'});
 const order={reference:'MB-widget-test',amount_in_cents:700000,currency:'COP',expires_at:'2099-01-01T00:00:00Z'};
 const url=new URL(checkoutUrl(order,config));url.searchParams.set('redirect-url','http://127.0.0.1:5174');
 const options=sandboxWidgetOptions(url.href);
 assert.equal(options.amountInCents,700000);assert.equal(options.reference,order.reference);
 assert.equal(Object.hasOwn(options,'redirectUrl'),false);
 assert.equal(Object.hasOwn(options,'privateKey'),false);
 assert.throws(()=>sandboxWidgetOptions(url.href.replace('checkout.wompi.co','other.example')));
 url.searchParams.set('public-key','pub_prod_fixture');assert.throws(()=>sandboxWidgetOptions(url.href));
 url.searchParams.set('public-key',config.publicKey);url.searchParams.set('expiration-time','2000-01-01');assert.throws(()=>sandboxWidgetOptions(url.href));
});
