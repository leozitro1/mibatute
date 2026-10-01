import test from "node:test";
import assert from "node:assert/strict";
import { queryMisRescates, isRescateVisible, canOpenRescateChat } from "../src/supabase/rescatesQuery.js";

function mockClient(results, calls = []) {
  return {
    from(table) {
      return {
        select(columns) {
          for (const old of ["modo", "precio", "ciudad", "localidad_es", "titulo", "tipo"]) {
            assert.equal(new RegExp(`\\b${old}\\b`).test(columns), false);
          }
          return {
            async eq(column, id) {
              calls.push({ table, column, id });
              return results[table] || { data: [], error: null };
            },
          };
        },
      };
    },
  };
}

test("rescues include applications and purchases without a chat", async () => {
  const calls = [];
  const donation = { id: "d1", title: "Mesa", mode: "donacion" };
  const sale = { id: "s1", title: "Bici", mode: "venta", buyer_id: "u1", created_at: "2026-09-30" };
  const client = mockClient({
    postulaciones: { data: [{ id: "p1", articulo_id: "d1", articulo: donation, created_at: "2026-09-29" }] },
    articulos: { data: [sale] },
  }, calls);
  const result = await queryMisRescates(client, "u1");
  assert.equal(result.error, null);
  assert.deepEqual(result.data.map(row => row.articulo_id), ["s1", "d1"]);
  assert.deepEqual(calls, [
    { table: "postulaciones", column: "usuario_id", id: "u1" },
    { table: "chats", column: "buyer_id", id: "u1" },
    { table: "articulos", column: "buyer_id", id: "u1" },
  ]);
});

test("a purchase found through both chat and article appears once", async () => {
  const article = { id: "s1", mode: "venta", buyer_id: "u1", created_at: "2026-09-29" };
  const result = await queryMisRescates(mockClient({
    chats: { data: [{ id: "c1", articulo_id: "s1", articulo: article, created_at: "2026-09-30" }] },
    articulos: { data: [article] },
  }), "u1");
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].id, "c1");
  assert.equal(result.data[0].created_at, "2026-09-30");
});

test("query errors are returned instead of a successful empty history", async () => {
  const error = { message: "Permission denied" };
  const result = await queryMisRescates(mockClient({ postulaciones: { error } }), "u1");
  assert.equal(result.error, error);
});

test("missing user does not query another user's rescues", async () => {
  const calls = [];
  assert.deepEqual(await queryMisRescates(mockClient({}, calls), null), { data: [], error: null });
  assert.equal(calls.length, 0);
});

test("sales contacted or applied to appear before assigning a buyer", async () => {
  const result = await queryMisRescates(mockClient({
    chats: { data: [{ id: "c1", articulo_id: "s1", created_at: "2026-09-30",
      articulo: { id: "s1", mode: "venta", status: "disponible", buyer_id: null } }] },
    postulaciones: { data: [{ id: "p1", articulo_id: "s2", created_at: "2026-09-29",
      articulo: { id: "s2", mode: "venta", status: "disponible", buyer_id: null } }] },
  }), "u1");
  assert.deepEqual(result.data.map(row => row.articulo_id), ["s1", "s2"]);
});

test("a reservation without a buyer remains visible to its requester", () => {
  assert.equal(isRescateVisible({ _source: "chats",
    articulo: { mode: "venta", status: "reservado", buyer_id: null } }, "u1"), true);
});

test("reservations assigned to another buyer or donation winner stay excluded", () => {
  for (const status of ["reservado", "entregado"]) {
    assert.equal(isRescateVisible({ _source: "chats",
      articulo: { mode: "venta", status, buyer_id: "u2" } }, "u1"), false);
    assert.equal(isRescateVisible({ _source: "postulaciones",
      articulo: { mode: "donacion", status, recipient_id: "u2" } }, "u1"), false);
  }
});

test("chat metadata survives merging an application, chat and purchase", async () => {
  const article = { id: "s1", mode: "venta", estado: "reservado", buyer_id: "u1" };
  const result = await queryMisRescates(mockClient({
    postulaciones: { data: [{ id: "p1", articulo_id: "s1", articulo: article }] },
    chats: { data: [{ id: "c1", articulo_id: "s1", articulo: article, status: "open" }] },
    articulos: { data: [article] },
  }), "u1");
  assert.equal(result.data[0]._chatId, "c1");
  assert.equal(canOpenRescateChat(result.data[0], "u1"), true);
});

test("buyer chat opens immediately and delivered history remains accessible", () => {
  for (const estado of ["reservado", "entregado"]) {
    assert.equal(canOpenRescateChat({ articulo: { mode: "venta", buyer_id: "u1", estado } }, "u1"), true);
    assert.equal(canOpenRescateChat({ articulo: { mode: "donacion", ganador_id: "u1", estado } }, "u1"), true);
  }
  assert.equal(canOpenRescateChat({ _source: "chats", _chatId: "c1",
    articulo: { mode: "venta", estado: "disponible" } }, "u1"), true);
  assert.equal(canOpenRescateChat({ articulo: { mode: "donacion", estado: "disponible" } }, "u1", true), false);
  assert.equal(canOpenRescateChat({ articulo: { mode: "venta", buyer_id: "u1", estado: "en_revision" } }, "u1", true), false);
});
