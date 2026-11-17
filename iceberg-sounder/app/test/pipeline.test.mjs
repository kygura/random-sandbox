import { test } from "node:test";
import assert from "node:assert/strict";
import { runDive, runDeep, findEntryMedia, isVideoUrl } from "../lib/pipeline.mjs";
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
  const lastDone = new Map();
  for (const e of events) if (e.type === "layer" && e.status === "done") lastDone.set(e.index, e);
  const done = [...lastDone.values()];
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

test("entries carry media that Claude attached plus per-entry Commons pictures", async () => {
  const { deps, calls } = fakeDeps();
  const events = await collect((emit) => runDive({ topic: "t", depth: "quick", emit, signal: new AbortController().signal, deps }));
  const sources = new Map(events.filter((e) => e.type === "source").map((e) => [e.source.id, e.source]));
  const chartPrompts = calls.prompts.filter((p) => p.includes("MEDIA (videos"));
  assert.equal(chartPrompts.length, 6);
  assert.match(chartPrompts[0], /\[M1\] (video|image)/, "the media pool is offered to Claude");
  // last layer event per index carries the enriched entries
  const last = new Map();
  for (const e of events) if (e.type === "layer" && e.status === "done") last.set(e.index, e);
  for (const ev of last.values()) {
    const [one, two] = ev.entries;
    assert.ok(one.media.length >= 3, "two pool items plus a Commons picture");
    for (const id of one.media) {
      const s = sources.get(id);
      assert.ok(s, `media ${id} is an emitted source`);
      assert.ok(isVideoUrl(s.url) || s.image, "media is a video or has an image");
    }
    assert.ok(one.media.some((id) => sources.get(id).commons), "Commons picture attached");
    assert.deepEqual(two.media, [], "no media when none fits");
  }
  assert.ok(calls.commons.includes("tip picture"), "per-entry image_query is searched");
});

test("unattached pool media stays out of the source list", async () => {
  const { deps } = fakeDeps();
  deps.claude.structured = ((orig) => async (prompt, schema, o) => {
    const out = await orig(prompt, schema, o);
    if (out.entries) out.entries.forEach((e) => { e.media = []; e.image_query = ""; });
    return out;
  })(deps.claude.structured);
  const events = await collect((emit) => runDive({ topic: "t", depth: "quick", emit, signal: new AbortController().signal, deps }));
  const urls = events.filter((e) => e.type === "source").map((e) => e.source.url);
  assert.ok(!urls.some((u) => u.includes("youtube.com")), "the unused video isn't listed");
});

test("findEntryMedia returns videos and Commons images for one entry", async () => {
  const { deps } = fakeDeps();
  const items = await findEntryMedia({ topic: "Topic", term: "Thing", signal: new AbortController().signal, deps });
  assert.ok(items.some((x) => isVideoUrl(x.url)));
  assert.ok(items.some((x) => x.commons && x.license));
});

test("the researcher's notes reach the planning and charting prompts", async () => {
  const { deps, calls } = fakeDeps();
  await collect((emit) => runDive({ topic: "t", notes: "Focus on 1970s carbon dating", depth: "quick", emit, signal: new AbortController().signal, deps }));
  const withNotes = calls.prompts.filter((p) => p.includes("<notes>\nFocus on 1970s carbon dating\n</notes>"));
  assert.equal(withNotes.length, 7, "plan plus six charting prompts");
});
