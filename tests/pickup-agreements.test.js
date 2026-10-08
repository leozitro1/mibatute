import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { bogotaDate, validatePickupSlot, formatPickupSlot } from '../src/components/pickupAgreement.js';

const owner = '11111111-1111-1111-1111-111111111111';
const buyer = '22222222-2222-2222-2222-222222222222';
const other = '33333333-3333-3333-3333-333333333333';
const article = '44444444-4444-4444-4444-444444444444';
const chat = '55555555-5555-5555-5555-555555555555';

test('pickup date helpers use Bogota regardless of device timezone', () => {
  const now = Date.parse('2030-01-02T04:30:00Z');
  assert.equal(bogotaDate(new Date(now)), '2030-01-01');
  assert.equal(validatePickupSlot('2030-01-01', '23:31', '23:59', now), '');
  assert.match(validatePickupSlot('2030-01-01', '23:30', '23:59', now), /futuro/);
  for (const [date, start, end] of [
    ['2030-01-01', '23:31', '00:30'], ['2030-01-01', '10:00', '10:00'],
    ['2030-01-01', '10:00', '24:00'], ['2030-02-30', '10:00', '11:00'],
  ]) assert.notEqual(validatePickupSlot(date, start, end, now), '');
  assert.match(formatPickupSlot({ pickup_date: '2030-01-01', start_time: '09:00:00', end_time: '11:00:00' }), /09:00 - 11:00/);
});

test('pickup RPCs enforce participants, reservation and state', async t => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql stable as
        'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
      create table auth.users(id uuid primary key);
      create table public.usuarios(id uuid primary key,is_blocked boolean default false,
        bloqueado boolean default false,blocked boolean default false,ban_until timestamptz);
      create table public.articulos(id uuid primary key,owner_id uuid,mode text,status text,estado text,
        buyer_id uuid,ganador_id uuid,winner_id uuid,recipient_id uuid);
      create table public.chats(id uuid primary key,articulo_id uuid references public.articulos,
        buyer_id uuid,seller_id uuid,owner_id uuid,usuario_id uuid,status text);
      alter table public.chats enable row level security;
      create policy chat_read on public.chats for select using(auth.uid() in (buyer_id,seller_id));
      grant usage on schema auth,public to authenticated;
      grant select on public.chats to authenticated;
      alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;
      alter default privileges in schema public grant select on tables to anon;
      insert into auth.users values('${owner}'),('${buyer}'),('${other}');
      insert into public.usuarios(id) select id from auth.users;
    `);
    const migration = await readFile(new URL('../supabase/migrations/2026-10-08-pickup-agreements.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    const asUser = async id => {
      await db.exec('reset role; set role authenticated;');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    };
    const reset = async (mode = 'venta') => {
      await db.exec('reset role; truncate public.chat_pickups,public.chats,public.articulos; update public.usuarios set is_blocked=false,bloqueado=false,blocked=false,ban_until=null;');
      await db.query("insert into public.articulos values($1,$2,$3,'reservado','reservado',$4,$5,null,null)",
        [article, owner, mode, mode === 'venta' ? buyer : null, mode === 'donacion' ? buyer : null]);
      await db.query("insert into public.chats values($1,$2,$3,$4,$4,null,'open')", [chat, article, buyer, owner]);
      await asUser(owner);
    };
    const propose = async (replace = null, date = '2099-01-01', start = '09:00', end = '11:00', chatId = chat) =>
      (await db.query('select to_jsonb(public.propose_chat_pickup($1,$2::date,$3::time,$4::time,$5)) as result',
        [chatId, date, start, end, replace])).rows[0].result;
    const respond = async (id, action) => (await db.query('select to_jsonb(public.respond_chat_pickup($1,$2)) as result', [id, action])).rows[0].result;
    const rows = async () => (await db.query('select * from public.chat_pickups order by created_at,id')).rows;

    await t.test('migration can be reapplied with history and realtime membership intact', async () => {
      await reset(); const pending = await propose();
      await db.exec('reset role; create publication supabase_realtime;');
      await db.exec(migration); await db.exec(migration);
      await asUser(owner);
      assert.equal((await rows())[0].id, pending.id);
      assert.equal((await rows())[0].status, 'pending');
      await assert.rejects(db.query("update public.chat_pickups set status='confirmed'"), /permission denied/);
      await db.exec('reset role;');
      assert.equal((await db.query("select * from pg_publication_tables where pubname='supabase_realtime' and tablename='chat_pickups'")).rows.length, 1);
    });

    await t.test('only the other participant confirms; repeats cannot change confirmation', async () => {
      await reset(); const pending = await propose();
      assert.equal(pending.proposed_by, owner);
      await assert.rejects(respond(pending.id, 'confirm'), /otra persona/);
      await assert.rejects(respond(pending.id, 'reject'), /otra persona/);
      await asUser(buyer);
      const confirmed = await respond(pending.id, 'confirm');
      assert.equal(confirmed.status, 'confirmed'); assert.equal(confirmed.confirmed_by, buyer);
      assert.ok(confirmed.confirmed_at);
      await assert.rejects(respond(pending.id, 'confirm'), /otra persona/);
      assert.equal((await rows())[0].confirmed_at.toISOString(), new Date(confirmed.confirmed_at).toISOString());
      await respond(pending.id, 'cancel');
      await assert.rejects(respond(pending.id, 'confirm'), /ya cambio/);
    });

    await t.test('privacy, anonymous access and direct writes remain denied despite default grants', async () => {
      await reset(); const pending = await propose();
      await assert.rejects(db.query("insert into public.chat_pickups(chat_id,proposed_by,pickup_date,start_time,end_time) values($1,$2,'2099-01-02','10:00','11:00')", [chat,owner]), /permission denied/);
      await assert.rejects(db.query("update public.chat_pickups set status='confirmed'"), /permission denied/);
      await assert.rejects(db.query('delete from public.chat_pickups'), /permission denied/);
      await assert.rejects(db.query('select public.lock_pickup_chat($1)', [chat]), /permission denied/);
      await asUser(other); assert.equal((await rows()).length, 0);
      await assert.rejects(propose(), /permiso/);
      await assert.rejects(respond(pending.id, 'confirm'), /permiso/);
      await asUser(''); await assert.rejects(propose(), /iniciar sesion/);
      await db.exec('reset role; set role anon;');
      await assert.rejects(rows(), /permission denied/);
      await assert.rejects(propose(), /permission denied/);
      await assert.rejects(respond(pending.id, 'confirm'), /permission denied/);
    });

    await t.test('blocked flags and active bans deny every mutation on server', async () => {
      for (const flag of ['is_blocked=true', 'bloqueado=true', 'blocked=true', "ban_until=now()+interval '1 hour'"]) {
        await reset(); const pending = await propose();
        await db.exec(`reset role; update public.usuarios set ${flag} where id='${buyer}';`);
        await asUser(buyer); assert.equal((await rows()).length, 0);
        for (const action of ['confirm','reject','cancel']) await assert.rejects(respond(pending.id, action), /bloqueada/);
        await assert.rejects(propose(pending.id), /bloqueada/);
        await asUser(owner); await assert.rejects(respond(pending.id, 'cancel'), /bloqueada/);
      }
    });

    await t.test('open chat, matching owner and reserved sale/donation recipient are required', async () => {
      for (const mode of ['venta','donacion']) {
        await reset(mode); await propose();
        for (const update of [
          "update public.chats set status='pending'", "update public.chats set status='closed'",
          "update public.articulos set status='disponible'", "update public.articulos set estado='entregado'",
          `update public.chats set seller_id='${other}'`, `update public.chats set owner_id='${other}'`,
          `update public.chats set usuario_id='${other}'`,
          mode === 'venta' ? `update public.articulos set buyer_id='${other}'` : `update public.articulos set ganador_id='${other}'`,
        ]) {
          await reset(mode); await db.exec('reset role; ' + update); await asUser(buyer);
          await assert.rejects(propose(), /reserva activa valida/);
        }
      }
      for (const field of ['winner_id','recipient_id']) {
        await reset('donacion');
        await db.exec(`reset role; update public.articulos set ganador_id=null,${field}='${buyer}';`);
        await asUser(buyer); assert.equal((await propose()).status, 'pending');
      }
    });

    await t.test('past/null/reversed/overnight slots are rejected using server time', async () => {
      await reset();
      for (const [date,start,end] of [
        ['2000-01-01','09:00','11:00'], ['2099-01-01','11:00','09:00'],
        ['2099-01-01','09:00','09:00'], ['2099-01-01','23:00','24:00'],
        [null,'09:00','11:00'], ['2099-01-01',null,'11:00'],
      ]) await assert.rejects(propose(null,date,start,end), /fecha futura/);
      const slot = (await db.query("select to_char(now() at time zone 'America/Bogota','YYYY-MM-DD') as day, (now() at time zone 'America/Bogota')::time as start")).rows[0];
      await assert.rejects(propose(null, slot.day, slot.start, '23:59:59.999999'), /fecha futura/);
      const pending = await propose();
      await db.exec("reset role; update public.chat_pickups set pickup_date='2000-01-01';");
      await asUser(buyer); await assert.rejects(respond(pending.id, 'confirm'), /ya paso/);
    });

    await t.test('replacement is explicit, atomic and preserves history; stale IDs cannot replace a newer proposal', async () => {
      await reset(); const first = await propose();
      await assert.rejects(propose(), /explicitamente/);
      await asUser(buyer); await respond(first.id, 'confirm');
      await assert.rejects(propose(first.id, '2000-01-01'), /fecha futura/);
      assert.equal((await rows())[0].status, 'confirmed');
      const second = await propose(first.id);
      assert.equal(second.status, 'pending'); assert.equal(second.confirmed_by, null);
      assert.equal((await rows()).find(row => row.id === first.id).status, 'replaced');
      await assert.rejects(propose(first.id), /explicitamente/);
      await assert.rejects(respond(first.id, 'cancel'), /ya cambio/);
      await asUser(owner); await respond(second.id, 'reject');
      await assert.rejects(propose(second.id), /recogida cambio/);
      assert.equal((await propose()).status, 'pending');
    });

    await t.test('a failed replacement insert rolls back the retired predecessor; unique index backs RPC serialization', async () => {
      await reset(); const pending = await propose();
      await db.exec("reset role; alter table public.chat_pickups add constraint test_insert_failure check(status <> 'pending') not valid;");
      await asUser(buyer); await assert.rejects(propose(pending.id), /test_insert_failure/);
      assert.equal((await rows())[0].status, 'pending');
      await db.exec('reset role; alter table public.chat_pickups drop constraint test_insert_failure;');
      await assert.rejects(db.query("insert into public.chat_pickups(chat_id,proposed_by,pickup_date,start_time,end_time) values($1,$2,'2099-01-01','09:00','10:00')", [chat,buyer]), /chat_pickups_one_active/);
    });

    await t.test('competing queued confirmations/replacements leave one active agreement', async () => {
      await reset(); const first = await propose(); await asUser(buyer);
      const confirmations = await Promise.allSettled([respond(first.id, 'confirm'), respond(first.id, 'confirm')]);
      assert.equal(confirmations.filter(result => result.status === 'fulfilled').length, 1);
      const replacements = await Promise.allSettled([propose(first.id), propose(first.id)]);
      assert.equal(replacements.filter(result => result.status === 'fulfilled').length, 1);
      assert.equal((await rows()).filter(row => ['pending','confirmed'].includes(row.status)).length, 1);
    });

    await t.test('reservation end/change and closed chat retire agreements; reopening never resurrects them', async () => {
      for (const update of [
        "update public.chats set status='closed'",
        "update public.articulos set status='entregado',estado='entregado'",
        `update public.articulos set buyer_id='${other}'`,
      ]) {
        await reset(); const pending = await propose(); await asUser(buyer); await respond(pending.id, 'confirm');
        await db.exec('reset role; ' + update); await asUser(owner);
        assert.equal((await rows())[0].status, update.includes('entregado') ? 'completed' : 'canceled');
        await assert.rejects(respond(pending.id, 'cancel'), /reserva activa valida/);
        await db.exec(`reset role; update public.articulos set status='reservado',estado='reservado',buyer_id='${buyer}'; update public.chats set status='open';`);
        await asUser(owner); await assert.rejects(respond(pending.id, 'cancel'), /ya cambio/);
        assert.equal((await propose()).status, 'pending');
      }
    });

    await t.test('either participant can cancel; invalid actions and missing IDs fail', async () => {
      for (const actor of [owner,buyer]) {
        await reset(); const pending = await propose(); await asUser(actor);
        assert.equal((await respond(pending.id, 'cancel')).ended_by, actor);
      }
      await reset(); const pending = await propose();
      for (const action of ['deliver','',null]) await assert.rejects(respond(pending.id, action), /Accion/);
      await assert.rejects(respond(other, 'confirm'), /Chat no disponible/);
    });

    await t.test('delivery closing chat before article retirement preserves completed confirmations', async () => {
      await db.exec(`reset role;
        create function public.test_close_delivered_chat() returns trigger language plpgsql as $$ begin
          if new.status='entregado' then update public.chats set status='closed' where articulo_id=new.id; end if;
          return new;
        end $$;
        create trigger activate_test_delivery after update on public.articulos
          for each row execute function public.test_close_delivered_chat();
      `);
      for (const mode of ['venta','donacion']) {
        for (const confirmed of [false,true]) {
          await reset(mode); const pending = await propose();
          if (confirmed) { await asUser(buyer); await respond(pending.id,'confirm'); }
          await db.exec("reset role; update public.articulos set status='entregado',estado='entregado';");
          await asUser(owner); const saved = (await rows())[0];
          assert.equal(saved.status, confirmed ? 'completed' : 'canceled');
          if (confirmed) { assert.equal(saved.confirmed_by,buyer); assert.ok(saved.confirmed_at); }
          assert.ok(saved.ended_at);
        }
      }
    });
  } finally { await db.close(); }
});
