import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createMarketMetrics,searchMetric } from '../src/analytics/metrics.js';

test('analytics discards contact-like searches and keeps catalog dimensions separate from pagination',()=>{
  const filters={search:'  BICICLETA   de Ruta ',city:'Bogotá',locality:'Todas',category:'Todo',page:2};
  assert.deepEqual(searchMetric(filters,0),{kind:'search',term:'bicicleta de ruta',city:'Bogotá',locality:'',category:'',empty:true});
  for(const term of ['3101234567','persona@gmail.com','https://sitio.com','hola <script>','uno dos tres cuatro cinco seis siete'])assert.equal(searchMetric({...filters,search:term},1),null);
  assert.equal(searchMetric({...filters,search:''},1).term,'');
  assert.equal(searchMetric({...filters,search:'iPhone 15'},1).term,'iphone 15');
  assert.equal(searchMetric({...filters,search:'telefono 300 123 4567'},1),null);
});

test('analytics batches only pending work, caps batches and memory, deduplicates queries and bounds retries',async()=>{
  const timers=new Map(),sent=[];let next=0;
  const queue=createMarketMetrics({visit:'visit',send:async payload=>sent.push(payload),schedule:callback=>{timers.set(++next,callback);return next;},cancel:id=>timers.delete(id)});
  assert.equal(timers.size,0);
  const event=searchMetric({search:'bicicleta',city:'Bogotá'},2);
  queue.record(event);queue.record({...event,empty:true});assert.equal(timers.size,1);
  await queue.flush();assert.equal(sent.length,1);assert.equal(sent[0].p_events.length,1);assert.equal(timers.size,0);
  await queue.flush();assert.equal(sent.length,1);
  for(let index=0;index<250;index++)queue.record({kind:'view',id:String(index)});
  while(timers.size||sent.at(-1)?.p_events.length===20){await queue.flush();if(timers.size===0)break;}
  assert.equal(sent.flatMap(row=>row.p_events).length,200);assert.ok(sent.every(row=>row.p_events.length<=20));
  let attempts=0;const failed=createMarketMetrics({visit:'visit',send:async()=>{attempts++;throw new Error('offline');},schedule:()=>1,cancel:()=>{}});
  failed.record(event);for(let index=0;index<5;index++)await failed.flush();assert.equal(attempts,3);
});

test('market metrics enforce private aggregates, bounded ingestion, geographic rankings and dated sales',async()=>{
  const db=new PGlite();
  const migration=await readFile(new URL('../supabase/migrations/2026-10-16-market-analytics.sql',import.meta.url),'utf8');
  const article='10000000-0000-4000-8000-000000000001',owner='10000000-0000-4000-8000-000000000002',donation='10000000-0000-4000-8000-000000000003';
  const visit='20000000-0000-4000-8000-000000000001';
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
      create function auth.uid() returns uuid language sql as 'select null::uuid';create function auth.jwt() returns jsonb language sql as 'select ''{}''::jsonb';
      create function public.staff_require(p_permission text) returns void language plpgsql as $$begin
        if p_permission<>'team' or current_setting('test.master',true) is distinct from 'true' then raise exception 'No autorizado' using errcode='42501';end if;end;$$;
      create table public.staff_sessions(session_id uuid,user_id uuid,last_seen_at timestamptz);
      create table public.usuarios(id uuid primary key,nombre text);
      create table public.articulos(id uuid primary key,title text,category text,categoria text,status text,review_status text,city text,locality text,created_at timestamptz default now(),delivered_at timestamptz);
      create table public.staff_publication_history(article_id uuid primary key,owner_id uuid,title text,mode text,city text,locality text,created_at timestamptz default now(),delivered_ever boolean default false,deleted_at timestamptz);
      insert into usuarios values('${owner}','Vendedor de prueba');
      insert into articulos(id,title,category,status,review_status,city,locality) values('${article}','Bicicleta','Deportes','disponible','approved','Bogotá','Suba');
      insert into staff_publication_history(article_id,owner_id,title,mode,city,locality) values('${article}','${owner}','Bicicleta','venta','Bogotá','Suba');
      grant usage on schema public,auth to anon,authenticated;`);
    await db.exec(migration);
    const record=async(events,source=visit)=>db.query('select public.record_market_metrics($1,$2::jsonb)',[source,JSON.stringify(events)]);
    const dashboard=async(days=7,city='',locality='',category='')=>(await db.query('select public.staff_market_dashboard($1,$2,$3,$4) as result',[days,city,locality,category])).rows[0].result;
    await db.exec('set role anon');
    const search={kind:'search',term:'BICICLETA',city:'Bogotá',locality:'Suba',category:'Deportes',empty:false};
    await record([search,search,{...search,empty:true},{kind:'view',id:article},{kind:'view',id:'invalid'}]);
    await assert.rejects(db.query('select * from market_daily_metrics'),/permission/);
    await assert.rejects(db.query('select * from market_metric_events'),/permission/);
    await assert.rejects(db.query('select * from market_metrics_settings'),/permission/);
    await assert.rejects(dashboard(),/permission/);
    await assert.rejects(record(Array(21).fill(search)),/Lote/);
    await record([{...search,term:'correo@example.com'},{...search,term:'3101234567'},{...search,city:'Bogotá 123'},{kind:'view',id:'------------------------------------'}]);
    await record([{...search,term:'casco',empty:true},{...search,term:'',empty:false}]);
    await record([{...search,city:'Medellín',locality:'El Poblado'}],'20000000-0000-4000-8000-000000000002');
    await db.exec('reset role;set role authenticated');await assert.rejects(dashboard(),/autorizado/);
    await db.exec("reset role;select set_config('test.master','true',false);set role authenticated");
    let data=await dashboard(7,'Bogotá','Suba','Deportes');
    assert.equal(data.totals.searches,2);assert.equal(data.totals.consultations,3);assert.equal(data.totals.views,1);assert.equal(data.totals.no_results,1);
    assert.equal(data.localities[0].label,'Suba');assert.equal(data.localities[0].value,3);assert.equal(data.categories[0].label,'Deportes');
    assert.equal(data.articles[0].label,'Bicicleta');assert.deepEqual(data.searches.map(row=>row.label),['bicicleta','casco']);
    assert.equal(data.trend.length,7);assert.equal(data.trend.at(-1).searches,2);
    assert.equal((await dashboard(7,'Medellín')).totals.searches,1);assert.equal((await dashboard(7,'Bogotá','','Hogar')).totals.searches,0);
    await assert.rejects(dashboard(1000),/Filtros/);await assert.rejects(dashboard(7,'','Suba'),/Filtros/);
    await db.exec(`reset role;update articulos set status='entregado',delivered_at=now() where id='${article}';
      update staff_publication_history set delivered_ever=true where article_id='${article}';
      insert into articulos(id,title,category,status,review_status,city,locality) values('${donation}','Casco','Deportes','disponible','approved','Bogotá','Suba');
      insert into staff_publication_history(article_id,owner_id,title,mode,city,locality) values('${donation}','${owner}','Casco','donacion','Bogotá','Suba');
      update articulos set status='entregado',delivered_at=now() where id='${donation}';`);
    data=await dashboard(7,'Bogotá','Suba','Deportes');assert.equal(data.totals.sales,1);assert.equal(data.totals.donations,1);assert.equal(data.sellers[0].value,1);assert.equal(data.sellers[0].label,'Vendedor de prueba');
    const first=(await db.query('select first_delivered_at from staff_publication_history where article_id=$1',[article])).rows[0].first_delivered_at;
    await db.exec(`update articulos set status='reservado' where id='${article}';update articulos set status='entregado',delivered_at=now()+interval '1 day' where id='${article}';`);
    assert.equal((await db.query('select first_delivered_at from staff_publication_history where article_id=$1',[article])).rows[0].first_delivered_at.toISOString(),first.toISOString());
    await db.exec(`delete from articulos where id='${article}';update staff_publication_history set deleted_at=now() where article_id='${article}';`);
    assert.equal((await dashboard(7,'Bogotá','Suba','Deportes')).totals.sales,1,'Category and sale history survive article deletion');
    await db.exec(migration);assert.equal((await dashboard()).totals.sales,1,'Reapplying migration preserves counts and start date');
    await db.exec('set role anon');
    for(let batch=0;batch<11;batch++)await record(Array.from({length:20},(_,index)=>({...search,locality:`Zona ${String.fromCharCode(65+batch)}${String.fromCharCode(65+index)}`})));
    await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from market_metric_events where visit_id=$1',[visit])).rows[0].n,200);
  } finally {await db.close();}
});
