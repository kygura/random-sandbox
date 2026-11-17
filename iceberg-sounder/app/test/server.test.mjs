import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server.mjs";
import { fakeDeps } from "./fakes.mjs";

let srv, base;
before(async () => {
  srv = createApp(fakeDeps().deps);
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(() => srv.close());

test("health reports configured services", async () => {
  const r = await fetch(base + "/api/health");
  const j = await r.json();
  assert.equal(j.claude, true);
  assert.equal(j.exa, true);
});

test("serves the page with a CSP that allows video embeds", async () => {
  const r = await fetch(base + "/");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-security-policy"), /frame-src https:\/\/www\.youtube-nocookie\.com/);
  assert.match(await r.text(), /Iceberg Sounder/);
});

test("blocks path traversal and unknown files", async () => {
  for (const p of ["/../server.mjs", "/%2e%2e/server.mjs", "/package.json", "/nope.js"]) {
    const r = await fetch(base + p);
    assert.equal(r.status, 404, p);
  }
});

test("rejects an empty topic", async () => {
  const r = await fetch(base + "/api/dive", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ topic: "  " }) });
  assert.equal(r.status, 400);
});

test("streams a full dive as NDJSON", async () => {
  const r = await fetch(base + "/api/dive", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ topic: "test", depth: "quick" }) });
  assert.equal(r.status, 200);
  const lines = (await r.text()).trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(lines[0].type, "status");
  assert.equal(lines.at(-1).type, "done");
});

test("media endpoint returns items for one entry", async () => {
  const r = await fetch(base + "/api/media", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ topic: "T", term: "Thing" }) });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.ok(j.items.length >= 2);
});

async function withApp(env, fn) {
  const s = createApp(fakeDeps().deps, { env });
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  try { await fn(`http://127.0.0.1:${s.address().port}`); } finally { s.close(); }
}
const post = (u, body, headers = {}) => fetch(u, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

async function withHandlerApp(deps, opts, fn) {
  const s = createApp(deps, opts);
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  try { await fn(`http://127.0.0.1:${s.address().port}`); } finally { s.close(); }
}
const noServerKeys = () => { const { deps } = fakeDeps(); return { ...deps, claude: { ...deps.claude, configured: false }, exa: { ...deps.exa, configured: false } }; };

test("without server keys, searches need the visitor's keys", async () => {
  await withHandlerApp(noServerKeys(), { env: {} }, async (b) => {
    const h = await (await fetch(b + "/api/health")).json();
    assert.equal(h.claude, false); assert.equal(h.byok, true);
    const r = await post(b + "/api/media", { topic: "T", term: "x" });
    assert.equal(r.status, 401);
    const j = await r.json();
    assert.equal(j.error.code, "keys_needed");
    assert.deepEqual(j.error.missing, ["Anthropic", "Exa"]);
  });
});

test("a visitor's keys build clients for that request only", async () => {
  const seen = [];
  const { deps } = fakeDeps();
  const opts = { env: {}, makeClaude: (k) => { seen.push(["claude", k]); return deps.claude; }, makeExa: (k) => { seen.push(["exa", k]); return deps.exa; } };
  await withHandlerApp(noServerKeys(), opts, async (b) => {
    const r = await post(b + "/api/dive", { topic: "T", depth: "quick" }, { "x-anthropic-key": "sk-ant-test-123456", "x-exa-key": "exa-test-123456" });
    assert.equal(r.status, 200);
    const lines = (await r.text()).trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(lines.at(-1).type, "done");
    assert.deepEqual(seen, [["claude", "sk-ant-test-123456"], ["exa", "exa-test-123456"]]);
    assert.equal((await post(b + "/api/media", { topic: "T", term: "x" }, { "x-anthropic-key": "bad key with spaces" })).status, 400);
  });
});

test("one visitor key plus the server's other key is enough", async () => {
  const { deps } = fakeDeps();
  const half = { ...deps, claude: { ...deps.claude, configured: false } };
  await withHandlerApp(half, { env: {}, makeClaude: () => deps.claude }, async (b) => {
    const r1 = await post(b + "/api/media", { topic: "T", term: "x" });
    assert.deepEqual((await r1.json()).error.missing, ["Anthropic"]);
    assert.equal((await post(b + "/api/media", { topic: "T", term: "x" }, { "x-anthropic-key": "sk-ant-test-123456" })).status, 200);
  });
});

test("on Vercel the server's keys stay private unless ALLOW_PUBLIC=1", async () => {
  await withApp({ VERCEL: "1" }, async (b) => {
    const h = await (await fetch(b + "/api/health")).json();
    assert.equal(h.claude, false); assert.equal(h.exa, false);
    assert.equal((await post(b + "/api/dive", { topic: "T" })).status, 401);
  });
  await withApp({ VERCEL: "1", ALLOW_PUBLIC: "1" }, async (b) => {
    assert.equal((await (await fetch(b + "/api/health")).json()).claude, true);
    assert.equal((await post(b + "/api/media", { topic: "T", term: "x" })).status, 200);
  });
});

test("a rejected visitor key points at the Keys panel, not .env", async () => {
  const { deps } = fakeDeps();
  const { AppError } = await import("../lib/errors.mjs");
  const badExa = { ...deps.exa, search: async () => { throw new AppError("exa_auth", "Exa rejected the API key. Check EXA_API_KEY in your .env file.", { fatal: true }); } };
  await withHandlerApp(noServerKeys(), { env: {}, makeClaude: () => deps.claude, makeExa: () => badExa }, async (b) => {
    const r = await post(b + "/api/media", { topic: "T", term: "x" }, { "x-anthropic-key": "sk-ant-test-123456", "x-exa-key": "exa-test-123456" });
    const j = await r.json();
    assert.match(j.error.message, /under Keys/);
  });
});

test("handler accepts a body the runtime already parsed", async () => {
  const { createHandler } = await import("../server.mjs");
  const handler = createHandler(fakeDeps().deps, { env: {} });
  const out = { status: 0, body: "" };
  const res = { headersSent: false, writeHead(s) { out.status = s; this.headersSent = true; }, end(b) { out.body = String(b); }, on() {} };
  await handler({ method: "POST", url: "/api/media", headers: {}, body: { topic: "T", term: "x" } }, res);
  assert.equal(out.status, 200);
  assert.ok(JSON.parse(out.body).items.length);
});
