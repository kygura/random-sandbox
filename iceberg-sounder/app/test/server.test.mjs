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
