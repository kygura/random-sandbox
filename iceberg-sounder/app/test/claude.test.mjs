// Points the real Anthropic SDK at a local fake API to check the requests we
// build (structured output schema, refusal fallback, effort) and how replies parse.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import Anthropic from "@anthropic-ai/sdk";
import { createClaude, ChartSchema } from "../lib/claude.mjs";

let srv, base, seen = [];
let reply = null;
before(async () => {
  srv = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
    seen.push({ url: req.url, headers: req.headers, body });
    if (body.stream) {
      res.writeHead(200, { "content-type": "text/event-stream" });
      const msg = { id: "msg_1", type: "message", role: "assistant", model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } };
      const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      send("message_start", { type: "message_start", message: msg });
      send("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
      for (const t of ["Hello ", "deep [1]."]) send("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: t } });
      send("content_block_stop", { type: "content_block_stop", index: 0 });
      send("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 5 } });
      send("message_stop", { type: "message_stop" });
      return res.end();
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(reply(body)));
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(() => srv.close());

const message = (model, text, stop_reason = "end_turn") => ({
  id: "msg_1", type: "message", role: "assistant", model, stop_reason, stop_sequence: null,
  content: [{ type: "text", text }], usage: { input_tokens: 1, output_tokens: 1 },
});
const client = () => new Anthropic({ apiKey: "test-key", baseURL: base, maxRetries: 0 });

test("structured() sends a JSON schema, effort and the refusal fallback, and parses the reply", async () => {
  seen = [];
  const payload = { entries: [{ term: "A", summary: "s", detail: "d", sources: ["S1"], confidence: "debated" }] };
  reply = (b) => message(b.model, JSON.stringify(payload));
  const claude = createClaude({ client: client() });
  const out = await claude.structured("prompt", ChartSchema, { depth: "deep" });
  assert.deepEqual(out, payload);
  const { body, headers } = seen[0];
  assert.equal(body.model, "claude-opus-5-5");
  assert.equal(body.output_config.effort, "high");
  assert.equal(body.output_config.format.type, "json_schema");
  assert.equal(body.fallbacks, "default");
  assert.match(headers["anthropic-beta"], /server-side-fallback-2026-07-01/);
  assert.equal(body.thinking, undefined, "thinking is left at the model default");
});

test("structured() turns a refusal into a readable error", async () => {
  reply = (b) => message(b.model, "", "refusal");
  const claude = createClaude({ client: client() });
  await assert.rejects(claude.structured("p", ChartSchema, {}), (e) => e.code === "refused");
});

test("structured() maps a 401 to a fatal credentials error", async () => {
  const bad = http.createServer((req, res) => { res.writeHead(401, { "content-type": "application/json" }); res.end(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } })); });
  await new Promise((r) => bad.listen(0, "127.0.0.1", r));
  const claude = createClaude({ client: new Anthropic({ apiKey: "x", baseURL: `http://127.0.0.1:${bad.address().port}`, maxRetries: 0 }) });
  await assert.rejects(claude.structured("p", ChartSchema, {}), (e) => e.code === "claude_auth" && e.fatal);
  bad.close();
});

test("stream() forwards text deltas", async () => {
  seen = [];
  const claude = createClaude({ client: client() });
  let text = "";
  const r = await claude.stream("p", { depth: "quick", onText: (d) => { text += d; } });
  assert.equal(text, "Hello deep [1].");
  assert.equal(r.truncated, false);
  assert.equal(seen[0].body.output_config.effort, "low");
  assert.equal(seen[0].body.stream, true);
});
