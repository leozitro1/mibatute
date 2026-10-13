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
  assert.equal((await call(checkout,'POST',{credits:999})).status,401);
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
    await asUser(uid);const production=await create(5,'prod');
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
