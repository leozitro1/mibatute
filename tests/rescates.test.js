import test from "node:test";
import assert from "node:assert/strict";
import { queryMisRescates, isRescateVisible, canOpenRescateChat, saleCancellation, isRescateSaleLocked, donationRejection } from "../src/supabase/rescatesQuery.js";

function mockClient(results, calls = []) {
  return {
    async rpc(name) {
      assert.equal(name, 'my_rescue_applications');
      calls.push({ rpc: name });
      return results.postulaciones || { data: [], error: null };
    },
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
    { rpc: "my_rescue_applications" },
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

test("approved buyer chats and delivered history remain accessible", () => {
  for (const estado of ["reservado", "entregado"]) {
    assert.equal(canOpenRescateChat({ articulo: { mode: "venta", buyer_id: "u1", estado } }, "u1"), true);
    assert.equal(canOpenRescateChat({ articulo: { mode: "donacion", ganador_id: "u1", estado } }, "u1"), true);
  }
  assert.equal(canOpenRescateChat({ _source: "chats", _chatId: "c1",
    articulo: { mode: "venta", estado: "disponible" } }, "u1"), true);
  assert.equal(canOpenRescateChat({ articulo: { mode: "donacion", estado: "disponible" } }, "u1", true), false);
  assert.equal(canOpenRescateChat({ articulo: { mode: "venta", buyer_id: "u1", estado: "en_revision" } }, "u1", true), false);
});

test("pending purchases stay visible without enabling buyer chat", () => {
  const pending = { _source: "chats", _chatId: "c1", _chatStatus: "pending",
    articulo: { mode: "venta", buyer_id: "u1", estado: "reservado" } };
  assert.equal(isRescateVisible(pending, "u1"), true);
  assert.equal(canOpenRescateChat(pending, "u1", true), false);
  assert.equal(canOpenRescateChat({ ...pending, _chatStatus: "open" }, "u1", true), true);
});

test('rejected donations are gray-list candidates for 24 hours and never allow chat, even with another winner', () => {
  const at = Date.parse('2026-10-01T12:00:00Z');
  const row = { _source: 'rechazadas', _rejectedAt: new Date(at).toISOString(),
    articulo: { mode: 'donacion', estado: 'reservado', ganador_id: 'other' } };
  assert.equal(donationRejection(row).expiresAt, at + 86400000);
  assert.equal(isRescateVisible(row, 'u1', at + 86400000 - 1), true);
  assert.equal(isRescateVisible(row, 'u1', at + 86400000), false);
  assert.equal(canOpenRescateChat(row, 'u1', true), false);
});

test("buyer deletion stays locked after approval, including closed chats, until history expires", () => {
  const row = { articulo: { mode: 'venta', estado: 'reservado' }, _chatStatus: 'pending' };
  assert.equal(isRescateSaleLocked(row), false);
  assert.equal(isRescateSaleLocked({ ...row, _chatStatus: 'open' }), true);
  assert.equal(isRescateSaleLocked({ ...row, _chatStatus: 'closed', _chatApprovedAt: '2026-10-01' }), true);
  assert.equal(isRescateSaleLocked({ ...row, articulo: { mode: 'venta', estado: 'entregado' } }), true);
  assert.equal(isRescateSaleLocked({ ...row, _chatStatus: 'closed', _chatApprovedAt: '2026-10-01', articulo: { mode: 'venta', estado: 'disponible' } }), false);
});

test("seller rejection stays visible for exactly 24 hours, even after another buyer reserves", () => {
  const at = Date.parse('2026-10-01T12:00:00Z');
  const row = { _source: 'chats', _chatId: 'c1', _chatStatus: 'closed', _canceledAt: new Date(at).toISOString(), _canceledBy: 'seller',
    articulo: { mode: 'venta', owner_id: 'seller', buyer_id: 'other', estado: 'reservado' } };
  assert.equal(saleCancellation(row).bySeller, true);
  assert.equal(isRescateVisible(row, 'u1', at + 86400000 - 1), true);
  assert.equal(isRescateVisible(row, 'u1', at + 86400000), false);
  assert.equal(canOpenRescateChat(row, 'u1', true), false);
  assert.equal(isRescateVisible({ ...row, _canceledBy: 'u1' }, 'u1', at), false);
  assert.equal(saleCancellation({ ...row, _chatStatus: 'pending', _canceledAt: null }), null);
});

test("cancellation metadata survives source merges without confusing deliveries or pending purchases", async () => {
  const article = { id: 's1', mode: 'venta', owner_id: 'seller', estado: 'disponible' };
  const at = new Date().toISOString();
  const result = await queryMisRescates(mockClient({
    postulaciones: { data: [{ id: 'p1', articulo_id: 's1', articulo: article }] },
    chats: { data: [{ id: 'c1', articulo_id: 's1', articulo: article, status: 'closed', canceled_at: at, canceled_by: 'seller' }] },
  }), 'u1');
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0]._canceledAt, at);
  assert.equal(result.data[0]._canceledBy, 'seller');
  assert.equal(saleCancellation({ _chatStatus: 'closed', articulo: { ...article, estado: 'entregado', buyer_id: 'u1' } }), null);
});
