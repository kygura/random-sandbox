import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClaude, modelId } from "./lib/claude.mjs";
import { createExa } from "./lib/exa.mjs";
import { createCommons } from "./lib/commons.mjs";
import { runDive, runDeep, findEntryMedia } from "./lib/pipeline.mjs";
import { publicError } from "./lib/errors.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".ico": "image/x-icon" };

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src * data:",
  "frame-src https://www.youtube-nocookie.com https://player.vimeo.com",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
].join("; ");

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "content-type": type, "content-security-policy": CSP, "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function readJson(req, limit = 64 * 1024) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > limit) throw new Error("too_large"); chunks.push(c); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

/** Streams NDJSON events; aborts the work if the browser disconnects. */
function ndjson(req, res, work) {
  res.writeHead(200, { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no", "x-content-type-options": "nosniff" });
  const ctl = new AbortController();
  res.on("close", () => { if (!res.writableEnded) ctl.abort(); });
  const emit = (ev) => { if (!res.writableEnded && !res.destroyed) res.write(JSON.stringify(ev) + "\n"); };
  return work(emit, ctl.signal)
    .catch((e) => { console.error(e); emit({ type: "error", error: { code: "internal", message: "Something went wrong on the server. Check the server log.", fatal: true } }); })
    .finally(() => res.end());
}

const DEPTHS = new Set(["quick", "thorough", "deep"]);
const clean = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max) : "");

export function createApp(deps = { claude: createClaude(), exa: createExa(), commons: createCommons() }, { maxDives = Number(process.env.MAX_DIVES) || 2 } = {}) {
  let running = 0;

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    try {
      if (req.method === "GET" && url.pathname === "/api/health") {
        return send(res, 200, { model: modelId(), claude: deps.claude.configured, exa: deps.exa.configured, commons: Boolean(deps.commons?.configured) });
      }

      if (req.method === "POST" && url.pathname === "/api/dive") {
        const body = await readJson(req);
        const topic = clean(body.topic, 160);
        const depth = DEPTHS.has(body.depth) ? body.depth : "thorough";
        if (!topic) return send(res, 400, { error: { code: "bad_request", message: "Name a topic to dive into." } });
        if (running >= maxDives) return send(res, 429, { error: { code: "busy", message: "Too many dives running at once. Try again in a minute." } });
        running++;
        return ndjson(req, res, (emit, signal) => runDive({ topic, depth, emit, signal, deps })).finally(() => { running--; });
      }

      if (req.method === "POST" && url.pathname === "/api/media") {
        const body = await readJson(req);
        const topic = clean(body.topic, 160), term = clean(body.term, 120);
        if (!topic || !term) return send(res, 400, { error: { code: "bad_request", message: "Missing topic or entry." } });
        const ctl = new AbortController();
        res.on("close", () => { if (!res.writableEnded) ctl.abort(); });
        try {
          const items = await findEntryMedia({ topic, term, signal: ctl.signal, deps });
          return send(res, 200, { items });
        } catch (e) {
          if (ctl.signal.aborted) return;
          return send(res, 502, { error: publicError(e) });
        }
      }

      if (req.method === "POST" && url.pathname === "/api/deep") {
        const body = await readJson(req);
        const topic = clean(body.topic, 160);
        const depth = DEPTHS.has(body.depth) ? body.depth : "thorough";
        const entry = { term: clean(body.entry?.term, 120), summary: clean(body.entry?.summary, 600), detail: clean(body.entry?.detail, 1500) };
        const sources = (Array.isArray(body.sources) ? body.sources : []).slice(0, 3)
          .map((s) => ({ id: Number(s.id) || 0, title: clean(s.title, 300), url: clean(s.url, 1000), excerpt: clean(s.excerpt, 400) }))
          .filter((s) => /^https?:\/\//.test(s.url));
        if (!topic || !entry.term || !sources.length) return send(res, 400, { error: { code: "bad_request", message: "Missing entry or sources." } });
        return ndjson(req, res, (emit, signal) => runDeep({ topic, entry, sources, depth, emit, signal, deps }));
      }

      if (req.method === "GET" || req.method === "HEAD") {
        const rel = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
        const file = path.resolve(PUBLIC, rel);
        if (!file.startsWith(PUBLIC + path.sep)) return send(res, 404, "Not found", "text/plain");
        const type = TYPES[path.extname(file)];
        if (!type) return send(res, 404, "Not found", "text/plain");
        const data = await readFile(file).catch(() => null);
        if (!data) return send(res, 404, "Not found", "text/plain");
        return send(res, 200, data, type);
      }
      send(res, 405, { error: { code: "method", message: "Method not allowed" } });
    } catch (e) {
      if (e?.message === "too_large") return send(res, 413, { error: { code: "too_large", message: "Request too large." } });
      if (e instanceof SyntaxError) return send(res, 400, { error: { code: "bad_json", message: "Request body must be JSON." } });
      console.error(e);
      if (!res.headersSent) send(res, 500, { error: { code: "internal", message: "Server error." } });
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.loadEnvFile(path.join(here, ".env")); } catch {}
  const deps = { claude: createClaude(), exa: createExa(), commons: createCommons() };
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || "127.0.0.1";
  createApp(deps).listen(port, host, () => {
    console.log(`Iceberg Sounder on http://${host === "0.0.0.0" ? "localhost" : host}:${port}`);
    if (!deps.claude.configured) console.warn("  ! ANTHROPIC_API_KEY not set — dives will fail until it is.");
    if (!deps.exa.configured) console.warn("  ! EXA_API_KEY not set — dives will fail until it is.");
    if (!deps.commons.configured) console.warn("  · WIKIMEDIA_CONTACT not set — the Wikimedia Commons image gallery is off.");
  });
}
