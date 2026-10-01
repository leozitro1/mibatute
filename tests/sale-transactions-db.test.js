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
        seller_id uuid, owner_id uuid, status text, updated_at timestamptz,
        unique (articulo_id, buyer_id)
      );
      alter table public.articulos enable row level security;
      create policy owner_update on public.articulos for update using (owner_id = auth.uid());
      create policy articles_read on public.articulos for select using (true);
      grant usage on schema auth, public to authenticated;
      grant select, update on public.articulos to authenticated;
      grant select on public.chats to authenticated;
      insert into auth.users values ('${seller}', now()), ('${buyer}', now()), ('${other}', now());
      insert into public.usuarios values ('${seller}', false), ('${buyer}', false), ('${other}', false);
    `);
    await db.exec(await readFile(new URL("../supabase/migrations/2026-09-30-sale-transactions.sql", import.meta.url), "utf8"));
    const asUser = async userId => {
      await db.exec("reset role; set role authenticated;");
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
    };
    const reset = async () => {
      await db.exec(`reset role; truncate public.chats, public.articulos;
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
      assert.equal(result.chat.status, "open");
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
      assert.equal(second.chat.status, "open");
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
