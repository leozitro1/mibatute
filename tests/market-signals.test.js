import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { catalogTopic, createReadCache, createSignalDeduplicator, mergeChatMessages,
  noticeFromSignal, notificationCounts, readChatMessages, singleFlight } from '../src/components/marketSignals.js';
import { subscribeStaffInbox } from '../src/components/staffInboxSignals.js';
import { cardImageUrl } from '../src/imagekit/imageUrls.js';

test('cards use small CDN images without proxy requests or modifying signed, local or foreign images', () => {
  const endpoint='https://ik.imagekit.io/mibatute';
  assert.equal(cardImageUrl(`${endpoint}/folder/photo.jpg`, endpoint),`${endpoint}/tr:w-500,q-auto:eco,f-auto/folder/photo.jpg`);
  assert.equal(cardImageUrl(`${endpoint}/tr:w-1000,q-auto:eco,f-auto/photo.jpg`,endpoint),`${endpoint}/tr:w-500,q-auto:eco,f-auto/photo.jpg`);
  for (const url of ['http://127.0.0.1:54321/photo.jpg','data:image/png;base64,a','https://other.test/photo.jpg',
    `${endpoint}/photo.jpg?ik-s=signature`,`${endpoint}/tr:w-100,c-face/photo.jpg`]) assert.equal(cardImageUrl(url,endpoint),url);
});

test('private signal duplicates are ignored and callbacks never query the database', async () => {
  const channels = [], events = [], statuses = []; let reconnects = 0;
  const client = { realtime: { setAuth: async () => {} }, channel(topic) {
    const callbacks = {};
    const channel = { topic, callbacks, on(type, filter, callback) { callbacks[filter.event] = callback; return this; },
      subscribe(callback) { this.status = callback; return this; } };
    channels.push(channel); return channel;
  }, removeChannel() {} };
  const stop = subscribeStaffInbox(client, { id: 'me' }, () => {}, () => {}, {
    onMarketSignal: signal => events.push(signal), onReconnect: () => reconnects++, onStatus: status => statuses.push(status),
  });
  await Promise.resolve(); await Promise.resolve();
  channels[0].status('SUBSCRIBED');
  const payload = { key: 'message:1', kind: 'message' };
  channels[0].callbacks.market_signal({ payload }); channels[0].callbacks.market_signal({ payload });
  assert.equal(events.length, 1); assert.equal(reconnects, 0);
  channels[0].status('CHANNEL_ERROR'); channels[0].status('SUBSCRIBED');
  assert.equal(reconnects, 1); assert.deepEqual(statuses, ['SUBSCRIBED', 'CHANNEL_ERROR', 'SUBSCRIBED']);
  stop(); channels[0].callbacks.market_signal({ payload: { key: 'message:2' } }); assert.equal(events.length, 1);
  const accept = createSignalDeduplicator(2); assert.ok(accept({key:'a'})); assert.ok(!accept({key:'a'}));
});

test('live grouped counters restore unread state after reading without affecting other articles', () => {
  const notice = { id: 'chat-c', type: 'chat', chat_id: 'c', articulo_id: 'a', created_at: '2026-10-16T12:01:00Z' };
  assert.equal(noticeFromSignal({notice}, { unreadCount: 4, read: false }).unreadCount, 5);
  assert.equal(noticeFromSignal({notice}, { unreadCount: 4, read: true }).unreadCount, 1);
  assert.equal(noticeFromSignal({notice}, null, '2026-10-16T12:02:00Z').unreadCount, 0);
  const counts = notificationCounts([{...notice, unreadCount: 2}, {id:'p',type:'postulacion',articulo_id:'b',unreadCount:3},
    {type:'venta',articulo_id:'a',unreadCount:1}, {type:'chat',articulo_id:'a',unreadCount:9,read:true}]);
  assert.equal(counts.chats, 2); assert.equal(counts.profile, 6); assert.equal(counts.byArticle.a.total, 3);
  assert.equal(catalogTopic('Bogotá','Hogar & Muebles'), 'mb:catalog:426f676f74c3a1:686f6761722026206d7565626c6573');
});

test('chat acknowledgements and live inserts merge by persisted ID even when HTTP and socket race', () => {
  const row = { id: 'persisted', created_at: '2026-10-16T12:00:00Z', body: 'hola' };
  const optimistic = { ...row, id:'optimistic', _optimistic:true };
  assert.deepEqual(mergeChatMessages([optimistic,row], [row], 'optimistic'), [row]);
  assert.deepEqual(mergeChatMessages([row], [row]), [row]);
});

test('overlapping reads share a request; invalidation and failures do not cache stale results', async () => {
  let finish, calls = 0, time = 0;
  const cache = createReadCache({ now: () => time, ttl: 100 });
  const read = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
  const first = cache.get('a', read), second = cache.get('a', read);
  assert.equal(first, second); await Promise.resolve(); assert.equal(calls, 1);
  cache.invalidate('a'); finish({data: ['old']}); await first;
  assert.deepEqual(await cache.get('a', () => ({data:['new']})), {data:['new']});
  time = 99; assert.deepEqual(await cache.get('a', read), {data:['new']});
  time = 100; assert.deepEqual(await cache.get('a', () => ({error: 'failed'})), {error: 'failed'});
  assert.deepEqual(await cache.get('a', () => ({data:['retry']})), {data:['retry']});
  let release; const task = singleFlight(() => new Promise(resolve => { release = resolve; }));
  const a = task(), b = task(); assert.equal(a,b); await Promise.resolve(); release(1); assert.equal(await a,1);
});

test('reconnect reads use an ordered cursor and page through more than 100 missed messages', async () => {
  const cursor={created_at:'2026-10-16T12:00:00Z',id:'initial'},calls=[];
  const rows=Array.from({length:100},(_,i)=>({id:`m${i}`,created_at:'2026-10-16T12:01:00Z'}));
  let page=0;
  const query={select(){return this;},eq(){return this;},or(filter){calls.push(filter);return this;},
    order(){return this;},limit:async limit=>{assert.equal(limit,100);return{data:page++===0?rows:[{id:'last',created_at:'2026-10-16T12:02:00Z'}]};}};
  const result=await readChatMessages({from:()=>query},'chat',cursor);
  assert.equal(result.length,101);assert.match(calls[0],/id.gt.initial/);assert.match(calls[1],/id.gt.m99/);
});

test('database signals target only recipients, exclude private bodies and ignore idle/counter updates', async () => {
  const db = new PGlite();
  const id = n => `10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  try {
    await db.exec(`create role anon;create role authenticated;create schema realtime;
      create table realtime.messages(topic text,event text,payload jsonb,private boolean);
      create function realtime.send(payload jsonb,event text,topic text,private boolean) returns void language sql as
        'insert into realtime.messages values(topic,event,payload,private)';
      create table public.articulos(id uuid primary key,owner_id uuid,buyer_id uuid,ganador_id uuid,winner_id uuid,recipient_id uuid,
        title text,description text,city text,category text,mode text,status text,estado text,interested_count int default 0,
        image_url text,imagen_url_principal text,created_at timestamptz default now(),updated_at timestamptz default now());
      create table public.chats(id uuid primary key,articulo_id uuid,buyer_id uuid,seller_id uuid,status text,
        created_at timestamptz default now(),updated_at timestamptz,last_message_at timestamptz);
      create table public.chat_messages(id uuid primary key,chat_id uuid,sender_id uuid,body text,created_at timestamptz default now());
      create table public.postulaciones(id uuid primary key,articulo_id uuid,usuario_id uuid,justificacion text,created_at timestamptz default now());
      create table public.activity_notifications(id text,recipient_id uuid,type text,receipt_id uuid,title text,created_at timestamptz default now());
      create table public.usuarios(id uuid primary key,is_blocked boolean,bloqueado boolean,ban_until timestamptz,nombre text);
      create table public.cupos(usuario_id uuid primary key,saldo int);
      insert into articulos(id,owner_id,buyer_id,title,description,city,category,mode,status,estado)
        values('${id(1)}','${id(10)}','${id(11)}','Silla','Descripción','Bogotá','Hogar & Muebles','venta','reservado','reservado');
      insert into chats(id,articulo_id,buyer_id,seller_id,status) values('${id(2)}','${id(1)}','${id(11)}','${id(10)}','open');
      insert into usuarios values('${id(10)}',false,false,null,'Nombre');`);
    const migration=await readFile(new URL('../supabase/migrations/2026-10-16-market-realtime.sql',import.meta.url),'utf8');
    await db.exec(migration);
    const signals=async()=>(await db.query('select * from realtime.messages')).rows;
    await db.exec(`insert into chat_messages(id,chat_id,sender_id,body) values('${id(3)}','${id(2)}','${id(11)}','CUERPO PRIVADO');`);
    let rows=await signals();assert.equal(rows.length,1);assert.equal(rows[0].topic,`mb:inbox:user:${id(10)}`);
    assert.equal(rows[0].payload.notice.type,'chat');assert.ok(rows[0].private);assert.ok(!JSON.stringify(rows).includes('CUERPO'));
    await db.exec(`truncate realtime.messages;update chats set last_message_at=now(),updated_at=now();
      update articulos set interested_count=interested_count+1,updated_at=now();update usuarios set nombre='Otro nombre';`);
    assert.deepEqual(await signals(),[],'No signal for message timestamps, counters, or unrelated profile edits');
    await db.exec(`insert into postulaciones(id,articulo_id,usuario_id,justificacion) values('${id(4)}','${id(1)}','${id(11)}','JUSTIFICACION PRIVADA');`);
    rows=await signals();assert.equal(rows.length,1);assert.equal(rows[0].payload.interested_count,1);assert.ok(!JSON.stringify(rows).includes('JUSTIFICACION'));
    await db.exec('truncate realtime.messages;update articulos set title=\'Título actualizado\';');
    rows=await signals();const publicRows=rows.filter(row=>!row.private);
    assert.equal(publicRows.length,2);assert.ok(publicRows.some(row=>row.topic===catalogTopic('Bogotá')));
    assert.ok(publicRows.some(row=>row.topic===catalogTopic('Bogotá','Hogar & Muebles')));
    assert.ok(publicRows.every(row=>!JSON.stringify(row.payload).includes(id(11))));
    assert.equal(rows.filter(row=>row.private).length,2);
    await db.exec(`truncate realtime.messages;update articulos set city='Medellín';`);
    rows=await signals();assert.equal(rows.filter(row=>!row.private).length,4,'Moves invalidate both old and new scopes');
    await db.exec(`truncate realtime.messages;update usuarios set is_blocked=true;insert into cupos values('${id(10)}',10);`);
    rows=await signals();assert.deepEqual(rows.map(row=>row.payload.kind).sort(),['account','balance']);
    await db.exec('truncate realtime.messages');
    await db.exec(`begin;insert into chat_messages(id,chat_id,sender_id,body) values('${id(5)}','${id(2)}','${id(11)}','rollback');rollback;`);
    assert.deepEqual(await signals(),[]);
    await db.exec(migration);assert.deepEqual(await signals(),[],'Reapplying emits no old activity');
    await db.exec('set role authenticated');
    await assert.rejects(db.query("select public.send_market_signal($1,'{}')",[id(11)]),/permission/);
    await db.exec('reset role');
  } finally { await db.close(); }
});
