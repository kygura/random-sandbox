import { Client, type State, type WishRow } from "../client.ts";
import { ipLocate } from "../geo.ts";
import type { Run, Trip } from "../types.ts";
import { c, ESC, eur, fmtDate, heatRow, MONTH_LETTERS, MONTHS, pad, score, truncate } from "./format.ts";

type Tab = "now" | "wishlist" | "trips" | "runs";
const TABS: Tab[] = ["now", "wishlist", "trips", "runs"];

type Prompt = { label: string; value: string; done: (v: string) => Promise<void> };

export async function runTui(client = new Client()) {
  const out = process.stdout;
  const ui = {
    tab: "now" as Tab,
    sel: 0,
    state: null as State | null,
    wish: [] as WishRow[],
    flash: "",
    prompt: null as Prompt | null,
    busy: false,
  };

  const load = async () => {
    try {
      [ui.state, ui.wish] = await Promise.all([client.state(), client.wishlist()]);
    } catch (e) {
      ui.flash = c.red((e as Error).message);
    }
  };

  const say = (msg: string) => {
    ui.flash = msg;
    draw();
  };

  const act = async (label: string, fn: () => Promise<string | void>) => {
    ui.busy = true;
    say(c.dim(`${label}...`));
    try {
      const msg = await fn();
      await load();
      ui.flash = msg ? c.green(msg) : "";
    } catch (e) {
      ui.flash = c.red((e as Error).message);
    }
    ui.busy = false;
    draw();
  };

  const ask = (label: string, done: (v: string) => Promise<void>) => {
    ui.prompt = { label, value: "", done };
    draw();
  };

  function lines(): string[] {
    const W = out.columns ?? 100;
    const s = ui.state;
    const L: string[] = [];
    const loc = s?.location;
    L.push(
      `${c.bold("ATLAS SCOUT")}  ${c.dim("from")} ${loc ? c.cyan(loc.name) : c.yellow("no location set (press w)")}` +
        (loc ? c.dim(` (${loc.source})`) : "") +
        `  ${c.dim(new Date().toISOString().slice(0, 10))}`,
    );
    L.push(TABS.map((t, i) => (t === ui.tab ? c.inv(` ${i + 1} ${t} `) : c.dim(` ${i + 1} ${t} `))).join(" "));
    L.push("");

    if (ui.tab === "now") L.push(...nowView(W));
    if (ui.tab === "wishlist") L.push(...wishView(W));
    if (ui.tab === "trips") L.push(...tripView(W));
    if (ui.tab === "runs") L.push(...runView(W));
    return L;
  }

  function nowView(W: number): string[] {
    const L: string[] = [];
    const month = new Date().getUTCMonth();
    const reach = ui.wish.filter((w) => !w.too_far && w.status === "active");
    if (!ui.wish.length) {
      L.push("Wish list is empty. Press a to add a place, for example: Madeira, Lofoten, Kyoto.");
      return L;
    }
    const inSeason = [...reach].sort((a, b) => b.season_now - a.season_now).slice(0, 5);
    L.push(c.bold(`In season over the next 30 days (${MONTHS[month]})`));
    for (const w of inSeason) {
      L.push(`  ${score(w.season_now)}  ${pad(w.name, 28)} ${c.dim(`${w.hours.toFixed(1)} h`)}  ${heatRow(w.months)}`);
    }
    L.push("");
    const next = (ui.state?.trips ?? []).filter((t) => t.status !== "dismissed").slice(0, 4);
    L.push(c.bold("Organized trips"));
    if (!next.length) L.push(c.dim("  none yet: set a location (w) and add places (a)"));
    for (const t of next) {
      L.push(`  ${statusTag(t)} ${pad(`${fmtDate(t.start)} to ${fmtDate(t.end)}`, 17)} ${pad(t.title, 30)} ${score(t.score)}  ${eur(t.est_cost_eur)}`);
    }
    const run = ui.state?.runs[0];
    L.push("");
    L.push(c.bold("Last research run"));
    L.push(run ? `  ${runLine(run, W)}` : c.dim("  never: press r to send the routine out"));
    return L;
  }

  function wishView(W: number): string[] {
    const L: string[] = [];
    L.push(c.dim(`${pad("", 2)}${pad("place", 26)}  ${pad("now", 4)}  ${pad("best window", 17)}  ${pad("fit", 4)}  ${pad("hours", 5)}  ${MONTH_LETTERS}`));
    ui.wish.forEach((w, i) => {
      const name = `${w.status !== "active" ? c.dim(`[${w.status}] `) : ""}${w.name}`;
      const best = w.best ? `${fmtDate(w.best.start)} to ${fmtDate(w.best.end)}` : c.dim("n/a");
      const row =
        `${i === ui.sel ? c.cyan(">") : " "} ${pad(name, 26)}  ${pad(score(w.season_now), 4)}  ${pad(best, 17)}  ${pad(w.best ? score(w.best.composite) : "", 4)}  ` +
        `${pad(w.too_far ? c.red(w.hours.toFixed(0)) : w.hours.toFixed(1), 5, true)}  ${w.has_climate ? heatRow(w.months) : c.dim("climate pending")}`;
      L.push(row);
    });
    const w = ui.wish[ui.sel];
    if (w) {
      L.push("");
      L.push(c.bold(w.name) + c.dim(`  ${w.activities.join(", ")}  priority ${w.priority}  ${w.km} km`));
      const m = w.months;
      const cl = m.map((x) => (x.climate == null ? " -" : x.climate.toFixed(0).padStart(2))).join("");
      const qu = m.map((x) => (x.quiet == null ? " ." : String(x.quiet).padStart(2))).join("");
      L.push(c.dim(`  climate ${cl}`));
      L.push(c.dim(`  quiet   ${qu}   (. = not researched yet)`));
      const ev = m.filter((x) => x.events.length).map((x) => `${MONTHS[x.month - 1]}: ${x.events.join(", ")}`);
      if (ev.length) L.push(`  ${truncate(ev.join(" | "), W - 4)}`);
      if (w.cheapest_flight) L.push(`  cheapest flight ${eur(w.cheapest_flight.price_eur)} ${c.dim(w.cheapest_flight.provider)} ${c.dim(truncate(w.cheapest_flight.url, W - 40))}`);
      if (w.notes) L.push(c.dim(`  ${truncate(w.notes, W - 4)}`));
    }
    return L;
  }

  function tripView(W: number): string[] {
    const trips = ui.state?.trips ?? [];
    const L: string[] = [];
    if (!trips.length) return [c.dim("No trips yet. Add places and set where you are; the planner fills this in.")];
    trips.forEach((t, i) => {
      L.push(`${i === ui.sel ? c.cyan(">") : " "} ${statusTag(t)} ${pad(`${fmtDate(t.start)} to ${fmtDate(t.end)}`, 17)} ${pad(t.title, 32)} ${score(t.score)}  ${eur(t.est_cost_eur)}  ${c.dim(t.source)}`);
    });
    const t = trips[ui.sel];
    if (t) {
      L.push("");
      L.push(c.bold(t.title) + c.dim(`  from ${t.origin}`));
      for (const s of t.stops) L.push(`  ${fmtDate(s.arrive)} to ${fmtDate(s.depart)}  ${s.dest_id}  ${s.nights} nights`);
      for (const part of t.rationale.split(" | ")) L.push(c.dim(`  ${truncate(part, W - 4)}`));
    }
    return L;
  }

  function runView(W: number): string[] {
    const runs = ui.state?.runs ?? [];
    if (!runs.length) return [c.dim("No runs yet. Press r to research, D to discover new places.")];
    const L: string[] = [];
    for (const r of runs) {
      L.push(runLine(r, W));
      if (r.summary) for (const line of r.summary.split("\n").slice(0, 6)) L.push(c.dim(`    ${truncate(line, W - 6)}`));
    }
    return L;
  }

  const runLine = (r: Run, W: number) =>
    `${r.status === "failed" ? c.red(r.status) : r.status === "ingested" ? c.green(r.status) : c.yellow(r.status)}  ${r.fired_at.slice(0, 16).replace("T", " ")}  ${truncate(r.detail, W - 30)}`;

  const statusTag = (t: Trip) =>
    pad(
      t.status === "priced" ? c.green("priced") : t.status === "saved" ? c.cyan("saved") : t.status === "booked" ? c.green("booked") : t.status === "dismissed" ? c.dim("dismissed") : c.yellow("draft"),
      9,
    );

  function footer(): string {
    if (ui.prompt) return `${c.bold(ui.prompt.label)} ${ui.prompt.value}█  ${c.dim("enter to confirm, esc to cancel")}`;
    const keys: Record<Tab, string> = {
      now: "w where  l locate  a add  r research  D discover  p replan",
      wishlist: "up/down  a add  x remove  +/- priority  v pause/resume  r research",
      trips: "up/down  s save  b booked  d dismiss  p replan",
      runs: "r research  D discover",
    };
    return `${c.dim(`${keys[ui.tab]}  tab/1-4 switch  q quit`)}${ui.flash ? `   ${ui.flash}` : ""}`;
  }

  function draw() {
    const H = out.rows ?? 30;
    const body = lines().slice(0, H - 2);
    out.write(`${ESC}H${ESC}2J`);
    out.write(body.join("\n"));
    out.write(`${ESC}${H};1H${ESC}2K${footer()}`);
  }

  const listLen = () => (ui.tab === "wishlist" ? ui.wish.length : ui.tab === "trips" ? (ui.state?.trips.length ?? 0) : 0);

  async function onKey(k: string) {
    if (ui.prompt) {
      const p = ui.prompt;
      if (k === "\r") {
        ui.prompt = null;
        if (p.value.trim()) await p.done(p.value.trim());
        else draw();
      } else if (k === "\x1b") {
        ui.prompt = null;
        draw();
      } else if (k === "\x7f") {
        p.value = p.value.slice(0, -1);
        draw();
      } else if (k >= " " && k.length === 1) {
        p.value += k;
        draw();
      }
      return;
    }
    if (k === "q" || k === "\x03") return quit();
    if (k === "\t") (ui.tab = TABS[(TABS.indexOf(ui.tab) + 1) % TABS.length]), (ui.sel = 0);
    else if (/^[1-4]$/.test(k)) (ui.tab = TABS[Number(k) - 1]), (ui.sel = 0);
    else if (k === `${ESC}A` || k === "k") ui.sel = Math.max(0, ui.sel - 1);
    else if (k === `${ESC}B` || k === "j") ui.sel = Math.min(Math.max(0, listLen() - 1), ui.sel + 1);
    else if (k === "w")
      return ask("Where are you now (city or place):", (v) => act("locating", async () => `now in ${(await client.where({ name: v })).name}`));
    else if (k === "l")
      return act("locating by IP", async () => {
        const hit = await ipLocate();
        if (!hit) throw new Error("IP lookup failed; use w to type a place");
        return `now in ${(await client.where(hit)).name}`;
      });
    else if (k === "a")
      return ask("Add place (name; activities comma list; priority 1-5), e.g. Madeira; hiking,nature; 4:", (v) =>
        act("adding", async () => {
          const [name, acts, prio] = v.split(";").map((x) => x.trim());
          const body: Record<string, unknown> = { name };
          if (acts) body.activities = acts.split(",").map((a) => a.trim()).filter(Boolean);
          if (prio) body.priority = Number(prio);
          const w = await client.add(body);
          return `added ${w.name}`;
        }),
      );
    else if (k === "r") return act("firing research routine", async () => runMsg(await client.run("research")));
    else if (k === "D") return act("firing discovery routine", async () => runMsg(await client.run("discover")));
    else if (k === "p") return act("replanning", async () => `${(await client.plan()).kept} trips planned`);
    else if (ui.tab === "wishlist" && ui.wish[ui.sel]) {
      const w = ui.wish[ui.sel];
      if (k === "x") return ask(`Remove ${w.name}? type yes:`, async (v) => (v === "yes" ? act("removing", async () => (await client.remove(w.id), `removed ${w.name}`)) : draw()));
      if (k === "+" || k === "-")
        return act("updating", async () => (await client.patchWish(w.id, { priority: Math.max(1, Math.min(5, w.priority + (k === "+" ? 1 : -1))) }), ""));
      if (k === "v") return act("updating", async () => (await client.patchWish(w.id, { status: w.status === "active" ? "paused" : "active" }), ""));
    } else if (ui.tab === "trips" && ui.state?.trips[ui.sel]) {
      const t = ui.state.trips[ui.sel];
      const map: Record<string, Trip["status"]> = { s: "saved", b: "booked", d: "dismissed" };
      if (map[k]) return act("updating", async () => `${t.title}: ${(await client.setTrip(t.id, map[k])).status}`);
    }
    ui.sel = Math.min(ui.sel, Math.max(0, listLen() - 1));
    draw();
  }

  const runMsg = (r: Run) => (r.status === "failed" ? `run failed: ${r.detail}` : `routine fired (${r.id}); results land here when it posts back`);

  function quit() {
    out.write(`${ESC}?25h${ESC}?1049l`);
    process.stdin.setRawMode?.(false);
    process.exit(0);
  }

  out.write(`${ESC}?1049h${ESC}?25l`);
  process.stdin.setRawMode?.(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (d: string) => void onKey(d));
  process.on("SIGINT", quit);
  out.on("resize", draw);

  await load();
  // First run with no location: try the IP once so trips have an origin.
  if (ui.state && !ui.state.location) {
    const hit = await ipLocate();
    if (hit) {
      await client.where(hit).catch(() => undefined);
      await load();
      ui.flash = c.dim(`location guessed from IP: ${hit.name} (press w to correct)`);
    }
  }
  draw();
  setInterval(async () => {
    if (!ui.prompt && !ui.busy) {
      await load();
      draw();
    }
  }, 30_000);
}

