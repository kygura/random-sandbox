import { test } from "node:test";
import assert from "node:assert/strict";
import { runDive, runDeep } from "../lib/pipeline.mjs";
import { AppError } from "../lib/errors.mjs";
import { fakeDeps } from "./fakes.mjs";

async function collect(fn) {
  const events = [];
  await fn((e) => events.push(e));
  return events;
}

test("a dive charts six layers and every cited id points at an emitted source", async () => {
  const { deps } = fakeDeps();
  const events = await collect((emit) => runDive({ topic: "test", depth: "quick", emit, signal: new AbortController().signal, deps }));
  const plan = events.find((e) => e.type === "plan");
  assert.equal(plan.title, "Test Topic");
  const sources = new Map(events.filter((e) => e.type === "source").map((e) => [e.source.id, e.source]));
  const done = events.filter((e) => e.type === "layer" && e.status === "done");
  assert.equal(done.length, 6);
  for (const l of done) {
    assert.equal(l.entries.length, 2, "entries citing unknown tags are dropped");
    for (const en of l.entries) for (const id of en.sources) assert.ok(sources.has(id), `source ${id} was emitted`);
  }
  assert.ok([...sources.values()].some((s) => s.url.includes("youtube.com")), "video search adds a video source");
  assert.ok([...sources.values()].some((s) => s.commons && s.license), "Commons images carry license");
  assert.ok([...sources.values()].some((s) => s.image), "og images pass through");
  const fin = events.at(-1);
  assert.equal(fin.type, "done");
  assert.equal(fin.charted, 6);
});

test("sources are de-duplicated by URL", async () => {
  const { deps } = fakeDeps();
  const events = await collect((emit) => runDive({ topic: "t", depth: "quick", emit, signal: new AbortController().signal, deps }));
  const urls = events.filter((e) => e.type === "source").map((e) => e.source.url);
  const ids = events.filter((e) => e.type === "source").map((e) => e.source.id);
  assert.equal(new Set(ids).size, new Set(urls).size);
});

test("one layer failing does not stop the others", async () => {
  const { deps } = fakeDeps({ chartFailsAt: 2 });
  const events = await collect((emit) => runDive({ topic: "t", depth: "quick", emit, signal: new AbortController().signal, deps }));
  const failed = events.find((e) => e.type === "layer" && e.status === "error");
  assert.equal(failed.index, 2);
  assert.equal(events.at(-1).type, "done");
  assert.equal(events.at(-1).charted, 5);
});

test("a fatal Exa error ends the dive with that message", async () => {
  const { deps } = fakeDeps({ exaFails: new AppError("exa_auth", "Exa rejected the API key.", { fatal: true, source: "exa" }) });
  const events = await collect((emit) => runDive({ topic: "t", depth: "quick", emit, signal: new AbortController().signal, deps }));
  const last = events.at(-1);
  assert.equal(last.type, "error");
  assert.equal(last.error.code, "exa_auth");
});

test("aborting a dive stops without a done or error event", async () => {
  const { deps } = fakeDeps({ slowMs: 50 });
  const ctl = new AbortController();
  setTimeout(() => ctl.abort(), 20);
  const events = await collect((emit) => runDive({ topic: "t", depth: "quick", emit, signal: ctl.signal, deps }));
  assert.ok(!events.some((e) => e.type === "done" || e.type === "error"));
});

test("deep dive streams text and finishes", async () => {
  const { deps, calls } = fakeDeps();
  const events = await collect((emit) => runDeep({
    topic: "t", depth: "quick", emit, signal: new AbortController().signal, deps,
    entry: { term: "x", summary: "s", detail: "d" }, sources: [{ id: 1, title: "a", url: "https://example.org/a", excerpt: "" }],
  }));
  assert.equal(calls.contents, 1);
  const text = events.filter((e) => e.type === "text").map((e) => e.delta).join("");
  assert.match(text, /Rabbit holes: Alpha \| Beta \| Gamma/);
  assert.equal(events.at(-1).type, "done");
});
