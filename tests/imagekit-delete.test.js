import test from "node:test";
import process from "node:process";
import assert from "node:assert/strict";
import handler from "../api/imagekit-delete.js";

test("ImageKit deletion authenticates and rejects another owner's files", async () => {
  process.env.IMAGEKIT_PRIVATE_KEY = "test-key";
  process.env.SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_ANON_KEY = "test-anon";
  const original = globalThis.fetch;
  const calls = [];
  let owner = "other-user";
  let missing = false;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method, signal: init.signal });
    if (String(url).includes("/auth/v1/user")) return Response.json({ id: "test-user" });
    if (String(url).endsWith("/details")) return missing ? Response.json({}, { status: 404 }) : Response.json({ filePath: `/mibatute/articulos/${owner}/foto.webp` });
    return new Response(null, { status: 204 });
  };
  const run = async (req) => {
    let status, body;
    const res = { setHeader() {}, status(s) { status = s; return this; }, json(b) { body = b; } };
    await handler(req, res);
    return { status, body };
  };
  const req = { method: "POST", headers: { authorization: "Bearer test-token" }, body: { fileIds: ["file-1"] } };
  try {
    for (const authorization of [undefined, '', 'Basic test-token', 'Bearer ', 'Bearer token extra']) {
      assert.equal((await run({ ...req, headers: { authorization } })).status, 401);
    }
    assert.equal((await run({ ...req, body: { fileIds: ['../invalid'] } })).status, 400);
    assert.equal((await run({ ...req, body: { fileIds: [] } })).status, 400);
    assert.equal(calls.length, 0, 'Invalid requests must not call Supabase or ImageKit');
    assert.equal((await run(req)).status, 403);
    assert.equal(calls.some(c => c.method === "DELETE"), false);
    owner = "test-user";
    assert.equal((await run(req)).status, 200);
    assert.equal(calls.filter(c => c.method === "DELETE").length, 1);
    assert.equal(calls.filter(c => c.url.includes('api.imagekit.io')).every(c => c.signal instanceof AbortSignal), true);
    missing = true;
    const start = calls.length;
    assert.equal((await run({ ...req, body: { fileIds: ['missing', 'missing'] } })).status, 200);
    assert.equal(calls.length - start, 2, 'One auth check and one details call; no duplicate ID or DELETE for absent files');
    assert.equal(calls.filter(c => c.method === 'DELETE').length, 1);
    assert.equal((await run({ ...req, body: { fileIds: ["../invalid"] } })).status, 400);
  } finally {
    globalThis.fetch = original;
  }
});
