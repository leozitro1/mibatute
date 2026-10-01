import test from "node:test";
import assert from "node:assert/strict";
import { preferLatestArticle } from "../src/components/articleState.js";

test("old cached articles cannot overwrite persisted reservations", () => {
  const fresh = { id: "a1", status: "reservado", buyer_id: "u1", updated_at: "2026-10-01T01:00:00Z" };
  const cached = { id: "a1", status: "disponible", buyer_id: null, updated_at: "2026-09-30T23:00:00Z" };
  assert.deepEqual(preferLatestArticle(fresh, cached), fresh);
  assert.deepEqual(preferLatestArticle(cached, fresh), fresh);
});

test("confirmed delivery supersedes a local pause override", () => {
  const paused = { status: "pausado", updated_at: "2026-09-30T23:00:00Z" };
  const delivered = { status: "entregado", updated_at: "2026-10-01T01:00:00Z" };
  assert.equal(preferLatestArticle(delivered, paused).status, "entregado");
});

test("partial updates preserve photos and missing dates still merge", () => {
  const article = { id: "a1", image_url: "photo.webp", status: "disponible" };
  assert.equal(preferLatestArticle(article, { status: "reservado" }).image_url, "photo.webp");
  assert.equal(preferLatestArticle(article, { status: "reservado" }).status, "reservado");
  assert.equal(preferLatestArticle(article, null), article);
});
