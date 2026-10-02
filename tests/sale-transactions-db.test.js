import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const seller = "11111111-1111-1111-1111-111111111111";
const buyer = "22222222-2222-2222-2222-222222222222";
const other = "33333333-3333-3333-3333-333333333333";
const articleId = "44444444-4444-4444-4444-444444444444";

test("PostgreSQL sale transactions", async t => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table auth.users (id uuid primary key, email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as
        'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
      create table public.usuarios (id uuid primary key, bloqueado boolean default false);
      create table public.articulos (
        id uuid primary key, owner_id uuid not null, mode text not null default 'venta',
        status text not null default 'disponible', estado text not null default 'disponible',
        buyer_id uuid, comprador_id uuid, reserved_at timestamptz,
        delivered_at timestamptz, updated_at timestamptz
      );
      create table public.chats (
        id uuid primary key default gen_random_uuid(), articulo_id uuid, buyer_id uuid,
        seller_id uuid, owner_id uuid, usuario_id uuid, status text, updated_at timestamptz,
        unique (articulo_id, buyer_id)
      );
      create table public.chat_messages (id uuid default gen_random_uuid(), chat_id uuid, sender_id uuid, body text);
      create table public.chat_reads (chat_id uuid);
      create table public.postulaciones (articulo_id uuid);
      create table public.articulo_imagenes (articulo_id uuid);
      create table public.postulaciones_rechazadas (articulo_id uuid);
      create table public.postulacion_historial (articulo_id uuid);
      create table public.reports (articulo_id uuid);
      create table public.chat_reports (articulo_id uuid);
      alter table public.articulos enable row level security;
      create policy owner_update on public.articulos for update using (owner_id = auth.uid());
      create policy articles_read on public.articulos for select using (true);
      create policy owner_delete on public.articulos for delete using (owner_id = auth.uid());
      grant usage on schema auth, public to authenticated;
      grant select, update, delete on public.articulos to authenticated;
      grant select, insert, update, delete on public.chats to authenticated;
      grant select, insert, delete on public.chat_messages to authenticated;
      insert into auth.users values ('${seller}', now()), ('${buyer}', now()), ('${other}', now());
      insert into public.usuarios values ('${seller}', false), ('${buyer}', false), ('${other}', false);
    `);
    await db.exec(await readFile(new URL("../supabase/migrations/2026-09-30-sale-transactions.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../supabase/migrations/2026-10-01-sale-chat-approval.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../supabase/migrations/2026-10-01-sale-cancellation.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../supabase/migrations/2026-10-01-approved-sale-retention.sql", import.meta.url), "utf8"));
    const asUser = async userId => {
      await db.exec("reset role; set role authenticated;");
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
    };
    const reset = async () => {
      await db.exec(`reset role; truncate public.chat_messages, public.chats, public.articulos;
        update public.usuarios set bloqueado = false;
        update auth.users set email_confirmed_at = now();
        insert into public.articulos(id, owner_id) values ('${articleId}', '${seller}');`);
      await asUser(buyer);
    };
    const transition = async action => (await db.query(
      "select public.transition_sale($1::uuid, $2) as result", [articleId, action])).rows[0].result;
    const saved = async () => (await db.query("select * from public.articulos where id = $1", [articleId])).rows[0];

    await t.test("direct buyer update changes zero rows; RPC reserves and creates chat", async () => {
      await reset();
      assert.equal((await db.query("update public.articulos set status = 'reservado' where id = $1 returning id", [articleId])).rows.length, 0);
      const result = await transition("reserve");
      assert.equal(result.article.status, "reservado");
      assert.equal(result.article.estado, "reservado");
      assert.equal(result.article.buyer_id, buyer);
      assert.equal(result.chat.buyer_id, buyer);
      assert.equal(result.chat.seller_id, seller);
      assert.equal(result.chat.status, "pending");
      assert.equal((await saved()).buyer_id, buyer);
    });

    await t.test("same buyer can retry; a second buyer cannot take the reservation", async () => {
      await reset();
      const first = await transition("reserve");
      assert.equal((await transition("reserve")).chat.id, first.chat.id);
      await asUser(other);
      await assert.rejects(transition("reserve"), /ya no esta disponible/);
      assert.equal((await saved()).buyer_id, buyer);
    });

    await t.test("buyer cancels, closed chat reopens only on a new confirmed reservation", async () => {
      await reset();
      const first = await transition("reserve");
      const canceled = await transition("cancel");
      assert.equal(canceled.article.buyer_id, null);
      assert.equal(canceled.article.status, "disponible");
      assert.equal((await db.query("select status from public.chats")).rows[0].status, "closed");
      const second = await transition("reserve");
      assert.equal(second.chat.id, first.chat.id);
      assert.equal(second.chat.status, "pending");
    });

    await t.test("only seller delivers; completed sale retains buyer and closes chat", async () => {
      await reset();
      await transition("reserve");
      await assert.rejects(transition("deliver"), /Solo el vendedor/);
      await asUser(seller);
      const delivered = await transition("deliver");
      assert.equal(delivered.article.status, "entregado");
      assert.equal(delivered.article.buyer_id, buyer);
      assert.ok(delivered.article.delivered_at);
      assert.equal((await db.query("select status from public.chats")).rows[0].status, "closed");
      await assert.rejects(transition("cancel"), /reserva activa/);
    });

    await t.test("owner cannot buy; strangers cannot cancel or deliver", async () => {
      await reset();
      await asUser(seller);
      await assert.rejects(transition("reserve"), /propio articulo/);
      await asUser(buyer);
      await transition("reserve");
      await asUser(other);
      await assert.rejects(transition("cancel"), /No puedes cancelar/);
      await assert.rejects(transition("deliver"), /Solo el vendedor/);
    });

    await t.test("seller can cancel; unauthenticated callers cannot reserve", async () => {
      await reset();
      await transition("reserve");
      await asUser(seller);
      assert.equal((await transition("cancel")).article.status, "disponible");
      await asUser("");
      await assert.rejects(transition("reserve"), /iniciar sesion/);
      await db.exec("reset role; set role anon;");
      await assert.rejects(transition("reserve"), /permission denied/);
    });

    await t.test("paused, blocked, unverified and donation purchases are rejected", async () => {
      for (const [update, message] of [
        ["update public.articulos set status = 'pausado', estado = 'pausado'", /disponible/],
        ["update public.usuarios set bloqueado = true where id = '" + buyer + "'", /bloqueada/],
        ["update auth.users set email_confirmed_at = null where id = '" + buyer + "'", /Verifica/],
        ["update public.articulos set mode = 'donacion'", /venta valida/],
      ]) {
        await reset();
        await db.exec("reset role; " + update);
        await asUser(buyer);
        await assert.rejects(transition("reserve"), message);
      }
    });

    await t.test("pending sale blocks buyer approval, spoofed participants and messages until seller opens chat", async () => {
      await reset();
      const reservation = await transition("reserve");
      const send = () => db.query("insert into public.chat_messages(chat_id,sender_id,body) values ($1,$2,'Hola')", [reservation.chat.id, buyer]);
      await assert.rejects(send(), /aprobar la compra/);
      await assert.rejects(transition("approve_chat"), /Solo el vendedor/);
      await assert.rejects(db.query("update public.chats set status='open' where id=$1", [reservation.chat.id]), /aprobar la compra/);
      await assert.rejects(db.query("update public.chats set seller_id=$1 where id=$2", [buyer, reservation.chat.id]), /participantes/);
      await assert.rejects(db.query("insert into public.chats(articulo_id,buyer_id,seller_id,owner_id,status) values ($1,$2,$3,$3,'open')", [articleId, other, seller]), /reserva activa/);
      await asUser(seller);
      assert.equal((await transition("approve_chat")).chat.status, "open");
      assert.equal((await transition("approve_chat")).chat.id, reservation.chat.id);
      await db.exec("reset role;");
      await db.exec(await readFile(new URL("../supabase/migrations/2026-10-01-sale-chat-approval.sql", import.meta.url), "utf8"));
      assert.equal((await db.query("select status from public.chats where id=$1", [reservation.chat.id])).rows[0].status, "open");
      await asUser(buyer);
      await send();
      assert.equal((await transition("reserve")).chat.status, "open");
      await assert.rejects(transition("cancel"), /ya fue aprobada/);
      await asUser(seller);
      await transition("deliver");
      await assert.rejects(send(), /chat debe estar activo/);
    });

    await t.test("donation conversations remain outside sale approval flow", async () => {
      await reset();
      await db.exec("reset role; update public.articulos set mode='donacion';");
      await asUser(buyer);
      const result = await db.query("insert into public.chats(articulo_id,buyer_id,seller_id,owner_id,status) values ($1,$2,$3,$3,'open') returning id", [articleId,buyer,seller]);
      await db.query("insert into public.chat_messages(chat_id,sender_id,body) values ($1,$2,'Hola')", [result.rows[0].id,buyer]);
    });

    await t.test("server records cancellation actor and time, resets only on a new reservation", async () => {
      await reset();
      const first = await transition('reserve');
      await asUser(seller);
      await transition('cancel');
      const canceled = (await db.query('select * from public.chats where id=$1', [first.chat.id])).rows[0];
      assert.equal(canceled.canceled_by, seller);
      assert.ok(canceled.canceled_at);
      await asUser(buyer);
      await db.query('update public.chats set canceled_at=null,canceled_by=$1 where id=$2', [buyer,first.chat.id]);
      const persisted = (await db.query('select * from public.chats where id=$1', [first.chat.id])).rows[0];
      assert.equal(persisted.canceled_by, seller);
      assert.equal(String(persisted.canceled_at), String(canceled.canceled_at));
      const second = await transition('reserve');
      assert.equal(second.chat.canceled_at, null);
      assert.equal(second.chat.canceled_by, null);
      await transition('cancel');
      assert.equal((await db.query('select canceled_by from public.chats where id=$1', [first.chat.id])).rows[0].canceled_by, buyer);
      await transition('reserve');
      await asUser(seller);
      await transition('deliver');
      assert.equal((await db.query('select canceled_at from public.chats where id=$1', [first.chat.id])).rows[0].canceled_at, null);
    });

    await t.test("seller approval prevents cancellation and deleting the sale or conversation, even after closing chat", async () => {
      await reset();
      const reservation = await transition('reserve');
      await asUser(seller);
      const approved = await transition('approve_chat');
      assert.ok(approved.chat.approved_at);
      await assert.rejects(transition('cancel'), /ya fue aprobada/);
      await assert.rejects(db.query('delete from public.articulos where id=$1', [articleId]), /siete dias/);
      await assert.rejects(db.query('delete from public.chats where id=$1', [reservation.chat.id]), /siete dias/);
      await assert.rejects(db.query('select public.delete_article_deep($1)', [articleId]), /siete dias/);
      await db.query("update public.chats set status='closed',approved_at=null where id=$1", [reservation.chat.id]);
      assert.ok((await db.query('select approved_at from public.chats where id=$1', [reservation.chat.id])).rows[0].approved_at);
      await assert.rejects(transition('cancel'), /ya fue aprobada/);
      assert.equal((await saved()).status, 'reservado');
      await asUser(buyer);
      await assert.rejects(db.query('select public.delete_article_deep($1)', [articleId]), /propietario/);
      await assert.rejects(transition('cancel'), /ya fue aprobada/);
      await assert.rejects(db.query('delete from public.chats where id=$1', [reservation.chat.id]), /siete dias/);
    });

    await t.test("delivered sales retain data for a week with an immutable delivery timestamp", async () => {
      await reset();
      await transition('reserve');
      await asUser(seller);
      await transition('approve_chat');
      const delivered = await transition('deliver');
      assert.ok(delivered.article.delivered_at);
      await assert.rejects(db.query('delete from public.articulos where id=$1', [articleId]), /siete dias/);
      await assert.rejects(db.query("update public.articulos set delivered_at=now()-interval '8 days' where id=$1", [articleId]), /fecha de entrega/);
      await assert.rejects(db.query("update public.articulos set status='disponible',estado='disponible' where id=$1", [articleId]), /reabrirse/);
      await db.exec("reset role; select set_config('request.jwt.claim.sub','',false);");
      await db.query("update public.articulos set delivered_at=now()-interval '7 days' where id=$1", [articleId]);
      await asUser(seller);
      assert.equal((await db.query('delete from public.articulos where id=$1 returning id', [articleId])).rows.length, 1);
    });

    await t.test("chat insertion failure rolls back buyer assignment and reservation", async () => {
      await reset();
      await db.exec("reset role; alter table public.chats add constraint test_chat_failure check (false);");
      await asUser(buyer);
      await assert.rejects(transition("reserve"), /test_chat_failure/);
      assert.equal((await saved()).status, "disponible");
      assert.equal((await saved()).buyer_id, null);
    });
  } finally {
    await db.close();
  }
});
