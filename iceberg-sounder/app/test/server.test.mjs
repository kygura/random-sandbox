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

test("an access code guards the paid endpoints", async () => {
  await withApp({ ACCESS_CODE: "s3cret" }, async (b) => {
    assert.equal((await (await fetch(b + "/api/health")).json()).locked, true);
    assert.equal((await post(b + "/api/media", { topic: "T", term: "x" })).status, 401);
    assert.equal((await post(b + "/api/media", { topic: "T", term: "x" }, { "x-access-code": "wrong" })).status, 401);
    assert.equal((await post(b + "/api/media", { topic: "T", term: "x" }, { "x-access-code": "s3cret" })).status, 200);
  });
});

test("on Vercel, paid endpoints stay closed until an access code is set", async () => {
  await withApp({ VERCEL: "1" }, async (b) => {
    const h = await (await fetch(b + "/api/health")).json();
    assert.equal(h.closed, true);
    assert.equal((await post(b + "/api/dive", { topic: "T" })).status, 403);
  });
  await withApp({ VERCEL: "1", ALLOW_PUBLIC: "1" }, async (b) => {
    assert.equal((await post(b + "/api/media", { topic: "T", term: "x" })).status, 200);
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
