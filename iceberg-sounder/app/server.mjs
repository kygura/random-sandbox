import http from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
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

function send(res, status, body, type = "application/json; charset=utf-8", extra = {}) {
  res.writeHead(status, { "content-type": type, "content-security-policy": CSP, "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", ...extra });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function readJson(req, limit = 64 * 1024) {
  // On Vercel the runtime may already have parsed the body.
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === "string") return JSON.parse(req.body || "{}");
    if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString("utf8") || "{}");
    if (typeof req.body === "object") return req.body;
  }
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
/* Like clean() but keeps line breaks, for the note under the topic. */
const cleanNotes = (v, max) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f]/g, " ").replace(/<\/?notes>/gi, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, max) : "");
const clean = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max) : "");

/* Who pays for a search. A visitor can send their own Anthropic and Exa keys
   (x-anthropic-key, x-exa-key); they're used for that request only and never
   stored or logged. Without them the server's own keys are used, but on Vercel
   only when ALLOW_PUBLIC=1, so a public URL doesn't spend the owner's credits. */
const serverKeysOpen = (env) => !env.VERCEL || env.ALLOW_PUBLIC === "1";

/* Owner mode: with OWNER_SECRET set, POST /api/owner with that secret marks
   this browser with an HttpOnly cookie, and its searches use the server's keys. */
const OWNER_COOKIE = "ice_owner";
const ownerToken = (secret) => createHmac("sha256", secret).update("iceberg-owner-v1").digest("base64url");
const sameText = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
function cookieOf(req, name) {
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("="); if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return "";
}
function ownerCookie(value, req, env, maxAge) {
  const secure = env.VERCEL || req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
  return `${OWNER_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`;
}
const KEY_RE = /^[\x21-\x7e]{8,300}$/;
const USER_KEY_MESSAGES = {
  claude_auth: "Anthropic rejected the API key you entered. Check it under Keys.",
  claude_missing: "Add your Anthropic API key under Keys.",
  exa_auth: "Exa rejected the API key you entered. Check it under Keys.",
  exa_credits: "The Exa account for the key you entered is out of credits.",
};
function keyHeader(req, name) {
  const v = req.headers[name];
  return typeof v === "string" ? v.trim() : "";
}

export function createHandler(deps, {
  maxDives = Number(process.env.MAX_DIVES) || 2, env = process.env,
  makeClaude = (apiKey) => createClaude({ apiKey }), makeExa = (apiKey) => createExa({ apiKey }),
} = {}) {
  let running = 0;
  const open = serverKeysOpen(env);
  const secret = String(env.OWNER_SECRET || "");
  const isOwner = (req) => secret.length >= 16 && sameText(cookieOf(req, OWNER_COOKIE), ownerToken(secret));
  /* Whether the server's own keys serve this request. */
  const serverFor = (req) => {
    const ok = open || isOwner(req);
    return { claude: ok && deps.claude.configured, exa: ok && deps.exa.configured };
  };

  /* The deps for one request, or an error to send back. */
  function depsFor(req) {
    const ak = keyHeader(req, "x-anthropic-key"), ek = keyHeader(req, "x-exa-key");
    if ((ak && !KEY_RE.test(ak)) || (ek && !KEY_RE.test(ek))) return { status: 400, error: { code: "bad_key", message: "That doesn't look like an API key. Check what you pasted under Keys." } };
    const srv = serverFor(req);
    const claude = ak ? makeClaude(ak) : srv.claude ? deps.claude : null;
    const exa = ek ? makeExa(ek) : srv.exa ? deps.exa : null;
    const missing = [!claude && "Anthropic", !exa && "Exa"].filter(Boolean);
    if (missing.length) return { status: 401, error: { code: "keys_needed", missing, message: `Add your ${missing.join(" and ")} API key${missing.length > 1 ? "s" : ""} under Keys to search.` } };
    return { deps: { ...deps, claude, exa }, userKeys: Boolean(ak || ek) };
  }

  return async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    try {
      if (req.method === "GET" && url.pathname === "/api/health") {
        const srv = serverFor(req);
        return send(res, 200, { model: modelId(), claude: srv.claude, exa: srv.exa, commons: Boolean(deps.commons?.configured), byok: true, owner: isOwner(req) }, undefined, { "cache-control": "no-store" });
      }

      if (url.pathname === "/api/owner" && req.method === "POST") {
        const body = await readJson(req, 4096);
        if (secret.length < 16 || typeof body.secret !== "string" || !sameText(body.secret.trim(), secret))
          return send(res, 401, { error: { code: "owner_denied", message: "That owner link isn't valid." } });
        return send(res, 200, { owner: true }, undefined, { "set-cookie": ownerCookie(ownerToken(secret), req, env, 60 * 60 * 24 * 400), "cache-control": "no-store" });
      }
      if (url.pathname === "/api/owner" && req.method === "DELETE") {
        return send(res, 200, { owner: false }, undefined, { "set-cookie": ownerCookie("", req, env, 0), "cache-control": "no-store" });
      }

      let ctx = null;
      if (req.method === "POST" && /^\/api\/(dive|deep|media)$/.test(url.pathname)) {
        ctx = depsFor(req);
        if (ctx.error) return send(res, ctx.status, { error: ctx.error });
      }
      /* With a visitor's keys, point key errors at the Keys panel instead of .env. */
      const fixMsg = (err) => (ctx?.userKeys && USER_KEY_MESSAGES[err?.code] ? { ...err, message: USER_KEY_MESSAGES[err.code] } : err);
      const wrapEmit = (emit) => (ev) => emit(ev.type === "error" ? { ...ev, error: fixMsg(ev.error) } : ev);

      if (req.method === "POST" && url.pathname === "/api/dive") {
        const body = await readJson(req);
        const topic = clean(body.topic, 160);
        const depth = DEPTHS.has(body.depth) ? body.depth : "thorough";
        const notes = cleanNotes(body.notes, 2000);
        if (!topic) return send(res, 400, { error: { code: "bad_request", message: "Name a topic to dive into." } });
        if (running >= maxDives) return send(res, 429, { error: { code: "busy", message: "Too many dives running at once. Try again in a minute." } });
        running++;
        return ndjson(req, res, (emit, signal) => runDive({ topic, notes, depth, emit: wrapEmit(emit), signal, deps: ctx.deps })).finally(() => { running--; });
      }

      if (req.method === "POST" && url.pathname === "/api/media") {
        const body = await readJson(req);
        const topic = clean(body.topic, 160), term = clean(body.term, 120);
        if (!topic || !term) return send(res, 400, { error: { code: "bad_request", message: "Missing topic or entry." } });
        const ctl = new AbortController();
        res.on("close", () => { if (!res.writableEnded) ctl.abort(); });
        try {
          const items = await findEntryMedia({ topic, term, signal: ctl.signal, deps: ctx.deps });
          return send(res, 200, { items });
        } catch (e) {
          if (ctl.signal.aborted) return;
          return send(res, 502, { error: fixMsg(publicError(e)) });
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
        return ndjson(req, res, (emit, signal) => runDeep({ topic, entry, sources, depth, emit: wrapEmit(emit), signal, deps: ctx.deps }));
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
  };
}

export function createApp(deps = { claude: createClaude(), exa: createExa(), commons: createCommons() }, opts = {}) {
  return http.createServer(createHandler(deps, opts));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.loadEnvFile(path.join(here, ".env")); } catch {}
  const deps = { claude: createClaude(), exa: createExa(), commons: createCommons() };
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || "127.0.0.1";
  createApp(deps).listen(port, host, () => {
    console.log(`Iceberg Sounder on http://${host === "0.0.0.0" ? "localhost" : host}:${port}`);
    if (!deps.claude.configured) console.warn("  · ANTHROPIC_API_KEY not set: visitors need to enter their own key under Keys.");
    if (!deps.exa.configured) console.warn("  · EXA_API_KEY not set: visitors need to enter their own key under Keys.");
    if (!deps.commons.configured) console.warn("  · WIKIMEDIA_CONTACT not set — the Wikimedia Commons image gallery is off.");
  });
}
