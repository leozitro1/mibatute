import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { activityDestination, fetchActivityNotifications, publicationExpiryNotifications } from '../src/components/activityNotifications.js';
import { markNotificationHistoryRead, mergeNotificationHistory } from '../src/components/notificationHistory.js';

const owner = '11111111-1111-1111-1111-111111111111';
const buyer = '22222222-2222-2222-2222-222222222222';
const other = '33333333-3333-3333-3333-333333333333';
const article = '44444444-4444-4444-4444-444444444444';
const chat = '55555555-5555-5555-5555-555555555555';

test('activity read is bounded and legacy installations remain usable', async () => {
  const calls = [];
  const query = new Proxy({}, { get: (_, method) => (...args) => {
    calls.push([method, ...args]);
    return method === 'limit' ? Promise.resolve({ data: [{ id: 'notice', type: 'pickup_proposed' }] }) : query;
  } });
  const rows = await fetchActivityNotifications({ from: table => { calls.push(['from', table]); return query; } }, owner);
  assert.equal(rows[0].read, false);
  assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'recipient_id' && call[2] === owner));
  assert.deepEqual(calls.at(-1), ['limit', 10]);
  const missing = new Proxy({}, { get: (_, key) => () => key === 'limit' ? Promise.resolve({ error: { code: 'PGRST205' } }) : missing });
  assert.deepEqual(await fetchActivityNotifications({ from: () => missing }, owner), []);
  assert.deepEqual(await fetchActivityNotifications({}, null), []);
});

test('expiry alerts use the actual deadline and only notify the owner of available listings', () => {
  const articles = ['disponible', 'reservado', 'entregado'].map((status, id) => ({ id, owner_id: owner, status, created_at: '2026-01-01T00:00:00Z' }));
  const result = publicationExpiryNotifications(articles, owner, Date.parse('2026-03-03T00:00:00Z'));
  assert.equal(result.length, 1);
  assert.equal(result[0].created_at, '2026-03-02T00:00:00.000Z');
  assert.deepEqual(publicationExpiryNotifications(articles, buyer), []);
  assert.deepEqual(publicationExpiryNotifications(articles, owner, Date.parse('2026-02-28T00:00:00Z')), []);
  assert.equal(activityDestination('pickup_proposed'), 'chat');
  assert.equal(activityDestination('system_notice'), 'buzon');
  assert.equal(activityDestination('donation_rejected'), 'rescates');
  assert.equal(activityDestination('publication_expired'), 'publicaciones');
});

test('reading a chat acknowledges pickup events but never removes them or future events', () => {
  const events = ['pickup_proposed', 'pickup_confirmed', 'pickup_rejected', 'pickup_canceled', 'sale_approved'].map((type, id) => ({ id, type, chat_id: chat, created_at: '2026-10-08T12:00:00Z' }));
  const future = { id: 'future', type: 'pickup_proposed', chat_id: chat, created_at: '2026-10-09T12:00:00Z' };
  const marked = markNotificationHistoryRead([...events, future], { chatId: chat, through: '2026-10-08T12:00:00Z' });
  assert.equal(marked.length, 6);
  assert.equal(marked.filter(item => item.read).length, 5);
  assert.equal(mergeNotificationHistory(marked, events).filter(item => item.read).length, 5);
});

test('server activity records recipient-only events atomically and retains a bounded history', async t => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql stable as
        'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
      create table auth.users(id uuid primary key);
      create table public.usuarios(id uuid primary key,is_blocked boolean default false,nombre text,foto_url text);
      create view public.usuarios_publicos as select id,nombre,foto_url from public.usuarios;
      create table public.articulos(id uuid primary key,owner_id uuid,mode text,status text,estado text,buyer_id uuid,
        ganador_id uuid,winner_id uuid,recipient_id uuid,title text,image_url text,imagen_url_principal text,delivered_at timestamptz,created_at timestamptz default now());
      create table public.chats(id uuid primary key,articulo_id uuid,buyer_id uuid,seller_id uuid,owner_id uuid,usuario_id uuid,
        status text,approved_at timestamptz,updated_at timestamptz default now(),created_at timestamptz default now());
      create table public.postulaciones_rechazadas(id uuid primary key default gen_random_uuid(),articulo_id uuid,usuario_id uuid,created_at timestamptz default now());
      create table public.reputacion(id uuid primary key default gen_random_uuid(),reviewer_id uuid,reviewed_id uuid,articulo_id uuid,estrellas int,created_at timestamptz default now());
      create table public.cupos_historial(id uuid primary key default gen_random_uuid(),usuario_id uuid,cantidad int,created_at timestamptz default now());
      create table public.recargas_pendientes(id uuid primary key default gen_random_uuid(),usuario_id uuid,estado text,updated_at timestamptz default now(),created_at timestamptz default now());
      create table public.system_messages(id uuid primary key default gen_random_uuid(),title text,body text,created_at timestamptz default now());
      create table public.system_message_receipts(id uuid primary key default gen_random_uuid(),message_id uuid,user_id uuid,read_at timestamptz,created_at timestamptz default now());
      grant usage on schema public,auth to authenticated;
      alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;
      insert into auth.users values('${owner}'),('${buyer}'),('${other}');
      insert into public.usuarios(id) select id from auth.users;
    `);
    await db.exec(await readFile(new URL('../supabase/migrations/2026-10-08-pickup-agreements.sql', import.meta.url), 'utf8'));
    const migration = await readFile(new URL('../supabase/migrations/2026-10-08-activity-notifications.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    const asUser = async uid => {
      await db.exec('reset role; set role authenticated;');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
    };
    const reset = async (mode = 'venta') => {
      await db.exec('reset role; truncate public.chat_pickups,public.chats,public.articulos,public.activity_notifications,public.postulaciones_rechazadas,public.reputacion,public.cupos_historial,public.recargas_pendientes,public.system_message_receipts,public.system_messages;');
      await db.query("insert into public.articulos(id,owner_id,mode,status,estado,buyer_id,ganador_id,title,image_url) values($1,$2,$3,'reservado','reservado',$4,$5,'Libros','/libros.jpg')", [article, owner, mode, mode === 'venta' ? buyer : null, mode === 'donacion' ? buyer : null]);
      await db.query("insert into public.chats(id,articulo_id,buyer_id,seller_id,owner_id,status) values($1,$2,$3,$4,$4,'open')", [chat,article,buyer,owner]);
      await asUser(owner);
    };
    const rows = async () => (await db.query('select * from public.activity_notifications order by created_at,id')).rows;
    const propose = async replace => (await db.query("select to_jsonb(public.propose_chat_pickup($1,'2099-01-01','09:00','11:00',$2)) as row", [chat,replace || null])).rows[0].row;
    const respond = async (id, action) => db.query('select public.respond_chat_pickup($1,$2)', [id,action]);

    await t.test('proposal, confirmation, rejection, cancellation and replacement notify only the counterpart', async () => {
      await reset(); const first = await propose();
      assert.equal((await rows()).length, 0);
      await asUser(buyer); assert.equal((await rows())[0].type, 'pickup_proposed');
      assert.match((await rows())[0].subtitle, /09:00 - 11:00/);
      await respond(first.id,'reject');
      await asUser(owner); assert.equal((await rows())[0].type,'pickup_rejected');
      const second = await propose(); await asUser(buyer); await respond(second.id,'confirm');
      await asUser(owner); assert.ok((await rows()).some(row => row.type==='pickup_confirmed'));
      const third = await propose(second.id);
      await asUser(buyer); assert.ok((await rows()).some(row => row.title==='Nuevo horario de recogida'));
      await respond(third.id,'cancel');
      await asUser(owner); assert.ok((await rows()).some(row => row.type==='pickup_canceled'));
      const before = (await rows()).length;
      await assert.rejects(respond(third.id,'confirm'));
      assert.equal((await rows()).length,before);
    });

    await t.test('choices and deliveries are distinct events; unrelated article edits do not re-notify', async () => {
      await reset('donacion'); await db.exec('reset role;');
      await db.query("update public.articulos set status='disponible',estado='disponible',ganador_id=null where id=$1", [article]);
      await db.exec('truncate public.activity_notifications;');
      await db.query("update public.articulos set ganador_id=$1,status='reservado',estado='reservado' where id=$2", [buyer,article]);
      await db.query("update public.articulos set title='Libros editados' where id=$1", [article]);
      await asUser(buyer); assert.equal((await rows()).length,1);
      assert.equal((await rows())[0].type,'donation_accepted');
      await db.exec("reset role; update public.articulos set status='entregado',estado='entregado',delivered_at=now();");
      await asUser(buyer); assert.equal((await rows()).length,2);
      assert.ok((await rows()).some(row => row.type==='delivery_completed'));
    });

    await t.test('reservation cancellation reaches the other participant without a second pickup alert', async () => {
      await reset(); const pending = await propose(); await asUser(buyer); await respond(pending.id,'confirm');
      await db.exec('reset role; truncate public.activity_notifications;'); await asUser(buyer);
      await db.exec('reset role;');
      await db.query("update public.articulos set status='disponible',estado='disponible',buyer_id=null where id=$1", [article]);
      await asUser(owner);
      assert.deepEqual((await rows()).map(row=>row.type),['reservation_canceled']);
    });

    await t.test('approval, rejection, ratings, positive credits, topup rejection, system and moderation notices', async () => {
      await reset(); await db.exec('reset role;');
      await db.exec("update public.chats set status='pending'; update public.chats set status='open',approved_at=now();");
      await db.query('insert into public.postulaciones_rechazadas(articulo_id,usuario_id) values($1,$2)',[article,buyer]);
      await db.query('insert into public.reputacion(reviewer_id,reviewed_id,articulo_id,estrellas) values($1,$2,$3,5)',[owner,buyer,article]);
      await db.query('insert into public.cupos_historial(usuario_id,cantidad) values($1,10),($1,-1)',[buyer]);
      await db.query("insert into public.recargas_pendientes(usuario_id,estado) values($1,'pendiente')",[buyer]);
      await db.exec("update public.recargas_pendientes set estado='rechazada';");
      const message = (await db.query("insert into public.system_messages(title,body) values('Aviso oficial','Texto privado no copiado') returning id")).rows[0].id;
      await db.query('insert into public.system_message_receipts(message_id,user_id) values($1,$2)',[message,buyer]);
      await asUser(buyer);
      assert.deepEqual((await rows()).map(row=>row.type).sort(),['sale_approved','donation_rejected','rating_received','credits_received','topup_rejected','system_notice'].sort());
      assert.equal(JSON.stringify(await rows()).includes('Texto privado'),false);
      await db.exec("reset role; update public.articulos set status='en_revision'; update public.articulos set status='disponible';");
      await asUser(owner);
      assert.deepEqual((await rows()).map(row=>row.type).sort(),['publication_approved','publication_review'].sort());
    });

    await t.test('source deletion does not delete history; a stranger and anonymous callers cannot read or forge it', async () => {
      await reset(); await propose();
      await db.exec('reset role; delete from public.chat_pickups; delete from public.chats; delete from public.articulos;');
      await asUser(buyer); assert.equal((await rows()).length,1);
      for (const sql of ["insert into public.activity_notifications(id,recipient_id,type,title) values('fake',auth.uid(),'credits_received','Fake')",
        'delete from public.activity_notifications',"update public.activity_notifications set title='Fake'",
        "select public.append_activity_notification(auth.uid(),'fake','credits_received','Fake')"]) await assert.rejects(db.query(sql),/permission denied/);
      await asUser(other); assert.equal((await rows()).length,0);
      await db.exec('reset role; set role anon;'); await assert.rejects(rows(),/permission denied/);
    });

    await t.test('notification chat links preserve ended conversations and never expose them to the new buyer or strangers', async () => {
      await reset(); await db.exec('reset role;');
      await db.exec(`update public.chats set status='closed'; update public.articulos set buyer_id='${other}';`);
      const context = async () => (await db.query('select public.notification_chat_context($1) as context', [chat])).rows;
      await asUser(buyer);
      assert.equal((await context())[0].context.transaction_chat.buyer_id,buyer);
      assert.equal((await context())[0].context.transaction_chat.status,'closed');
      await asUser(owner); assert.equal((await context()).length,1);
      await asUser(other); assert.deepEqual(await context(),[]);
      await db.exec(`reset role; update public.usuarios set is_blocked=true where id='${buyer}';`);
      await asUser(buyer); assert.deepEqual(await context(),[]);
      await db.exec(`reset role; update public.usuarios set is_blocked=false; set role anon;`);
      await assert.rejects(context(),/permission denied/);
    });

    await t.test('system notices resolve exact receipts, normalized bodies and recipient-only read actions', async () => {
      await reset(); await db.exec('reset role;');
      const message = (await db.query("insert into public.system_messages(title,body) values('Aviso de prueba','Contenido autorizado') returning id")).rows[0].id;
      const receipt = (await db.query('insert into public.system_message_receipts(message_id,user_id) values($1,$2) returning id',[message,buyer])).rows[0].id;
      await asUser(buyer);
      const inbox = async () => (await db.query('select public.notification_inbox() as notice')).rows.map(item=>item.notice);
      assert.equal((await rows())[0].receipt_id,receipt);
      assert.equal((await inbox())[0].receipt_id,receipt);
      assert.equal((await inbox())[0].message,'Contenido autorizado');
      await db.query("select public.notification_receipt_action($1,'read')",[receipt]);
      assert.ok((await inbox())[0].read_at);
      await asUser(other); assert.deepEqual(await inbox(),[]);
      await assert.rejects(db.query("select public.notification_receipt_action($1,'delete')",[receipt]),/permiso/);
      await asUser(buyer); await db.query("select public.notification_receipt_action($1,'delete')",[receipt]);
      assert.deepEqual(await inbox(),[]);
      assert.equal((await rows()).length,1,'Eliminar el mensaje no elimina el aviso del historial.');
    });

    await t.test('storage retention and migration reapplication preserve recent events without duplicates', async () => {
      await reset(); const proposed = await propose();
      await db.exec('reset role;'); await db.exec(migration); await db.exec(migration);
      await asUser(buyer); assert.equal((await rows()).length,1);
      assert.match((await rows())[0].id,new RegExp(proposed.id));
      await db.exec('reset role;');
      await db.query('insert into public.cupos_historial(usuario_id,cantidad) select $1,1 from generate_series(1,60)',[buyer]);
      await asUser(buyer); assert.equal((await rows()).length,50);
    });
  } finally { await db.close(); }
});
