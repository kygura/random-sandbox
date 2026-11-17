import { ZONES as ZONE_TEXT } from "./zones.js";
import { EXAMPLE } from "./example.js";

/* ===== Zone visuals (geometry + palette per depth) ===== */
const LOOK = {
  tip:       { tl: 47, bl: 22, pad: 30, minh: 210, pt: "84px", align: "end",
               water: "linear-gradient(180deg, #1b2c47 0%, #3a5677 100%)", ice: "linear-gradient(180deg, #ffffff 0%, #dcedf4 100%)",
               tagbg: "rgba(255,255,255,0.92)", tagfg: "#0c2238", tagline: "rgba(12,34,56,0.18)", strong: "rgba(12,34,56,0.6)", zmuted: "#a9bccc", facet: 0 },
  waterline: { tl: 22, bl: 13, pad: 16,
               water: "linear-gradient(180deg, #17608a 0%, #104a6c 100%)", ice: "linear-gradient(180deg, #c6e5ef 0%, #a9d2e0 100%)",
               tagbg: "rgba(255,255,255,0.86)", tagfg: "#0c2238", tagline: "rgba(12,34,56,0.18)", strong: "rgba(12,34,56,0.6)", zmuted: "#a4c4d6", facet: 0.12 },
  twilight:  { tl: 13, bl: 7, pad: 10,
               water: "linear-gradient(180deg, #0e3e5c 0%, #0b2f48 100%)", ice: "linear-gradient(180deg, #7aaec2 0%, #5f94ab 100%)",
               tagbg: "rgba(5,22,38,0.62)", tagfg: "#eaf5fa", tagline: "rgba(220,240,250,0.2)", strong: "rgba(220,240,250,0.6)", zmuted: "#86a9bf", facet: 0.08 },
  midnight:  { tl: 7, bl: 3, pad: 6,
               water: "linear-gradient(180deg, #09273c 0%, #071c2c 100%)", ice: "linear-gradient(180deg, #4a7a92 0%, #3b6880 100%)",
               tagbg: "rgba(4,16,28,0.62)", tagfg: "#e3f0f7", tagline: "rgba(220,240,250,0.18)", strong: "rgba(220,240,250,0.55)", zmuted: "#7095ab", facet: 0.07 },
  abyss:     { tl: 3, bl: 8, pad: 8,
               water: "linear-gradient(180deg, #05141f 0%, #040e17 100%)", ice: "linear-gradient(180deg, #2d5670 0%, #234760 100%)",
               tagbg: "rgba(2,10,18,0.6)", tagfg: "#dbe9f1", tagline: "rgba(220,240,250,0.16)", strong: "rgba(220,240,250,0.5)", zmuted: "#5b7d92", facet: 0.06 },
  trench:    { tl: 8, bl: 30, pad: 18, minh: 190,
               water: "linear-gradient(180deg, #030a11 0%, #02060b 100%)", ice: "linear-gradient(180deg, #1e4058 0%, #142e42 100%)",
               tagbg: "rgba(1,6,12,0.6)", tagfg: "#d2e2ec", tagline: "rgba(220,240,250,0.16)", strong: "rgba(241,145,145,0.6)", zmuted: "#4f6f84", facet: 0.05 },
};
const ZONES = ZONE_TEXT.map((z) => ({ ...z, ...LOOK[z.key] }));

/* ===== Helpers ===== */
const $ = (s) => document.querySelector(s);
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style") el.style.cssText = v;
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) { if (c == null || c === false) continue; el.append(c instanceof Node ? c : String(c)); }
  return el;
}
const safeUrl = (u) => { try { const x = new URL(String(u).trim()); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function img(src, { alt = "", cls, onfail } = {}) {
  const url = safeUrl(src);
  if (!url) return null;
  const el = h("img", { src: url, alt, class: cls, loading: "lazy", decoding: "async", referrerpolicy: "no-referrer" });
  el.addEventListener("error", () => { onfail ? onfail(el) : el.remove(); }, { once: true });
  return el;
}

/* Video hosts we can embed */
function videoOf(url) {
  try {
    const u = new URL(url); const host = u.hostname.replace(/^(www|m)\./, "");
    let id = null;
    if (host === "youtube.com" || host === "music.youtube.com") {
      id = u.searchParams.get("v") || (u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,})/) || [])[1];
    } else if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
    if (id && /^[\w-]{6,}$/.test(id)) return { host: "youtube", id, embed: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`, thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` };
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const vid = (u.pathname.match(/(\d{5,})/) || [])[1];
      if (vid) return { host: "vimeo", id: vid, embed: `https://player.vimeo.com/video/${vid}?autoplay=1&dnt=1`, thumb: null };
    }
  } catch {}
  return null;
}
function kindOf(s) {
  const u = String(s.url).toLowerCase();
  if (videoOf(s.url)) return "video";
  if (s.commons || /\.(jpe?g|png|gif|webp|tiff?|svg)(\?|$)/.test(u) || /flickr\.com|unsplash|iiif|artsandculture\.google|loc\.gov\/pictures/.test(u)) return "image";
  if (/\.pdf(\?|$)/.test(u) || /doi\.org|arxiv\.org|aclanthology|jstor\.org|tandfonline|ncbi\.nlm|springer|sciencedirect|wiley\.com|ceur-ws|researchgate|academia\.edu|semanticscholar|ssrn\.com|nature\.com|plos\.org|journals\.|cambridge\.org\/core|muse\.jhu/.test(u)) return "paper";
  if (/archive\.org|wikisource|gutenberg|hathitrust|archiv|museum|library|newspapers\.com|chroniclingamerica/.test(u)) return "archive";
  return "article";
}
const thumbOf = (s) => s.image || videoOf(s.url)?.thumb || "";
const KIND_LABEL = { video: "Video", image: "Image", paper: "Paper", archive: "Archive", article: "Article" };
const ICON = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>',
  paper: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 3.5h8l4 4v13H6z"/><path d="M14 3.5v4h4M9 12h6M9 15.5h6"/></svg>',
  archive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="4" rx="1"/><path d="M5 8.5v11h14v-11M10 12h4"/></svg>',
};
const svg = (name) => { const s = h("span"); s.innerHTML = ICON[name]; return s.firstChild; };

function md(text, ice) {
  return String(text).trim().split(/\n{2,}/).filter(Boolean).map((p) =>
    "<p>" + esc(p.trim())
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\[(\d{1,3})\]/g, (m, n) => (ice.sources.some((s) => s.id === +n) ? `<a class="cite" href="#src-${n}" data-cite="${n}">[${n}]</a>` : m))
      .replace(/\n/g, "<br>") + "</p>").join("");
}

async function* ndjson(res) {
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      if (line.trim()) yield JSON.parse(line);
    }
  }
  if (buf.trim()) yield JSON.parse(buf);
}
async function postStream(path, body, signal) {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw { code: data?.error?.code || "http_" + res.status, message: data?.error?.message || `The server returned ${res.status}.` };
  }
  return ndjson(res);
}

/* ===== State + storage ===== */
const HKEY = "iceberg-sounder.standalone.v1";
const loadHistory = () => { try { const v = JSON.parse(localStorage.getItem(HKEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
function saveHistory(ice) {
  if (ice.example) return;
  try {
    const list = loadHistory().filter((x) => x.id !== ice.id);
    list.unshift(ice);
    localStorage.setItem(HKEY, JSON.stringify(list.slice(0, 12)));
  } catch {}
  renderRecent();
}
const state = { ice: EXAMPLE, open: null, busy: false };
const server = { ok: false, claude: false, exa: false, commons: false };
let buildCtl = null, deepCtl = null;
const canDive = () => server.ok && server.claude && server.exa;

/* ===== Rendering ===== */
const sourceById = (ice, id) => ice.sources.find((s) => s.id === id);
const zoneOf = (key) => ZONES.find((z) => z.key === key);

function renderHero() {
  const ice = state.ice;
  const entries = ice.layers.reduce((n, l) => n + l.entries.length, 0);
  const done = ice.layers.filter((l) => l.status === "done").length;
  const media = ice.sources.filter((s) => thumbOf(s)).length;
  $("#hero").replaceChildren(
    h("div", { class: "eyebrow" },
      h("span", { text: ice.example ? "Charted example" : "Iceberg" }),
      ice.example ? h("span", { class: "tagx", text: "Example · pre-built from real sources" }) : null,
      ice.createdAt ? h("span", { text: new Date(ice.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) }) : null),
    h("h1", { text: ice.title || ice.topic }),
    ice.summary ? h("p", { text: ice.summary }) : h("p", { text: "Planning the descent…" }),
    h("div", { class: "readouts" },
      h("span", {}, h("b", { text: String(entries) }), " entries"),
      h("span", {}, h("b", { text: String(ice.sources.length) }), " sources"),
      h("span", {}, h("b", { text: String(media) }), " with images or video"),
      h("span", {}, h("b", { text: `${done}/6` }), " layers charted")));
}

function bandEl(i) {
  const z = ZONES[i]; const layer = state.ice.layers[i];
  const style = [
    `--water:${z.water}`, `--icefill:${z.ice}`, `--tl:${z.tl}%`, `--bl:${z.bl}%`, `--pad:${z.pad}%`,
    `--tagbg:${z.tagbg}`, `--tagfg:${z.tagfg}`, `--tagline:${z.tagline}`, `--tagline-strong:${z.strong}`, `--zmuted:${z.zmuted}`,
    `--facet:${z.facet}`, z.minh ? `--minh:${z.minh}px` : "", z.pt ? `--pt:${z.pt}` : "", z.align ? `--align:flex-${z.align}` : "",
  ].filter(Boolean).join(";");

  let inner;
  if (layer.status === "done" && layer.entries.length) {
    inner = layer.entries.map((e, k) => h("button", {
      class: "tag " + (e.confidence || "established"), type: "button",
      "aria-label": `${e.term}, ${e.confidence || "established"}, ${e.sources.length} sources`,
      onclick: () => openEntry(i, k),
    }, e.term, h("span", { class: "n", text: e.sources.length ? `${e.sources.length}` : "" })));
  } else if (["pending", "searching", "charting"].includes(layer.status)) {
    inner = [100, 140, 86, 120].map((w) => h("span", { class: "skel", style: `width:${w}px` }));
  } else if (layer.status === "error") {
    inner = [h("span", { class: "note", text: layer.error || "This layer couldn't be charted." })];
  } else {
    inner = [h("span", { class: "note", text: "Nothing reliable surfaced at this depth." })];
  }
  const statusText = { pending: "waiting", searching: "searching the web", charting: "charting", done: `${layer.entries.length} entries`, error: "failed", empty: "no results" }[layer.status] || "";
  const cited = new Set(layer.entries.flatMap((e) => e.sources)).size;
  const busy = layer.status === "searching" || layer.status === "charting";

  return h("section", { class: "band" + (z.key === "waterline" ? " waterline" : ""), id: "z-" + z.key, style, "aria-label": `${z.name}, ${z.depth}` },
    z.key === "waterline" ? h("span", { class: "wl-label", text: "WATERLINE" }) : null,
    h("div", { class: "band-in" },
      h("div", { class: "meta" },
        h("span", { class: "depth", text: z.depth }),
        h("span", { class: "zname", text: z.name }),
        h("span", { class: "zsci", text: z.sci }),
        h("span", { class: "who", text: layer.theme || z.who })),
      h("div", { class: "ice" }, h("div", { class: "tags" }, inner)),
      h("div", { class: "side" },
        h("span", { class: "st" + (busy ? " busy" : ""), text: statusText }),
        layer.status === "done" ? h("span", { text: `${cited} sources cited` }) : null)));
}
function renderBand(i) { const old = document.getElementById("z-" + ZONES[i].key); const el = bandEl(i); if (old) old.replaceWith(el); else $("#ocean").append(el); }
function renderOcean() { $("#ocean").replaceChildren(...ZONES.map((_, i) => bandEl(i))); }

/* --- Media --- */
function playerEl(s, { compact = false } = {}) {
  const v = videoOf(s.url); if (!v) return null;
  const box = h("div", { class: "player" });
  const poster = img(s.image || v.thumb, { alt: "", onfail: (el) => el.replaceWith(h("span", { class: "noimg", text: v.host === "vimeo" ? "Vimeo" : "YouTube" })) });
  const play = h("button", { class: "play", type: "button", "aria-label": `Play ${s.title}` }, h("span", {}, svg("play")));
  play.addEventListener("click", () => {
    box.replaceChildren(h("iframe", {
      src: v.embed, title: s.title, allow: "autoplay; encrypted-media; picture-in-picture; fullscreen", allowfullscreen: true,
      referrerpolicy: "strict-origin-when-cross-origin", loading: "lazy",
    }));
  });
  box.append(poster || h("span", { class: "noimg", text: v.host === "vimeo" ? "Vimeo" : "YouTube" }), play);
  if (compact) box.style.borderRadius = "8px";
  return box;
}
function galleryTile(s) {
  const t = h("button", { class: "tile", type: "button", "aria-label": `View image: ${s.title}` });
  const im = img(s.image, { alt: s.title, onfail: () => t.remove() });
  if (!im) return null;
  t.append(im, h("figcaption", {},
    h("span", { class: "t", text: s.title }),
    h("span", { class: "h", text: `[${s.id}] ${s.commons ? [s.author, s.license].filter(Boolean).join(" · ") || "Wikimedia Commons" : hostOf(s.url)}` })));
  t.addEventListener("click", () => openLightbox(s));
  return t;
}
function docCard(s, kind) {
  const fav = h("span", { class: "fav" });
  const fi = img(s.favicon, { alt: "", onfail: (el) => el.replaceWith(svg(kind === "paper" ? "paper" : "archive")) });
  fav.append(fi || svg(kind === "paper" ? "paper" : "archive"));
  return h("li", {}, h("a", { class: "mcard", href: s.url, target: "_blank", rel: "noopener noreferrer" }, fav,
    h("span", {}, h("div", { class: "t", text: s.title || hostOf(s.url) }), h("div", { class: "h", text: `[${s.id}] ${hostOf(s.url)}${s.author ? " · " + s.author : ""}` }))));
}
function renderMedia() {
  const ice = state.ice;
  const videos = ice.sources.filter((s) => kindOf(s) === "video").slice(0, 9);
  const pics = ice.sources.filter((s) => kindOf(s) !== "video" && s.image).slice(0, 24);
  const papers = ice.sources.filter((s) => kindOf(s) === "paper").slice(0, 10);
  const archives = ice.sources.filter((s) => kindOf(s) === "archive").slice(0, 10);
  const blocks = [];
  if (videos.length) blocks.push(h("div", { class: "media-block" }, h("h3", { text: `Watch · ${videos.length}` }),
    h("div", { class: "videos" }, videos.map((s) => h("div", { class: "vcard" }, playerEl(s),
      h("a", { href: s.url, target: "_blank", rel: "noopener noreferrer" }, h("div", { class: "t", text: s.title }),
        h("div", { class: "h", text: `[${s.id}] ${hostOf(s.url)}${s.author ? " · " + s.author : ""}${s.date ? " · " + s.date.slice(0, 10) : ""}` })))))));
  if (pics.length) blocks.push(h("div", { class: "media-block" }, h("h3", { text: `Images · ${pics.length}` }),
    h("div", { class: "gallery" }, pics.map(galleryTile))));
  if (papers.length) blocks.push(h("div", { class: "media-block" }, h("h3", { text: `Papers · ${papers.length}` }),
    h("ul", { class: "doclist" }, papers.map((s) => docCard(s, "paper")))));
  if (archives.length) blocks.push(h("div", { class: "media-block" }, h("h3", { text: `Archives & collections · ${archives.length}` }),
    h("ul", { class: "doclist" }, archives.map((s) => docCard(s, "archive")))));
  $("#media").replaceChildren(...blocks);
  $("#mediaWrap").hidden = !blocks.length;
}

function citedIn(ice) {
  const map = new Map();
  ice.layers.forEach((l) => l.entries.forEach((e) => e.sources.forEach((id) => {
    if (!map.has(id)) map.set(id, new Set());
    map.get(id).add(zoneOf(l.key).name);
  })));
  return map;
}
function renderSources() {
  const ice = state.ice; const cited = citedIn(ice);
  $("#sources").replaceChildren(...ice.sources.map((s) => {
    const th = h("span", { class: "sthumb" });
    const pic = img(thumbOf(s), { alt: "", onfail: (el) => { const f = img(s.favicon, { cls: "favicon" }); f ? el.replaceWith(f) : el.remove(); } }) || img(s.favicon, { cls: "favicon" });
    if (pic) th.append(pic);
    return h("li", { id: "src-" + s.id },
      h("span", { class: "sid", text: `[${s.id}]` }), th,
      h("div", {},
        h("a", { class: "stitle", href: s.url, target: "_blank", rel: "noopener noreferrer", text: s.title || s.url }),
        h("div", { class: "smeta" },
          h("span", { class: "kind", text: KIND_LABEL[kindOf(s)] }),
          h("span", { text: hostOf(s.url) }),
          s.author ? h("span", { text: s.author }) : null,
          s.license ? h("span", { class: "lic", text: s.license }) : null,
          s.date ? h("span", { text: s.date.slice(0, 10) }) : null,
          cited.has(s.id) ? h("span", { class: "cited", text: "cited in " + [...cited.get(s.id)].join(", ") }) : h("span", { text: "found while searching" }))));
  }));
}
let mediaTimer = 0;
function renderSeabed(soon = false) {
  if (soon) { clearTimeout(mediaTimer); mediaTimer = setTimeout(() => renderSeabed(false), 250); return; }
  renderMedia(); renderSources();
}
function renderRecent() {
  const hist = loadHistory();
  $("#recent").replaceChildren(h("small", { text: "Icebergs" }),
    h("button", { class: "chip" + (state.ice.id === EXAMPLE.id ? " on" : ""), type: "button", disabled: state.busy || null, onclick: () => show(EXAMPLE), text: "Voynich manuscript · example" }),
    ...hist.map((x) => h("button", { class: "chip" + (state.ice.id === x.id ? " on" : ""), type: "button", disabled: state.busy || null, onclick: () => show(x), text: x.title || x.topic })));
}
function renderAll() { renderHero(); renderOcean(); renderSeabed(); renderRecent(); }
function show(ice) { if (state.busy) return; state.ice = ice; closeDrawer(); renderAll(); window.scrollTo({ top: 0 }); }

/* ===== Status ===== */
const prog = { done: 0, total: 1 };
function setStatus(text, kind) {
  const el = $("#statusLine");
  el.className = "status-line" + (kind === "err" ? " err" : "");
  el.replaceChildren(...(kind === "busy" ? [h("span", { class: "ping" })] : []), h("span", { text }));
}
function setProgress() { $("#barFill").style.width = Math.round((prog.done / prog.total) * 100) + "%"; }
function setBusy(b) {
  state.busy = b;
  $("#diveBtn").disabled = b || !canDive();
  $("#stopBtn").hidden = !b;
  $("#bar").hidden = !b;
  if (b) { prog.done = 0; setProgress(); }
  renderRecent();
}

/* ===== Dive ===== */
async function build(topic) {
  topic = String(topic || "").trim().slice(0, 160);
  if (!topic || state.busy || !canDive()) return;
  const ctl = buildCtl = new AbortController();
  const ice = { id: "ice-" + Date.now().toString(36), topic, title: topic, summary: "", createdAt: Date.now(), sources: [],
    layers: ZONES.map((z) => ({ key: z.key, status: "pending", entries: [], theme: "" })) };
  state.ice = ice; closeDrawer(); setBusy(true); renderAll();
  prog.total = 1 + 6 * 2; prog.done = 0;
  setStatus(`Planning the descent into “${topic}”…`, "busy");
  let finished = false;
  try {
    for await (const ev of await postStream("/api/dive", { topic, depth: $("#tier").value }, ctl.signal)) {
      if (ev.type === "status") setStatus(ev.text, "busy");
      else if (ev.type === "plan") {
        ice.title = ev.title || topic; ice.summary = ev.summary || "";
        ice.layers.forEach((l, i) => { l.theme = ev.themes?.[i] || ""; });
        prog.done = 1; setProgress(); renderHero(); renderOcean();
      } else if (ev.type === "source") {
        const s = ev.source; if (!safeUrl(s.url)) continue;
        const at = ice.sources.findIndex((x) => x.id === s.id);
        if (at >= 0) ice.sources[at] = s; else ice.sources.push(s);
        renderSeabed(true); renderHero();
      } else if (ev.type === "layer") {
        const l = ice.layers[ev.index]; if (!l) continue;
        l.status = ev.status;
        if (ev.entries) l.entries = ev.entries;
        if (ev.error) l.error = ev.error;
        if (["done", "empty", "error"].includes(ev.status)) prog.done += 2; else if (ev.status === "charting") prog.done += 1;
        setProgress(); renderBand(ev.index); renderHero();
      } else if (ev.type === "done") {
        finished = true;
        setStatus(ev.charted ? `Charted ${ev.charted} of 6 layers from ${ev.sources} sources. Open any entry to see its sources.` : "No layer could be charted. Try a more specific topic.", ev.charted ? null : "err");
      } else if (ev.type === "error") {
        finished = true;
        setStatus(ev.error?.message || "The dive failed.", "err");
      }
    }
    if (!finished && !ctl.signal.aborted) setStatus("The connection to the server dropped before the dive finished.", "err");
  } catch (e) {
    if (ctl.signal.aborted || e?.name === "AbortError") setStatus("Dive stopped. Charted layers are kept.");
    else setStatus(e?.message || "Couldn't reach the server. Is it still running?", "err");
  } finally {
    ice.layers.forEach((l, i) => { if (["pending", "searching", "charting"].includes(l.status)) { l.status = "error"; l.error = "Stopped before this depth was reached."; renderBand(i); } });
    if (buildCtl === ctl) buildCtl = null;
    setBusy(false); renderSeabed();
    if (ice.layers.some((l) => l.entries.length)) saveHistory(ice);
  }
}

/* ===== Drawer ===== */
let lastFocus = null;
function closeDrawer() {
  deepCtl?.abort(); deepCtl = null;
  if ($("#drawer").hidden) return;
  $("#drawer").hidden = true; $("#scrim").hidden = true; state.open = null;
  lastFocus?.focus?.();
}
function openEntry(li, ei) {
  deepCtl?.abort(); deepCtl = null;
  const ice = state.ice; const e = ice.layers[li].entries[ei]; const z = ZONES[li];
  state.open = { li, ei };
  if ($("#drawer").hidden) lastFocus = document.activeElement;
  $("#dZone").replaceChildren(h("span", { style: "color:var(--flare)", text: z.depth }), h("span", { text: z.name }));
  const srcs = e.sources.map((id) => sourceById(ice, id)).filter(Boolean);
  const vid = srcs.find((s) => videoOf(s.url));
  const pic = srcs.find((s) => !videoOf(s.url) && s.image);

  let hero = null;
  if (vid) hero = h("div", {}, playerEl(vid));
  else if (pic) {
    const im = img(pic.image, { alt: pic.title, onfail: () => hero?.remove() });
    if (im) {
      im.addEventListener("click", () => openLightbox(pic));
      hero = h("figure", { class: "dhero" }, im, h("figcaption", { text: `[${pic.id}] ${pic.commons ? [pic.author, pic.license].filter(Boolean).join(" · ") : hostOf(pic.url)}` }));
    }
  }

  const deepBox = h("div", { class: "deep", hidden: !e.deep || null });
  const holesBox = h("div", { class: "holes" });
  const deepErr = h("div", { class: "err", hidden: true });
  if (e.deep) { deepBox.innerHTML = md(e.deep.text, ice); renderHoles(holesBox, e.deep.holes); }

  const digBtn = h("button", { class: "btn primary", type: "button", disabled: !canDive() || null, text: e.deep ? "Dig deeper again" : "Dig deeper" });
  const stopBtn = h("button", { class: "btn", type: "button", hidden: true, text: "Stop" });
  const newBtn = h("button", { class: "btn", type: "button", disabled: !canDive() || state.busy || null, text: "Build an iceberg for this",
    onclick: () => { const t = `${e.term} (${ice.title})`; $("#topic").value = t; closeDrawer(); build(t); } });
  digBtn.onclick = () => digDeeper(ice, e, { deepBox, holesBox, deepErr, digBtn, stopBtn });
  stopBtn.onclick = () => deepCtl?.abort();

  $("#dBody").replaceChildren(...[
    hero,
    h("h2", { id: "dTitle", text: e.term }),
    h("span", { class: "conf " + e.confidence, text: e.confidence }),
    h("p", { class: "lead", text: e.summary }),
    e.detail ? h("p", { class: "detail", text: e.detail }) : null,
    h("div", { class: "dsec" }, h("h3", { text: `Sources · ${srcs.length}` }),
      h("ul", { class: "citelist" }, srcs.map((s) => {
        const th = h("span", { class: "cthumb" }); const t = img(thumbOf(s), { alt: "" }); if (t) th.append(t);
        return h("li", {}, h("a", { href: s.url, target: "_blank", rel: "noopener noreferrer" },
          h("span", { class: "sid", text: `[${s.id}]` }), th,
          h("span", {}, h("div", { class: "t", text: s.title }), h("div", { class: "x", text: `${hostOf(s.url)}${s.excerpt ? " — " + s.excerpt : ""}` }))));
      }))),
    h("div", { class: "actions" }, digBtn, stopBtn, newBtn),
    !canDive() ? h("div", { class: "err", text: "Dig deeper and new dives need the server's Anthropic and Exa keys. See the README." }) : null,
    deepErr, deepBox, holesBox].filter(Boolean));
  $("#drawer").hidden = false; $("#scrim").hidden = false;
  $("#dBody").scrollTop = 0;
  $("#dClose").focus();
}
function renderHoles(box, holes) {
  box.replaceChildren(...((holes || []).length ? [h("div", { class: "dsec", style: "width:100%" }, h("h3", { text: "Rabbit holes" }),
    h("div", { class: "holes" }, holes.map((t) => h("button", { class: "chip", type: "button", disabled: state.busy || !canDive() || null, text: t,
      onclick: () => { $("#topic").value = t; closeDrawer(); build(t); } }))))] : []));
}
function splitHoles(text) {
  const m = text.match(/\n\s*Rabbit holes:\s*(.*)\s*$/i);
  if (!m) return { body: text, holes: [] };
  return { body: text.slice(0, m.index), holes: m[1].split("|").map((s) => s.replace(/[*_`]/g, "").trim()).filter(Boolean).slice(0, 4) };
}
async function digDeeper(ice, e, ui) {
  deepCtl?.abort();
  const ctl = deepCtl = new AbortController();
  const srcs = e.sources.map((id) => sourceById(ice, id)).filter(Boolean).slice(0, 3);
  ui.digBtn.disabled = true; ui.stopBtn.hidden = false; ui.deepErr.hidden = true;
  ui.deepBox.hidden = false; ui.holesBox.replaceChildren();
  ui.deepBox.innerHTML = `<p class="think">Starting…</p>`;
  let text = "", ok = false, truncated = false;
  try {
    const events = await postStream("/api/deep", {
      topic: ice.title, depth: $("#tier").value,
      entry: { term: e.term, summary: e.summary, detail: e.detail },
      sources: srcs.map((s) => ({ id: s.id, title: s.title, url: s.url, excerpt: s.excerpt })),
    }, ctl.signal);
    for await (const ev of events) {
      if (ev.type === "status" && !text) ui.deepBox.innerHTML = `<p class="think">${esc(ev.text)}</p>`;
      else if (ev.type === "reset") text = "";
      else if (ev.type === "text") { text += ev.delta; ui.deepBox.innerHTML = md(splitHoles(text).body, ice); }
      else if (ev.type === "done") { ok = true; truncated = ev.truncated; }
      else if (ev.type === "error") { ui.deepErr.textContent = ev.error?.message || "The deep dive failed."; ui.deepErr.hidden = false; }
    }
  } catch (err) {
    if (!(ctl.signal.aborted || err?.name === "AbortError")) { ui.deepErr.textContent = err?.message || "Couldn't reach the server."; ui.deepErr.hidden = false; }
  } finally {
    if (deepCtl === ctl) deepCtl = null;
    ui.digBtn.disabled = !canDive(); ui.stopBtn.hidden = true;
  }
  if (!text) { ui.deepBox.innerHTML = ""; ui.deepBox.hidden = true; return; }
  const { body, holes } = splitHoles(text);
  ui.deepBox.innerHTML = md(body, ice) + (truncated ? `<p class="think">Cut short at the length limit.</p>` : "");
  if (ok) {
    e.deep = { text: body, holes };
    renderHoles(ui.holesBox, holes);
    saveHistory(ice);
    ui.digBtn.textContent = "Dig deeper again";
  }
}

/* ===== Lightbox ===== */
let lbReturn = null;
function openLightbox(s) {
  lbReturn = document.activeElement;
  $("#lbImg").src = s.image; $("#lbImg").alt = s.title;
  $("#lbTitle").textContent = `[${s.id}] ${s.title}`;
  $("#lbMeta").textContent = [hostOf(s.url), s.author, s.license].filter(Boolean).join(" · ");
  $("#lbLink").href = s.url;
  $("#lightbox").hidden = false; $("#lbClose").focus();
}
function closeLightbox() {
  if ($("#lightbox").hidden) return;
  $("#lightbox").hidden = true; $("#lbImg").removeAttribute("src");
  lbReturn?.focus?.();
}

/* ===== Events ===== */
$("#diveForm").addEventListener("submit", (ev) => { ev.preventDefault(); build($("#topic").value); });
$("#stopBtn").addEventListener("click", () => buildCtl?.abort());
$("#dClose").addEventListener("click", closeDrawer);
$("#scrim").addEventListener("click", closeDrawer);
$("#lbClose").addEventListener("click", closeLightbox);
$("#lightbox").addEventListener("click", (ev) => { if (ev.target.id === "lightbox") closeLightbox(); });
document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") { if (!$("#lightbox").hidden) closeLightbox(); else closeDrawer(); } });
document.addEventListener("click", (ev) => {
  const a = ev.target.closest("a.cite");
  if (!a) return;
  ev.preventDefault();
  const el = document.getElementById("src-" + a.dataset.cite);
  if (!el) return;
  closeDrawer();
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 1800);
});

/* ===== Boot ===== */
renderAll();
setStatus("Checking the server…");
$("#diveBtn").disabled = true;
fetch("/api/health").then((r) => r.json()).then((hl) => {
  Object.assign(server, { ok: true, claude: !!hl.claude, exa: !!hl.exa, commons: !!hl.commons });
  const missing = [!hl.claude && "ANTHROPIC_API_KEY", !hl.exa && "EXA_API_KEY"].filter(Boolean);
  if (missing.length) setStatus(`The server is missing ${missing.join(" and ")}. Add ${missing.length > 1 ? "them" : "it"} to .env and restart. The example below still works.`, "err");
  else setStatus(`Ready. Name a topic and dive.${hl.commons ? "" : " (Wikimedia Commons images are off until WIKIMEDIA_CONTACT is set.)"}`);
  $("#diveBtn").disabled = !canDive();
}).catch(() => setStatus("Couldn't reach the server. Start it with npm start.", "err"));
