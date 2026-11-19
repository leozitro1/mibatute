import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { attachChatPresence } from '../src/components/chatPresence.js';

function setup({ hidden = false, track } = {}) {
  const doc = new EventTarget(), win = new EventTarget(), calls = [], changes = [];
  doc.visibilityState = hidden ? 'hidden' : 'visible'; win.navigator = { onLine: true };
  const channel = {
    state: {},
    on(type, filter, callback) { assert.equal(type, 'presence'); assert.equal(filter.event, 'sync'); this.sync = callback; return this; },
    presenceState() { return this.state; },
    async track(payload) { calls.push(['track', payload]); return track ? track(payload) : 'ok'; },
    async untrack() { calls.push(['untrack']); return 'ok'; },
  };
  const controller = attachChatPresence(channel, { userId: 'me', peerId: 'peer', onChange: online => changes.push(online), documentTarget: doc, windowTarget: win });
  return { doc, win, channel, controller, calls, changes };
}

test('presence sends one entry per visibility change and never polls or retracks on sync', async () => {
  const s = setup(); s.controller.status('SUBSCRIBED'); await s.controller.settled();
  assert.deepEqual(s.calls, [['track', { user_id: 'me', active: true }]]);
  s.channel.state = { a: [{ user_id: 'me', active: true }], b: [{ user_id: 'peer', active: true }] };
  for (let i = 0; i < 10; i++) s.channel.sync();
  s.doc.dispatchEvent(new Event('visibilitychange')); await s.controller.settled();
  assert.deepEqual(s.changes, [false, true]); assert.equal(s.calls.length, 1);
  s.doc.visibilityState = 'hidden'; s.doc.dispatchEvent(new Event('visibilitychange')); await s.controller.settled();
  assert.equal(s.changes.at(-1), false); assert.equal(s.calls.at(-1)[0], 'untrack');
  s.doc.visibilityState = 'visible'; s.doc.dispatchEvent(new Event('visibilitychange')); await s.controller.settled();
  assert.equal(s.changes.at(-1), true); assert.equal(s.calls.length, 3);
  s.channel.state = { b: [{ user_id: 'peer', active: false }] }; s.channel.sync();
  assert.equal(s.changes.at(-1), false); s.controller.dispose();
});

test('hidden or disconnected sessions stay gray; reconnect and navigation restore only visible presence', async () => {
  const s = setup({ hidden: true }); s.controller.status('SUBSCRIBED'); await s.controller.settled();
  assert.equal(s.calls.length, 0);
  s.doc.visibilityState = 'visible'; s.doc.dispatchEvent(new Event('visibilitychange')); await s.controller.settled();
  s.channel.state = { peer: [{ user_id: 'peer', active: true }] }; s.channel.sync();
  assert.equal(s.changes.at(-1), true);
  s.controller.status('CHANNEL_ERROR'); assert.equal(s.changes.at(-1), false);
  s.channel.sync(); assert.equal(s.changes.at(-1), false);
  s.controller.status('SUBSCRIBED'); await s.controller.settled(); assert.equal(s.changes.at(-1), true);
  s.win.dispatchEvent(new Event('pagehide')); await s.controller.settled(); assert.equal(s.changes.at(-1), false);
  s.win.dispatchEvent(new Event('pageshow')); await s.controller.settled(); assert.equal(s.changes.at(-1), true);
  s.win.navigator.onLine = false; s.win.dispatchEvent(new Event('offline')); await s.controller.settled();
  assert.equal(s.changes.at(-1), false);
  s.controller.dispose(); const before = s.calls.length;
  s.win.navigator.onLine = true; s.win.dispatchEvent(new Event('online')); s.channel.sync();
  await s.controller.settled(); assert.equal(s.calls.length, before);
});

test('failed tracking stays gray without automatic retry; closing during a pending entry cannot turn green', async () => {
  const failed = setup({ track: () => 'error' });
  failed.channel.state = { peer: [{ user_id: 'peer', active: true }] };
  failed.controller.status('SUBSCRIBED'); await failed.controller.settled(); failed.channel.sync();
  assert.deepEqual(failed.changes, [false]); assert.equal(failed.calls.length, 1); failed.controller.dispose();
  let resolve;
  const waiting = setup({ track: () => new Promise(done => { resolve = done; }) });
  waiting.controller.status('SUBSCRIBED'); await Promise.resolve();
  waiting.controller.dispose(); resolve('ok'); await waiting.controller.settled();
  assert.deepEqual(waiting.changes, [false]);
});

test('multiple devices of the same peer remain green until the last visible session leaves', async () => {
  const s = setup(); s.controller.status('SUBSCRIBED'); await s.controller.settled();
  s.channel.state = { one: [{ user_id: 'peer', active: true }], two: [{ user_id: 'peer', active: true }] };
  s.channel.sync(); assert.equal(s.changes.at(-1), true);
  delete s.channel.state.one; s.channel.sync(); assert.equal(s.changes.at(-1), true);
  delete s.channel.state.two; s.channel.sync(); assert.equal(s.changes.at(-1), false);
  s.controller.dispose();
});

test('private presence policies admit only verified participants of an open chat, even with broader existing policies', async () => {
  const db = new PGlite(), id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;create schema realtime;
      create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''test.uid'',true),'''')::uuid';
      create function auth.jwt() returns jsonb language sql stable as 'select coalesce(nullif(current_setting(''test.jwt'',true),''''),''{}'')::jsonb';
      create function realtime.topic() returns text language sql stable as 'select current_setting(''test.topic'',true)';
      create table auth.users(id uuid primary key,email_confirmed_at timestamptz default now());
      create table public.usuarios(id uuid primary key,is_blocked bool default false,bloqueado bool default false,ban_until timestamptz);
      create table public.chats(id uuid primary key,buyer_id uuid,seller_id uuid,owner_id uuid,status text);
      create table realtime.messages(extension text,topic text);alter table realtime.messages enable row level security;
      grant usage on schema auth,realtime,public to authenticated,anon;grant select,insert on realtime.messages to authenticated,anon;
      create policy broad_read on realtime.messages for select to authenticated using(true);
      create policy broad_write on realtime.messages for insert to authenticated with check(true);
      insert into auth.users(id) values('${id(1)}'),('${id(2)}'),('${id(3)}');insert into usuarios(id) select id from auth.users;
      insert into chats values('${id(10)}','${id(1)}','${id(2)}','${id(2)}','open');
      insert into realtime.messages values('presence','mb:chat:${id(10)}'),('broadcast','mb:chat:${id(10)}');`);
    const migration = await readFile(new URL('../supabase/migrations/2026-11-19-chat-presence.sql', import.meta.url), 'utf8');
    await db.exec(migration); await db.exec(migration);
    const as = async (n, topic = `mb:chat:${id(10)}`, jwt = '{}') => {
      await db.exec('reset role;set role authenticated');
      await db.query("select set_config('test.uid',$1,false),set_config('test.topic',$2,false),set_config('test.jwt',$3,false)", [id(n), topic, jwt]);
    };
    for (const n of [1, 2]) {
      await as(n); assert.equal((await db.query('select * from realtime.messages')).rows.length, 1);
    }
    await assert.rejects(db.query("insert into realtime.messages values('broadcast',$1)", [`mb:chat:${id(10)}`]), /policy/);
    await as(3); assert.equal((await db.query('select * from realtime.messages')).rows.length, 0);
    await assert.rejects(db.query("insert into realtime.messages values('presence',$1)", [`mb:chat:${id(10)}`]), /policy/);
    await as(1, 'mb:chat:not-a-uuid'); assert.equal((await db.query('select * from realtime.messages')).rows.length, 0);
    await as(1, `mb:chat:${id(10)}`, '{"is_anonymous":true}'); assert.equal((await db.query('select * from realtime.messages')).rows.length, 0);
    await db.exec(`reset role;update usuarios set ban_until=now()+interval '1 day' where id='${id(1)}';`);
    await as(1); assert.equal((await db.query('select * from realtime.messages')).rows.length, 0);
    await db.exec(`reset role;update usuarios set ban_until=null;update auth.users set email_confirmed_at=null where id='${id(1)}';`);
    await as(1); assert.equal((await db.query('select * from realtime.messages')).rows.length, 0);
    await db.exec(`reset role;update chats set status='closed';`);
    await as(2); assert.equal((await db.query('select * from realtime.messages')).rows.length, 0);
    await db.exec('reset role;set role anon');
    assert.equal((await db.query('select * from realtime.messages')).rows.length, 0);
    await assert.rejects(db.query("select public.chat_presence_allowed('mb:chat:x')"), { code: '42501' });
  } finally { await db.close(); }
});
