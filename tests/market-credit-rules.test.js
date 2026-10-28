import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { commitPublication, publicationStatus, publicationQuote } from '../src/supabase/publicationCredits.js';
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const owner=id(1), buyer=id(2), other=id(3);

test('daily donation quota and paid publication rules are enforced by PostgreSQL', async t => {
 const db = new PGlite();
 try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
      create table auth.users(id uuid primary key,email_confirmed_at timestamptz default now());
      create table public.usuarios(id uuid,is_blocked bool default false,bloqueado bool default false);
      create table public.articulos(id uuid primary key,owner_id uuid,usuario_id uuid generated always as(owner_id) stored,mode text default 'donacion',
        estado text default 'disponible',status text default 'disponible',ganador_id uuid,winner_id uuid,recipient_id uuid,buyer_id uuid,
        title text,city text,locality text,price numeric,image_url text,imagen_url_principal text,imagenes jsonb,
        delivered_at timestamptz,updated_at timestamptz,created_at timestamptz default now(),is_featured bool default false);
      create table public.postulaciones(id uuid primary key default gen_random_uuid(),articulo_id uuid references public.articulos on delete cascade,
        usuario_id uuid,justificacion text,created_at timestamptz default now(),unique(articulo_id,usuario_id));
      create table public.postulacion_historial(id uuid primary key default gen_random_uuid(),usuario_id uuid,articulo_id uuid,created_at timestamptz default now());
      create table public.postulaciones_rechazadas(id uuid primary key default gen_random_uuid(),usuario_id uuid,articulo_id uuid,created_at timestamptz default now(),unique(articulo_id,usuario_id));
      create table public.cupos(usuario_id uuid primary key,saldo int default 0,updated_at timestamptz);
      create table public.cupos_historial(usuario_id uuid,cantidad int,concepto text,referencia_id uuid);
      create table public.cupos_extra_donacion(id uuid,usuario_id uuid,created_at timestamptz);
      create table public.chats(id uuid primary key default gen_random_uuid(),articulo_id uuid,buyer_id uuid,seller_id uuid,owner_id uuid,usuario_id uuid,status text,updated_at timestamptz,unique(articulo_id,buyer_id));
      create table public.chat_messages(chat_id uuid,sender_id uuid);
      create table public.articulo_imagenes(id uuid,articulo_id uuid,url text,position int);
      alter table public.articulos enable row level security;
      create policy read_articles on public.articulos for select using(true);
      create policy edit_owned on public.articulos for update using(owner_id=auth.uid());
      create policy delete_owned on public.articulos for delete using(owner_id=auth.uid());
      alter table public.postulaciones enable row level security;
      create policy read_posts on public.postulaciones for select using(usuario_id=auth.uid() or exists(select 1 from public.articulos a where a.id=articulo_id and a.owner_id=auth.uid()));
      create policy delete_posts on public.postulaciones for delete using(usuario_id=auth.uid() or exists(select 1 from public.articulos a where a.id=articulo_id and a.owner_id=auth.uid()));
      grant usage on schema public,auth to authenticated;
      grant select,insert,update,delete on all tables in schema public to authenticated;
      insert into auth.users(id) values('${owner}'),('${buyer}'),('${other}');
      insert into public.usuarios(id) select id from auth.users;
    `);

  await db.exec(`alter table public.usuarios add column nombre text;
    alter table public.articulos add column owner_name text;
    alter table public.articulos add column imagen_url text;
    alter table public.articulos alter column imagenes type text[] using '{}'::text[];
    create policy insert_owned on public.articulos for insert with check(owner_id=auth.uid());
    alter table public.articulos add column description text;
    alter table public.articulos add column category text;
    alter table public.articulos add column subcategory text;
    alter table public.articulos add column subcategoria text;
    alter table public.articulos add column estado_producto smallint;`);
  const migration = name => readFile(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),'utf8');
  for(const name of ['2026-10-01-donation-decisions','2026-10-13-donation-credits',
    '2026-10-01-publication-limit','2026-10-20-donation-daily-quota','2026-10-20-publication-credits','2026-10-20-publish-with-highlight']) await db.exec(await migration(name));
  const asUser=async uid=>{await db.exec('reset role; set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);};
  const reset=async()=>{
    await db.exec('reset role; truncate public.article_publication_credits,public.donation_application_credits,public.postulaciones,public.postulacion_historial,public.postulaciones_rechazadas,public.cupos_historial,public.cupos,public.articulos cascade');
    await db.query('insert into public.cupos values($1,5,null),($2,5,null)',[owner,buyer]);
    await asUser(owner);
  };
  const payload = mode=>({title:'Artículo de prueba',description:'Prueba',mode,price:10000,city:'Bogotá',locality:'Suba',category:'Hogar',subcategory:'Muebles',imagenes:['https://example.com/test.jpg']});
  const publish=async(n,paid=false,extra={})=>(await db.query('select public.publish_article_with_credit($1,$2,$3) as r',[{...payload('venta'),...extra},id(n),paid])).rows[0].r;
  const sales=async()=>(await db.query('select public.sale_publication_status() as r')).rows[0].r;
  const donationStatus=async()=>(await db.query('select public.donation_application_status() as r')).rows[0].r;
  const apply=async(n,paid=false)=>(await db.query('select public.apply_for_donation($1,$2,$3) as r',[id(n),'Necesito este articulo de prueba',paid])).rows[0].r;
  const donationSetup=async()=>{await reset();for(let n=10;n<16;n++)await publish(n,false,{mode:'donacion'});await asUser(buyer);};

  await t.test('three free sales, consent before fourth, one debit, duplicate retries and insufficient funds',async()=>{
    await reset();for(let n=10;n<13;n++)assert.equal((await publish(n)).cost,0);
    assert.equal((await sales()).balance,5);assert.equal((await sales()).active,3);
    assert.equal((await publish(13)).code,'PUBLICATION_CREDIT_REQUIRED');assert.equal((await sales()).active,3);
    const fourth=await publish(13,true);assert.equal(fourth.cost,1);assert.equal(fourth.balance,4);
    const retry=await publish(13,true);assert.equal(retry.alreadyExists,true);assert.equal(retry.balance,4);
    await db.exec('reset role');await db.query('update public.cupos set saldo=0 where usuario_id=$1',[owner]);await asUser(owner);
    assert.equal((await publish(14,true)).code,'INSUFFICIENT_CREDITS');assert.equal((await sales()).active,4);
    assert.equal((await db.query('select * from public.cupos_historial')).rows.length,1);
  });
  await t.test('donations are free; paused and reserved sales occupy slots; completion releases a slot',async()=>{
    await reset();await publish(10);await publish(11);await publish(12);
    await db.query("update public.articulos set status='pausado',estado='pausado' where id=$1",[id(10)]);
    await db.query("update public.articulos set status='reservado',estado='reservado' where id=$1",[id(11)]);
    assert.equal((await sales()).active,3);assert.equal((await publish(13)).code,'PUBLICATION_CREDIT_REQUIRED');
    assert.equal((await publish(14,false,{mode:'donacion'})).cost,0);
    await db.query("update public.articulos set status='entregado',estado='entregado' where id=$1",[id(10)]);
    assert.equal((await publish(15,true)).cost,0);assert.equal((await sales()).balance,5);
  });
  await t.test('direct inserts, mode conversion and reactivation cannot bypass paid consent or forge receipts',async()=>{
    await reset();for(let n=10;n<13;n++)await publish(n);
    await assert.rejects(db.query("insert into public.articulos(id,owner_id,mode) values($1,$2,'venta')",[id(13),owner]),/requiere confirmar/);
    await publish(14,false,{mode:'donacion'});
    await assert.rejects(db.query("update public.articulos set mode='venta' where id=$1",[id(14)]),/requiere confirmar/);
    await assert.rejects(db.query('insert into public.article_publication_credits(article_id,usuario_id,cost) values($1,$2,1)',[id(13),owner]),/permission/);
    await db.query("update public.articulos set status='entregado',estado='entregado' where id=$1",[id(10)]);
    await publish(15);await assert.rejects(db.query("update public.articulos set status='disponible',estado='disponible' where id=$1",[id(10)]),/requiere confirmar/);
  });
  await t.test('failed insert rolls back debit and receipt; deletion does not refund a published sale',async()=>{
    await reset();for(let n=10;n<13;n++)await publish(n);
    await db.exec(`reset role;create function public.reject_test_publication() returns trigger language plpgsql as $$begin if new.title='REJECT' then raise exception 'invalid test article';end if;return new;end;$$;
      create trigger zzz_test_rejection before insert on public.articulos for each row execute function public.reject_test_publication();`);
    await asUser(owner);await assert.rejects(publish(13,true,{title:'REJECT'}),/invalid test article/);
    assert.equal((await sales()).balance,5);assert.equal((await sales()).active,3);
    assert.equal((await publish(13,true)).balance,4);
    await db.query('delete from public.articulos where id=$1',[id(13)]);assert.equal((await sales()).balance,4);
    await assert.rejects(publish(13,true),/eliminada/);
    await assert.rejects(db.query("insert into public.articulos(id,owner_id,mode) values($1,$2,'venta')",[id(13),owner]),/identificador/);
  });
  await t.test('highlight costs one separate credit, direct writes are denied, and retries are free',async()=>{
    await reset();await publish(10,false,{is_featured:true});
    await assert.rejects(db.query('update public.articulos set is_featured=true where id=$1',[id(10)]),/Destacar requiere/);
    const feature=async()=> (await db.query('select public.feature_article($1) as r',[id(10)])).rows[0].r;
    assert.equal((await feature()).balance,4);assert.equal((await feature()).balance,4);
    await db.query('update public.articulos set is_featured=false where id=$1',[id(10)]);
    await assert.rejects(db.query('update public.articulos set is_featured=true where id=$1',[id(10)]),/Destacar requiere/);
    await asUser(buyer);await assert.rejects(feature(),/Solo puedes/);
  });
  await t.test('two free donations then consent, single paid debit, duplicate protection and pending cap',async()=>{
    await donationSetup();assert.equal((await apply(10)).cost,0);assert.equal((await apply(11,true)).cost,0);
    assert.equal((await donationStatus()).freeRemaining,0);assert.equal((await apply(12)).code,'RATE_LIMIT_REACHED');
    const paid=await apply(12,true);assert.equal(paid.cost,1);assert.equal(paid.balance,4);
    assert.equal((await apply(12,true)).alreadyExists,true);assert.equal((await donationStatus()).balance,4);
    assert.equal((await apply(13,true)).code,'PENDING_LIMIT');
  });
  await t.test('withdrawal/rejection never resets free quota; rolling boundary reopens one slot',async()=>{
    await donationSetup();const first=await apply(10);await apply(11);
    await db.query('delete from public.postulaciones where id=$1',[first.id]);
    assert.equal((await apply(12)).code,'RATE_LIMIT_REACHED');
    await db.exec('reset role');await db.query("update public.donation_application_credits set created_at=now()-interval '23 hours 59 minutes' where id=$1",[first.id]);await asUser(buyer);
    assert.equal((await donationStatus()).freeAvailable,false);
    await db.exec('reset role');await db.query("update public.donation_application_credits set created_at=now()-interval '24 hours' where id=$1",[first.id]);await asUser(buyer);
    assert.equal((await donationStatus()).freeRemaining,1);assert.equal((await apply(12)).cost,0);
  });
  await t.test('legacy users with more than two free receipts wait until only one remains in the window',async()=>{
    await donationSetup();const first=await apply(10);const second=await apply(11);
    await db.exec('reset role');
    await db.query("update public.donation_application_credits set created_at=now()-interval '23 hours' where id=$1",[first.id]);
    await db.query("update public.donation_application_credits set created_at=now()-interval '20 hours' where id=$1",[second.id]);
    await db.query("insert into public.donation_application_credits(id,usuario_id,articulo_id,cost,state,created_at) values($1,$2,$3,0,'withdrawn',now()-interval '10 hours')",[id(99),buyer,id(12)]);
    await asUser(buyer);const status=await donationStatus();assert.equal(status.freeUsed,3);assert.equal(status.freeAvailable,false);
    const hours=(Date.parse(status.nextFreeAt)-Date.now())/3600000;
    assert.ok(hours>3.9&&hours<4.1);
  });
  await t.test('paid rejection refunds only once without restoring daily free uses; zero balance and validation rollback',async()=>{
    await donationSetup();await apply(10);await apply(11);const paid=await apply(12,true);
    await asUser(owner);await db.query('delete from public.postulaciones where id=$1',[paid.id]);await asUser(buyer);
    assert.equal((await donationStatus()).balance,5);assert.equal((await donationStatus()).freeRemaining,0);
    await db.exec('reset role');await db.query('update public.cupos set saldo=0 where usuario_id=$1',[buyer]);await asUser(buyer);
    assert.equal((await apply(13,true)).code,'INSUFFICIENT_CREDITS');
    await db.exec('reset role');await db.query('update public.cupos set saldo=1 where usuario_id=$1',[buyer]);await db.query("update public.articulos set status='pausado',estado='pausado' where id=$1",[id(13)]);await asUser(buyer);
    await assert.rejects(apply(13,true));assert.equal((await donationStatus()).balance,1);
  });
  await t.test('publishing and highlighting charge one credit for free slots or donations and retries never charge twice',async()=>{
    await reset();
    const bundle=async(n,extra={})=>(await db.query('select public.publish_article_with_credit($1,$2,$3,$4) as r',[{...payload('venta'),...extra},id(n),false,true])).rows[0].r;
    let result=await bundle(40);assert.equal(result.cost,1);assert.equal(result.publicationCost,0);assert.equal(result.featureCost,1);assert.equal(result.article.is_featured,true);assert.equal(result.balance,4);
    result=await bundle(41,{mode:'donacion'});assert.equal(result.cost,1);assert.equal(result.article.is_featured,true);assert.equal(result.balance,3);
    await db.exec('reset role');await db.query('update cupos set saldo=0 where usuario_id=$1',[owner]);await asUser(owner);
    result=await bundle(40);assert.equal(result.alreadyExists,true);assert.equal(result.cost,0);assert.equal(result.balance,0);assert.equal(result.article.is_featured,true);
    assert.equal((await db.query('select * from cupos_historial')).rows.length,2);
    await asUser(other);await assert.rejects(bundle(40),/Identificador/);
  });
  await t.test('fourth sale plus highlight requires two credits and explicit publication consent, without partial charges',async()=>{
    await reset();for(let n=10;n<13;n++)await publish(n);
    const bundle=async(paid=true)=>(await db.query('select public.publish_article_with_credit($1,$2,$3,true) as r',[payload('venta'),id(40),paid])).rows[0].r;
    assert.equal((await bundle(false)).code,'PUBLICATION_CREDIT_REQUIRED');assert.equal((await sales()).balance,5);
    await db.exec('reset role');await db.query('update cupos set saldo=1 where usuario_id=$1',[owner]);await asUser(owner);
    assert.equal((await bundle()).code,'INSUFFICIENT_CREDITS');assert.equal((await sales()).active,3);assert.equal((await sales()).balance,1);
    assert.equal((await db.query('select count(*)::int n from article_publication_credits where article_id=$1',[id(40)])).rows[0].n,0);
    await db.exec('reset role');await db.query('update cupos set saldo=2 where usuario_id=$1',[owner]);await asUser(owner);
    const result=await bundle();assert.equal(result.cost,2);assert.equal(result.publicationCost,1);assert.equal(result.featureCost,1);assert.equal(result.balance,0);assert.equal(result.article.is_featured,true);
    const ledger=(await db.query('select concepto,cantidad from cupos_historial')).rows;assert.deepEqual(ledger.map(row=>row.concepto).sort(),['destacado','publicacion_venta']);assert.equal(ledger.reduce((sum,row)=>sum+row.cantidad,0),-2);
    assert.equal((await bundle()).cost,0);assert.equal((await sales()).balance,0);
  });
  await t.test('a failure while enabling the highlight rolls back the publication, both debits, receipt and ledger',async()=>{
    await reset();for(let n=10;n<13;n++)await publish(n);
    await db.exec(`reset role;create function public.reject_test_feature() returns trigger language plpgsql as $$begin if new.title='REJECT_FEATURE' and new.is_featured then raise exception 'invalid test highlight';end if;return new;end;$$;create trigger zzz_test_feature before update on public.articulos for each row execute function public.reject_test_feature();`);
    await asUser(owner);
    await assert.rejects(db.query('select public.publish_article_with_credit($1,$2,true,true)',[{...payload('venta'),title:'REJECT_FEATURE'},id(40)]),/invalid test highlight/);
    assert.equal((await sales()).balance,5);assert.equal((await sales()).active,3);assert.equal((await db.query('select * from cupos_historial')).rows.length,0);
    assert.equal((await db.query('select count(*)::int n from article_publication_credits where article_id=$1',[id(40)])).rows[0].n,0);
  });
  await t.test('old requests cannot be retroactively charged or highlighted through a retry of the new bundle',async()=>{
    await reset();await publish(40);
    const result=(await db.query('select public.publish_article_with_credit($1,$2,false,true) as r',[payload('venta'),id(40)])).rows[0].r;
    assert.equal(result.alreadyExists,true);assert.equal(result.article.is_featured,false);assert.equal(result.balance,5);assert.equal(result.cost,0);
  });
  await t.test('unverified, blocked and foreign identity cannot publish; migrations are repeatable',async()=>{
    await reset();await db.exec('reset role');await db.query('update auth.users set email_confirmed_at=null where id=$1',[buyer]);await asUser(buyer);
    await assert.rejects(publish(10),/verificar/);await asUser(owner);
    const result=await publish(10,false,{owner_id:buyer,is_featured:true});assert.equal(result.article.owner_id,owner);assert.equal(result.article.is_featured,false);
    await asUser(other);await assert.rejects(publish(10),/Identificador/);
    await db.exec('reset role');await db.exec(await migration('2026-10-20-donation-daily-quota'));await db.exec(await migration('2026-10-20-publication-credits'));
    await asUser(owner);assert.equal((await sales()).active,1);
  });
  await t.test('one valid available donation unlocks only one sale slot; removal never charges existing sales',async()=>{
    await db.exec('reset role;alter table articulos add column size_class text;alter table articulos add column review_status text;');
    await db.exec(await migration('2026-10-28-donation-sale-bonus'));
    await reset();for(let n=10;n<13;n++)await publish(n);
    assert.equal((await sales()).freeLimit,3);
    await publish(20,false,{mode:'donacion'});
    assert.equal((await sales()).freeLimit,4);assert.equal((await sales()).donationBonus,true);
    await assert.rejects(db.query("update articulos set mode='venta',price=10000 where id=$1",[id(20)]),/requiere confirmar/);
    const fourth=await publish(13,true);assert.equal(fourth.cost,0);assert.equal(fourth.balance,5);
    assert.equal((await publish(14)).code,'PUBLICATION_CREDIT_REQUIRED');
    await assert.rejects(db.query("insert into articulos(id,owner_id,mode,status,estado,created_at) values($1,$2,'venta','disponible','disponible',now())",[id(30),owner]),/requiere confirmar/);
    assert.equal((await publish(14,true)).cost,1);
    await db.query("update articulos set status='pausado',estado='pausado' where id=$1",[id(20)]);
    assert.equal((await sales()).freeLimit,3);assert.equal((await sales()).active,5);assert.equal((await sales()).balance,4);
    await db.query('update articulos set title=$1 where id=$2',['Sigue publicada',id(13)]);
    assert.equal((await sales()).balance,4);
    await db.query('delete from articulos where id=any($1)',[[id(13),id(14)]]);
    assert.equal((await publish(15)).code,'PUBLICATION_CREDIT_REQUIRED');
    await publish(21,false,{mode:'donacion'});await publish(22,false,{mode:'donacion'});
    assert.equal((await sales()).freeLimit,4,'multiple donations do not stack');
    assert.equal((await publish(15)).cost,0);
    await db.query("update articulos set status='entregado',estado='entregado' where id=any($1)",[[id(21),id(22)]]);
    assert.equal((await sales()).freeLimit,3);assert.equal((await sales()).active,4);assert.equal((await sales()).balance,4);
    await db.exec('reset role');await db.exec(await migration('2026-10-28-donation-sale-bonus'));await asUser(owner);
    assert.equal((await sales()).active,4);assert.equal((await sales()).balance,4);
    await reset();for(let n=10;n<13;n++)await publish(n);await publish(20,false,{mode:'donacion'});
    const highlighted=(await db.query('select publish_article_with_credit($1,$2,false,true) as r',[payload('venta'),id(13)])).rows[0].r;
    assert.equal(highlighted.publicationCost,0);assert.equal(highlighted.featureCost,1);assert.equal(highlighted.balance,4);
  });
  await t.test('bonus ignores unavailable, incomplete and foreign donations and keeps staff/public access private',async()=>{
    await reset();await publish(20,false,{mode:'donacion'});
    for(const state of ['pausado','reservado','en_revision','entregado']){
      await db.query('update articulos set status=$1,estado=$1 where id=$2',[state,id(20)]);
      assert.equal((await sales()).freeLimit,3,state);
    }
    await db.query("update articulos set status='disponible',estado='disponible',created_at=now()-interval '60 days' where id=$1",[id(20)]);
    assert.equal((await sales()).freeLimit,3,'expired');
    await db.query("update articulos set created_at=now(),review_status='en_revision' where id=$1",[id(20)]);
    assert.equal((await sales()).freeLimit,3,'review flag despite available status');
    await db.query("update articulos set review_status='approved',description='' where id=$1",[id(20)]);
    assert.equal((await sales()).freeLimit,3,'missing description');
    await db.query("update articulos set description='Usada pero funciona',imagenes='{}',image_url=null,imagen_url_principal=null where id=$1",[id(20)]);
    assert.equal((await sales()).freeLimit,3,'missing photos');
    await db.query("update articulos set image_url='https://example.com/test.jpg' where id=$1",[id(20)]);
    assert.equal((await sales()).freeLimit,4,'complete approved available donation');
    await asUser(buyer);assert.equal((await sales()).freeLimit,3,'another owner');
    await assert.rejects(db.query('select sale_free_limit($1)',[owner]),/permission denied/);
    await db.exec('reset role;set role anon');await assert.rejects(db.query('select sale_publication_status()'),/permission denied/);
  });
 } finally { await db.close(); }
});

test('publication client passes consent and stable id and never falls back to unguarded insert',async()=>{
 const client={rpc:async(name,args)=>{assert.equal(name,'publish_article_with_credit');assert.equal(args.p_request_id,'request');assert.equal(args.p_use_credit,true);return {data:{success:true,cost:1,balance:2,article:{id:'request'}}};}};
 assert.equal((await commitPublication(client,{article:{mode:'venta'},requestId:'request',useCredit:true})).cost,1);
 const missing={rpc:async()=>({error:{code:'PGRST202'}})};
 assert.equal((await commitPublication(missing,{article:{},requestId:'x'})).success,false);
 await assert.rejects(publicationStatus(missing),/Falta habilitar/);
});

test('publication highlight selection is explicit and the quote includes both costs without extra queries',async()=>{
 const quote=publicationQuote({requiresCredit:true,balance:1},'venta',true);assert.equal(quote.total,2);assert.equal(quote.sufficient,false);assert.equal(quote.canAddFeature,false);
 assert.equal(publicationQuote({requiresCredit:true,balance:2},'venta',true).sufficient,true);
 assert.equal(publicationQuote({requiresCredit:true,balance:1},'donacion',true).total,1);
 assert.equal(publicationQuote({requiresCredit:false,balance:0},'venta',false).total,0);
 assert.equal(publicationQuote(null,'venta',true).sufficient,false);
 const calls=[];const client={rpc:async(name,args)=>{calls.push({name,args});return {data:{success:true,cost:1,article:{id:'request',is_featured:!!args.p_feature}}};}};
 assert.equal((await commitPublication(client,{article:{},requestId:'request',feature:true})).article.is_featured,true);
 assert.equal(calls.length,1);assert.equal(calls[0].args.p_feature,true);
 await commitPublication(client,{article:{},requestId:'request'});assert.ok(!('p_feature' in calls[1].args));
});
