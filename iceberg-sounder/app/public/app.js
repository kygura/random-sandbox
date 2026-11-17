import { ZONES as ZONE_TEXT } from "./zones.js";
import { EXAMPLE } from "./example.js";
import { createNotesEditor } from "./editor.js";

const ZONES = ZONE_TEXT;

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
  chev: '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
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
const AKEY = "iceberg-sounder.access";
const accessHeaders = () => { let c = ""; try { c = localStorage.getItem(AKEY) || ""; } catch {} return c ? { "x-access-code": c } : {}; };
function needAccess(code) {
  if (code !== "access_code") return;
  $("#access").hidden = false; $("#accessCode").focus();
}
async function postStream(path, body, signal) {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json", ...accessHeaders() }, body: JSON.stringify(body), signal });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    needAccess(data?.error?.code);
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
const state = { ice: null, open: null, busy: false };
const server = { ok: false, claude: false, exa: false, commons: false, closed: false };
let buildCtl = null, deepCtl = null;
const canDive = () => server.ok && server.claude && server.exa && !server.closed;

/* ===== Rendering ===== */
const sourceById = (ice, id) => ice.sources.find((s) => s.id === id);
const zoneOf = (key) => ZONES.find((z) => z.key === key);
const isMedia = (s) => !!s && (!!videoOf(s.url) || !!s.image);
/* An entry's media: what was attached to it first, then any cited source that is a video or has a picture. */
function mediaOf(ice, e) {
  const ids = [...(e.media || []), ...e.sources];
  const out = [];
  for (const id of ids) { const s = sourceById(ice, id); if (isMedia(s) && !out.includes(s)) out.push(s); }
  return out;
}

function renderHero() {
  const ice = state.ice; const hero = $("#hero");
  renderNoteMeta();
  if (!ice) { hero.hidden = true; hero.replaceChildren(); return; }
  hero.hidden = false;
  const entries = countEntries(ice);
  const done = ice.layers.filter((l) => l.status === "done").length;
  const media = ice.layers.reduce((n, l) => n + l.entries.filter((e) => mediaOf(ice, e).length).length, 0);
  const named = ice.title && ice.title.toLowerCase() !== String(ice.topic).toLowerCase();
  hero.replaceChildren(...[
    named ? h("h2", { text: ice.title }) : null,
    ice.summary ? h("p", { text: ice.summary })
      : h("div", { class: "skel-lines", "aria-label": "Planning the search" }, h("span", { class: "skel" }), h("span", { class: "skel" }), h("span", { class: "skel short" })),
    h("div", { class: "readouts" },
      h("span", {}, h("b", { text: String(entries) }), " entries"),
      h("span", {}, h("b", { text: String(ice.sources.length) }), " sources"),
      h("span", {}, h("b", { text: String(media) }), " with images or video"),
      h("span", {}, h("b", { text: `${done}/6` }), " levels charted"))].filter(Boolean));
}

/* One image per entry, drawn from its media. Prefer an image no other
   entry uses yet; never repeat one inside a level (those entries get a letter tile). */
function pickThumbs(ice) {
  const usedAll = new Set(); const picks = new Map();
  ice.layers.forEach((l, li) => {
    const usedHere = new Set();
    l.entries.forEach((e, ei) => {
      const cands = mediaOf(ice, e).filter((s) => thumbOf(s) && !usedHere.has(thumbOf(s)));
      const s = cands.find((c) => !usedAll.has(thumbOf(c))) || cands[0];
      if (s) { usedAll.add(thumbOf(s)); usedHere.add(thumbOf(s)); picks.set(li + ":" + ei, s); }
    });
  });
  return picks;
}
function entryThumb(e, src) {
  const box = h("span", { class: "ethumb", "aria-hidden": "true" });
  const letter = () => h("span", { class: "mono-letter", text: (e.term.match(/[\p{L}\p{N}]/u) || ["·"])[0].toUpperCase() });
  const pic = src ? img(thumbOf(src), { alt: "", onfail: (el) => el.replaceWith(letter()) }) : null;
  box.append(pic || letter());
  if (pic && videoOf(src.url)) box.append(h("span", { class: "vid" }, svg("play")));
  return box;
}

function levelEl(i) {
  const z = ZONES[i]; const layer = state.ice.layers[i];
  const open = state.open && state.open.li === i ? state.open.ei : -1;
  const thumbs = pickThumbs(state.ice);
  let inner;
  if (layer.status === "done" && layer.entries.length) {
    inner = layer.entries.map((e, k) => h("button", {
      class: "entry " + (e.confidence || "established") + (k === open ? " open" : ""), type: "button",
      "aria-label": `${e.term}. ${e.confidence || "established"}, ${e.sources.length} source${e.sources.length === 1 ? "" : "s"}`,
      onclick: () => openEntry(i, k),
    }, entryThumb(e, thumbs.get(i + ":" + k)), h("span", { class: "et" }, e.term, e.sources.length ? h("sup", { text: String(e.sources.length) }) : null)));
  } else if (["pending", "searching", "charting"].includes(layer.status)) {
    inner = [5, 8, 4, 7].map((w) => h("span", { class: "skel", style: `width:${w}em` }));
  } else if (layer.status === "error") {
    inner = [h("span", { class: "note bad", text: layer.error || "This level couldn't be charted." })];
  } else {
    inner = [h("span", { class: "note", text: "No results at this level." })];
  }
  const busy = layer.status === "searching" || layer.status === "charting";
  const cited = new Set(layer.entries.flatMap((e) => e.sources)).size;
  const count = {
    pending: "waiting", searching: "searching the web", charting: "reading results",
    done: `${layer.entries.length} entries · ${cited} sources`, error: "failed", empty: "no results",
  }[layer.status] || "";

  return h("section", { class: "level", id: "lv-" + z.key, "data-level": String(z.level), "aria-label": `Level ${z.level}: ${z.name}` },
    h("div", { class: "level-in" },
    h("div", { class: "rail" },
      h("span", { class: "num", text: `${String(z.level).padStart(2, "0")} / 06` }),
      h("span", { class: "name", text: z.name }),
      !layer.theme && layer.status === "pending" && state.busy ? h("span", { class: "theme" }, h("span", { class: "skel", style: "width:11em" }))
        : h("span", { class: "theme", text: layer.theme || z.short }),
      h("span", { class: "count" + (busy ? " busy" : ""), text: count })),
    h("div", { class: "entries" }, inner),
    levelMedia(i)));
}
/* Every picture and video attached to this level's entries, each opening its entry. */
function levelMedia(i) {
  const ice = state.ice; const layer = ice.layers[i];
  if (layer.status !== "done") return null;
  const seen = new Set(); const items = [];
  layer.entries.forEach((e, k) => mediaOf(ice, e).forEach((s) => {
    if (seen.has(s.id)) return; seen.add(s.id); items.push({ s, k, e });
  }));
  if (!items.length) return null;
  return h("div", { class: "lvmedia", role: "list", "aria-label": `Images and video for ${ZONES[i].name}` },
    items.slice(0, 12).map(({ s, k, e }) => {
      const v = videoOf(s.url);
      const b = h("button", { class: "lvm" + (v ? " is-video" : ""), type: "button", role: "listitem", title: `${e.term} — ${s.title}`,
        "aria-label": `${v ? "Video" : "Image"} for ${e.term}: ${s.title}`, onclick: () => openEntry(i, k, s.id) });
      const im = img(thumbOf(s), { alt: "", onfail: () => b.remove() });
      if (!im) return null;
      b.append(im, h("span", { class: "lvm-cap", text: e.term }));
      if (v) b.append(h("span", { class: "vid" }, svg("play")));
      return b;
    }));
}
function renderBand(i) { const old = document.getElementById("lv-" + ZONES[i].key); const el = levelEl(i); if (old) old.replaceWith(el); else $("#levels").append(el); renderLvNav(); }
function renderOcean() { $("#levels").replaceChildren(...ZONES.map((_, i) => levelEl(i))); renderLvNav(); }

/* Phones: a sticky bar of the six levels, marking the one on screen. */
function renderLvNav() {
  const ice = state.ice;
  $("#lvnav").replaceChildren(...ZONES.map((z, i) => h("button", {
    type: "button", "data-key": z.key, "aria-label": `Level ${z.level}: ${z.name}`,
    onclick: () => document.getElementById("lv-" + z.key)?.scrollIntoView({ behavior: "smooth", block: "start" }),
  }, h("span", { class: "n", text: String(z.level) }), h("span", { class: "t", text: z.name }),
     ice.layers[i].entries.length ? h("span", { class: "c", text: String(ice.layers[i].entries.length) }) : null)));
  markLvNav();
}
let navTick = 0;
function markLvNav() {
  const nav = $("#lvnav"); if (!nav.offsetParent) return;
  const line = nav.getBoundingClientRect().bottom + 8;
  let current = null;
  for (const z of ZONES) { const el = document.getElementById("lv-" + z.key); if (el && el.getBoundingClientRect().top <= line) current = z.key; }
  nav.querySelectorAll("button").forEach((b) => {
    const on = b.dataset.key === current;
    if (on && b.getAttribute("aria-current") !== "true") b.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    b.toggleAttribute("aria-current", false); if (on) b.setAttribute("aria-current", "true");
  });
}
window.addEventListener("scroll", () => { if (!navTick) navTick = requestAnimationFrame(() => { navTick = 0; markLvNav(); }); }, { passive: true });

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
function citedIn(ice) {
  const map = new Map();
  ice.layers.forEach((l) => l.entries.forEach((e) => e.sources.forEach((id) => {
    if (!map.has(id)) map.set(id, new Set());
    map.get(id).add(zoneOf(l.key).name);
  })));
  return map;
}
const SOURCES_SHOWN = 6;
function renderSources() {
  const ice = state.ice; const cited = citedIn(ice);
  const all = state.allSources || ice.sources.length <= SOURCES_SHOWN + 2;
  const more = $("#srcMore");
  more.hidden = all;
  more.textContent = `Show all ${ice.sources.length} sources`;
  $("#sources").replaceChildren(...ice.sources.map((s, n) => {
    const th = h("span", { class: "sthumb" });
    const pic = img(thumbOf(s), { alt: "", onfail: (el) => { const f = img(s.favicon, { cls: "favicon" }); f ? el.replaceWith(f) : el.remove(); } }) || img(s.favicon, { cls: "favicon" });
    if (pic) th.append(pic);
    return h("li", { id: "src-" + s.id, hidden: (!all && n >= SOURCES_SHOWN) || null },
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
  renderSources();
}
/* Saved searches: a dropdown with one row per iceberg made in this browser, plus the example. */
const fmtDate = (t) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const countEntries = (ice) => ice.layers.reduce((n, l) => n + l.entries.length, 0);
function deleteSaved(id) {
  try { localStorage.setItem(HKEY, JSON.stringify(loadHistory().filter((x) => x.id !== id))); } catch {}
  if (state.ice?.id === id) show(null); else renderRecent();
}
function savedRow(ice, { removable }) {
  const on = state.ice?.id === ice.id;
  const meta = [ice.createdAt ? fmtDate(ice.createdAt) : (ice.example ? "Example" : ""), `${countEntries(ice)} entries`].filter(Boolean).join(" · ");
  return h("li", { class: "saved-row" + (on ? " on" : "") },
    h("button", { class: "saved-open", type: "button", role: "menuitem", "aria-current": on ? "true" : null, onclick: () => { closeSaved(); show(ice); } },
      h("span", { class: "t", text: ice.title || ice.topic }), h("span", { class: "m", text: meta })),
    removable ? h("button", { class: "saved-del", type: "button", "aria-label": `Delete ${ice.title || ice.topic}`, title: "Delete", onclick: () => deleteSaved(ice.id), text: "×" }) : null);
}
function closeSaved() { const d = $("#saved"); if (d) d.open = false; }
function renderRecent() {
  const hist = loadHistory();
  const label = state.ice ? (state.ice.title || state.ice.topic) : "Saved searches";
  const menu = h("div", { class: "saved-menu", role: "menu" },
    h("button", { class: "saved-new", type: "button", role: "menuitem", onclick: () => { closeSaved(); newNote(); } }, h("span", { text: "+" }), " New search"),
    h("div", { class: "saved-h", text: "Your searches" }),
    hist.length ? h("ul", {}, ...hist.map((x) => savedRow(x, { removable: true })))
      : h("p", { class: "saved-empty", text: "Searches you run are saved here, in this browser." }),
    h("div", { class: "saved-h", text: "Example" }),
    h("ul", {}, savedRow(EXAMPLE, { removable: false })));
  const d = h("details", { class: "saved", id: "saved" },
    h("summary", { "aria-label": "Saved searches" },
      h("span", { class: "lbl", text: label }), hist.length ? h("span", { class: "n", text: String(hist.length) }) : null, svg("chev")),
    menu);
  if (state.busy) d.classList.add("off");
  $("#recent").replaceChildren(d);
}
document.addEventListener("click", (ev) => { const d = $("#saved"); if (d?.open && !d.contains(ev.target)) d.open = false; });
function renderAll() {
  const empty = !state.ice;
  document.body.classList.toggle("empty", empty);
  $("main.chart").hidden = empty; $("section.appendix").hidden = empty;
  renderHero(); renderRecent();
  if (empty) { $("#levels").replaceChildren(); $("#lvnav").replaceChildren(); $("#sources").replaceChildren(); return; }
  renderOcean(); renderSeabed();
}
function show(ice) {
  if (state.busy) return;
  state.ice = ice; state.allSources = false; closeDrawer();
  if (ice) setNote(ice.topic || ice.title, ice.notesDoc || ice.notes || ""); else { const d = loadDraft(); setNote(d.topic, d.doc); }
  renderAll(); window.scrollTo({ top: 0 });
}
function newNote() { if (state.busy) return; saveDraft({ topic: "", doc: "" }); show(null); $("#topic").focus(); }

/* ===== The note ===== */
/* Title: plain text, one line. Notes: a Tiptap editor (see editor.js). */
const DKEY = "iceberg-sounder.draft";
const loadDraft = () => {
  try { const d = JSON.parse(localStorage.getItem(DKEY) || "{}"); return { topic: String(d.topic || ""), doc: d.doc && d.doc.type === "doc" ? d.doc : String(d.notes || "") }; }
  catch { return { topic: "", doc: "" }; }
};
const saveDraft = (d) => { try { localStorage.setItem(DKEY, JSON.stringify(d)); } catch {} };
const titleText = () => $("#topic").innerText.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
function getNote() { return { topic: titleText(), notes: notesEd.getMarkdown(), doc: notesEd.getJSON() }; }
function setNote(topic, doc) { $("#topic").textContent = topic || ""; notesEd.setContent(doc || ""); }
const draftNow = () => { if (!state.ice) { const n = getNote(); saveDraft({ topic: n.topic, doc: n.doc }); } };
function renderNoteMeta() {
  const ice = state.ice; const el = $("#noteMeta");
  if (!ice) { el.textContent = "New search"; return; }
  const n = getNote();
  const edited = !state.busy && (n.topic !== String(ice.topic || ice.title).trim() || n.notes !== String(ice.notes || "").trim());
  el.replaceChildren(
    h("span", { text: ice.example ? "Example" : state.busy ? "Researching…" : "Saved " + fmtDate(ice.createdAt || Date.now()) }),
    ...(edited ? [h("span", { class: "edited", text: " · edited, run it again to research the new version" })] : []));
}
function placeCaretEnd(el) {
  el.focus(); const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
  const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
}
const notesEd = createNotesEditor({
  el: $("#notes"), bubble: $("#bubble"), slash: $("#slash"),
  placeholder: "Add notes to steer the research: an angle, a period, sources you trust, what to skip. Type / for commands.",
  actions: [
    { key: "research", t: "Research", d: "Start the search now", k: "", run: () => $("#diveBtn").click() },
    { key: "quick", t: "Quick", d: "Fast, lighter reading", run: () => { $("#tier").value = "quick"; } },
    { key: "thorough", t: "Thorough", d: "The default", run: () => { $("#tier").value = "thorough"; } },
    { key: "deepest", t: "Deepest", d: "Slowest, most careful", run: () => { $("#tier").value = "deep"; } },
    { key: "example", t: "Open the example", d: "The Voynich manuscript", run: () => show(EXAMPLE) },
    { key: "new", t: "New search", d: "Clear this page", run: () => newNote() },
  ],
  onChange: () => { draftNow(); renderNoteMeta(); },
  onSubmit: () => $("#diveBtn").click(),
  onExitTop: () => placeCaretEnd($("#topic")),
});
(function setupTitle() {
  const title = $("#topic");
  if (title.contentEditable !== "plaintext-only") title.contentEditable = "true";
  title.addEventListener("paste", (ev) => { ev.preventDefault(); document.execCommand("insertText", false, (ev.clipboardData?.getData("text/plain") || "").replace(/\s+/g, " ")); });
  title.addEventListener("input", () => {
    if (!title.textContent.trim()) title.replaceChildren();
    if (title.innerText.length > 160) { title.textContent = title.innerText.slice(0, 160); placeCaretEnd(title); }
    draftNow(); renderNoteMeta();
  });
  title.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); $("#diveBtn").click(); }
    else if (ev.key === "Enter" || (ev.key === "ArrowDown" && !ev.shiftKey)) { ev.preventDefault(); notesEd.focusStart(); }
  });
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  $("#kbdHint").replaceChildren(h("kbd", { text: mac ? "⌘" : "Ctrl" }), h("kbd", { text: "↵" }));
  const d = loadDraft(); setNote(d.topic, d.doc);
})();

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
  $("#diveBtn").hidden = b;
  $("#stopBtn").hidden = !b;
  $("#bar").hidden = !b;
  $("#note").classList.toggle("busy", b);
  renderNoteMeta();
  if (b) { prog.done = 0; setProgress(); }
  renderRecent();
}

/* ===== Dive ===== */
async function build(topic, notes = "", notesDoc = null) {
  topic = String(topic || "").replace(/\s+/g, " ").trim().slice(0, 160);
  notes = String(notes || "").trim().slice(0, 2000);
  if (!topic) { setStatus("Write a topic as the title first."); $("#topic").focus(); return; }
  if (state.busy || !canDive()) return;
  const ctl = buildCtl = new AbortController();
  const ice = { id: "ice-" + Date.now().toString(36), topic, notes, notesDoc: notes ? notesDoc : null, title: topic, summary: "", createdAt: Date.now(), sources: [],
    layers: ZONES.map((z) => ({ key: z.key, status: "pending", entries: [], theme: "" })) };
  state.ice = ice; closeDrawer(); setBusy(true); renderAll();
  prog.total = 1 + 6 * 2; prog.done = 0;
  setStatus(`Planning searches for “${topic}”…`, "busy");
  let finished = false;
  try {
    for await (const ev of await postStream("/api/dive", { topic, notes, depth: $("#tier").value }, ctl.signal)) {
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
        if (s.image && ice.layers.some((l) => l.entries.some((en) => en.sources.includes(s.id)))) renderOcean();
      } else if (ev.type === "layer") {
        const l = ice.layers[ev.index]; if (!l) continue;
        l.status = ev.status;
        if (ev.entries) l.entries = ev.entries;
        if (ev.error) l.error = ev.error;
        if (["done", "empty", "error"].includes(ev.status)) prog.done += 2; else if (ev.status === "charting") prog.done += 1;
        setProgress(); renderBand(ev.index); renderHero();
      } else if (ev.type === "done") {
        finished = true;
        setStatus(ev.charted ? `Charted ${ev.charted} of 6 levels from ${ev.sources} sources.` : "No level could be charted. Try a more specific topic.", ev.charted ? null : "err");
      } else if (ev.type === "error") {
        finished = true;
        setStatus(ev.error?.message || "The dive failed.", "err");
      }
    }
    if (!finished && !ctl.signal.aborted) setStatus("The connection to the server dropped before the dive finished.", "err");
  } catch (e) {
    if (ctl.signal.aborted || e?.name === "AbortError") setStatus("Stopped. Finished levels are kept.");
    else setStatus(e?.message || "Couldn't reach the server. Is it still running?", "err");
  } finally {
    ice.layers.forEach((l, i) => { if (["pending", "searching", "charting"].includes(l.status)) { l.status = "error"; l.error = "Stopped before this level was reached."; renderBand(i); } });
    if (buildCtl === ctl) buildCtl = null;
    setBusy(false); renderSeabed();
    if (ice.layers.some((l) => l.entries.length)) saveHistory(ice);
  }
}

/* ===== Entry modal ===== */
let lastFocus = null, mediaCtl = null;
function closeDrawer() {
  deepCtl?.abort(); deepCtl = null;
  mediaCtl?.abort(); mediaCtl = null;
  if ($("#drawer").hidden) return;
  $("#drawer").hidden = true; $("#scrim").hidden = true; state.open = null;
  document.body.classList.remove("modal-open");
  document.querySelectorAll(".entry.open").forEach((el) => el.classList.remove("open"));
  lastFocus?.focus?.();
}

function stageEl(s) {
  const v = videoOf(s.url);
  const cap = h("div", { class: "mcap" },
    h("span", { class: "kind", text: v ? "Video" : "Image" }),
    h("a", { href: s.url, target: "_blank", rel: "noopener noreferrer", text: s.title || hostOf(s.url) }),
    h("span", { class: "h", text: [`[${s.id}]`, hostOf(s.url), s.author, s.license].filter(Boolean).join(" · ") }));
  if (v) return h("figure", { class: "stage" }, h("div", { class: "frame" }, playerEl(s)), cap);
  const frame = h("div", { class: "frame" });
  const im = img(s.image, { alt: s.title, onfail: (el) => el.replaceWith(h("span", { class: "noimg", text: "This image couldn't be loaded. Open the source to see it." })) });
  if (im) { im.addEventListener("click", () => openLightbox(s)); frame.append(im); }
  return h("figure", { class: "stage" }, frame, cap);
}

function renderModalMedia(ice, e, box, selectedId, searching) {
  const items = mediaOf(ice, e);
  const sel = items.find((s) => s.id === selectedId) || items[0];
  box.dataset.sel = sel ? String(sel.id) : "";
  const kids = [];
  if (sel) kids.push(stageEl(sel));
  else kids.push(h("div", { class: "stage empty" }, h("div", { class: "frame" },
    h("span", { class: "big-letter", text: (e.term.match(/[\p{L}\p{N}]/u) || ["·"])[0].toUpperCase() }),
    h("span", { class: "noimg", text: searching ? "Looking for images and video…" : "No images or video found for this entry." }))));
  if (items.length > 1 || searching) {
    kids.push(h("div", { class: "strip", role: "list", "aria-label": "All media for this entry" },
      items.map((s) => {
        const b = h("button", { type: "button", role: "listitem", "aria-pressed": String(s === sel), title: s.title,
          "aria-label": `${videoOf(s.url) ? "Video" : "Image"}: ${s.title}`,
          onclick: () => renderModalMedia(ice, e, box, s.id, searching) });
        const im = img(thumbOf(s), { alt: "", onfail: (el) => el.replaceWith(h("span", { class: "noimg", text: hostOf(s.url) })) });
        if (im) b.append(im);
        if (videoOf(s.url)) b.append(h("span", { class: "vid" }, svg("play")));
        return b;
      }),
      searching ? h("span", { class: "strip-busy", text: "Searching…" }) : null));
  }
  box.replaceChildren(...kids);
}

/* First open of an entry with no video: look for video and Commons pictures of it. */
async function enrichEntry(ice, e, li, ei, box) {
  if (ice.example || e.mediaSearched || !canDive() || mediaOf(ice, e).some((s) => videoOf(s.url))) return;
  mediaCtl?.abort();
  const ctl = mediaCtl = new AbortController();
  renderModalMedia(ice, e, box, null, true);
  try {
    const res = await fetch("/api/media", { method: "POST", headers: { "content-type": "application/json", ...accessHeaders() },
      body: JSON.stringify({ topic: ice.title, term: e.term }), signal: ctl.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || "Media search failed.");
    e.media = e.media || [];
    for (const it of data.items || []) {
      if (!safeUrl(it.url)) continue;
      let s = ice.sources.find((x) => x.url === it.url);
      if (!s) {
        s = { id: Math.max(0, ...ice.sources.map((x) => x.id)) + 1, title: it.title || hostOf(it.url), url: it.url, author: it.author || "",
          date: it.date || "", image: it.image || "", favicon: it.favicon || "", excerpt: it.excerpt || "", license: it.license || "", commons: !!it.commons };
        ice.sources.push(s);
      }
      if (isMedia(s) && !e.media.includes(s.id)) e.media.push(s.id);
    }
    e.mediaSearched = true;
    if (!ice.example) saveHistory(ice);
    renderBand(li); renderHero(); renderSeabed(true);
  } catch (err) {
    if (ctl.signal.aborted) return;
    e.mediaSearched = true;
  } finally {
    if (mediaCtl === ctl) mediaCtl = null;
  }
  if (state.open?.li === li && state.open?.ei === ei && state.ice === ice) {
    renderModalMedia(ice, e, box, Number(box.dataset.sel) || null, false);
  }
}

function openEntry(li, ei, mediaId) {
  deepCtl?.abort(); deepCtl = null;
  mediaCtl?.abort(); mediaCtl = null;
  const ice = state.ice; const e = ice.layers[li].entries[ei]; const z = ZONES[li];
  state.open = { li, ei };
  if ($("#drawer").hidden) lastFocus = document.activeElement;
  $("#dZone").replaceChildren(h("span", { text: `Level ${z.level} of 6` }), h("b", { text: z.name }));
  document.querySelectorAll(".entry.open").forEach((el) => el.classList.remove("open"));
  document.querySelectorAll(`#lv-${z.key} .entry`)[ei]?.classList.add("open");
  const srcs = e.sources.map((id) => sourceById(ice, id)).filter(Boolean);

  const mediaBox = h("div", { class: "mmedia" });
  renderModalMedia(ice, e, mediaBox, mediaId, false);

  const deepBox = h("div", { class: "deep", hidden: !e.deep || null });
  const holesBox = h("div", { class: "holes" });
  const deepErr = h("div", { class: "err", hidden: true });
  if (e.deep) { deepBox.innerHTML = md(e.deep.text, ice); renderHoles(holesBox, e.deep.holes); }

  const digBtn = h("button", { class: "btn primary", type: "button", disabled: !canDive() || null, text: e.deep ? "Dig deeper again" : "Dig deeper" });
  const stopBtn = h("button", { class: "btn", type: "button", hidden: true, text: "Stop" });
  const newBtn = h("button", { class: "btn", type: "button", disabled: !canDive() || state.busy || null, text: "Build an iceberg for this",
    onclick: () => { const t = `${e.term} (${ice.title})`; closeDrawer(); setNote(t, ""); build(t); } });
  digBtn.onclick = () => digDeeper(ice, e, { deepBox, holesBox, deepErr, digBtn, stopBtn });
  stopBtn.onclick = () => deepCtl?.abort();

  const text = h("div", { class: "mtext" }, ...[
    h("h2", { id: "dTitle", text: e.term }),
    h("span", { class: "conf " + e.confidence, text: e.confidence }),
    h("p", { class: "lead", text: e.summary }),
    e.detail ? h("p", { class: "detail", text: e.detail }) : null,
    h("div", { class: "actions" }, digBtn, stopBtn, newBtn),
    !canDive() ? h("div", { class: "err", text: "Dig deeper needs the server's Anthropic and Exa keys." }) : null,
    deepErr, deepBox, holesBox,
    h("div", { class: "dsec" }, h("h3", { text: `Sources · ${srcs.length}` }),
      h("ul", { class: "citelist" }, srcs.map((s) => {
        const th = h("span", { class: "cthumb" }); const t = img(thumbOf(s), { alt: "" }); if (t) th.append(t);
        return h("li", {}, h("a", { href: s.url, target: "_blank", rel: "noopener noreferrer" },
          h("span", { class: "sid", text: `[${s.id}]` }), th,
          h("span", {}, h("div", { class: "t", text: s.title }), h("div", { class: "x", text: `${hostOf(s.url)}${s.excerpt ? " — " + s.excerpt : ""}` }))));
      }))),
  ].filter(Boolean));

  $("#dBody").replaceChildren(h("div", { class: "mgrid" }, mediaBox, text));
  $("#drawer").hidden = false; $("#scrim").hidden = false;
  document.body.classList.add("modal-open");
  text.scrollTop = 0; $("#dBody").scrollTop = 0;
  $("#dClose").focus();
  enrichEntry(ice, e, li, ei, mediaBox);
}
function renderHoles(box, holes) {
  box.replaceChildren(...((holes || []).length ? [h("div", { class: "dsec", style: "width:100%" }, h("h3", { text: "Related topics" }),
    h("div", { class: "holes" }, holes.map((t) => h("button", { class: "chip", type: "button", disabled: state.busy || !canDive() || null, text: t,
      onclick: () => { closeDrawer(); setNote(t, ""); build(t); } }))))] : []));
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
$("#diveBtn").addEventListener("click", () => { const n = getNote(); build(n.topic, n.notes, n.doc); });
$("#stopBtn").addEventListener("click", () => buildCtl?.abort());
$("#dClose").addEventListener("click", closeDrawer);
$("#scrim").addEventListener("click", closeDrawer);
$("#lbClose").addEventListener("click", closeLightbox);
$("#lightbox").addEventListener("click", (ev) => { if (ev.target.id === "lightbox") closeLightbox(); });
document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") { if (!$("#slash").hidden) return; if ($("#saved")?.open) closeSaved(); else if (!$("#lightbox").hidden) closeLightbox(); else closeDrawer(); } });
document.addEventListener("click", (ev) => {
  const a = ev.target.closest("a.cite");
  if (!a) return;
  ev.preventDefault();
  let el = document.getElementById("src-" + a.dataset.cite);
  if (el?.hidden) { state.allSources = true; renderSources(); el = document.getElementById("src-" + a.dataset.cite); }
  if (!el) return;
  closeDrawer();
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 1800);
});

$("#srcMore").addEventListener("click", () => { state.allSources = true; renderSources(); });
$("#accessCode").addEventListener("input", (ev) => { try { localStorage.setItem(AKEY, ev.target.value.trim()); } catch {} });

/* ===== Boot ===== */
renderAll();
setStatus("Checking the server…");
$("#diveBtn").disabled = true;
fetch("/api/health").then((r) => r.json()).then((hl) => {
  Object.assign(server, { ok: true, claude: !!hl.claude, exa: !!hl.exa, commons: !!hl.commons, closed: !!hl.closed });
  const missing = [!hl.claude && "ANTHROPIC_API_KEY", !hl.exa && "EXA_API_KEY"].filter(Boolean);
  if (hl.locked && !hl.closed) {
    $("#access").hidden = false;
    try { $("#accessCode").value = localStorage.getItem(AKEY) || ""; } catch {}
  }
  if (hl.closed) setStatus("Searching is off on this site. You can still open the example from Saved searches.");
  else if (missing.length) setStatus(`The server is missing ${missing.join(" and ")}. Add ${missing.length > 1 ? "them" : "it"} to .env and restart. You can still open the example from Saved searches.`, "err");
  else setStatus("Ready.");
  $("#diveBtn").disabled = !canDive();
}).catch(() => setStatus("Couldn't reach the server. Start it with npm start.", "err"));
