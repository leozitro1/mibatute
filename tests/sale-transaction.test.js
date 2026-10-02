import test from "node:test";
import assert from "node:assert/strict";
import { transitionSale } from "../src/supabase/saleTransaction.js";

const article = { id: "a1", buyer_id: "u1", status: "reservado", estado: "reservado" };
const chat = { id: "c1", articulo_id: "a1", buyer_id: "u1", status: "open" };

test("sale confirmation uses server article and chat", async () => {
  const client = { async rpc(name, args) {
    assert.equal(name, "transition_sale");
    assert.deepEqual(args, { p_articulo_id: "a1", p_action: "reserve" });
    return { data: { article, chat }, error: null };
  } };
  assert.deepEqual(await transitionSale(client, "a1", "reserve"), { article, chat });
});

test("empty or inconsistent results never report a successful purchase", async () => {
  for (const data of [null, { article }, { article, chat: { ...chat, buyer_id: "other" } },
    { article: { ...article, status: "disponible" }, chat }, { article, chat: { ...chat, status: "closed" } }]) {
    await assert.rejects(transitionSale({ rpc: async () => ({ data }) }, "a1", "reserve"), /no confirmo/);
  }
});

test("missing migration and rejected purchases return actionable errors", async () => {
  await assert.rejects(transitionSale({ rpc: async () => ({ error: { code: "PGRST202" } }) }, "a1", "reserve"), /Supabase/);
  await assert.rejects(transitionSale({ rpc: async () => ({ error: { message: "Ya no esta disponible" } }) }, "a1", "reserve"), /disponible/);
});

test("cancel and delivery validate the persisted state", async () => {
  for (const [action, status, buyer] of [["cancel", "disponible", null], ["deliver", "entregado", "u1"]]) {
    const updated = { ...article, estado: status, status, buyer_id: buyer };
    assert.deepEqual(await transitionSale({ rpc: async () => ({ data: { article: updated } }) }, "a1", action),
      { article: updated, chat: undefined });
  }
});

test("new reservations accept pending chats but approval requires an open chat", async () => {
  const pending = { ...chat, status: "pending" };
  const client = { rpc: async () => ({ data: { article, chat: pending } }) };
  assert.equal((await transitionSale(client, "a1", "reserve")).chat.status, "pending");
  await assert.rejects(transitionSale(client, "a1", "approve_chat"), /no confirmo/);
  assert.equal((await transitionSale({ rpc: async () => ({ data: { article, chat } }) }, "a1", "approve_chat")).chat.status, "open");
});
