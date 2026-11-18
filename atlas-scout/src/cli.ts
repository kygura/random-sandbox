#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { Client } from "./client.ts";
import { ipLocate } from "./geo.ts";
import { c, eur, fmtDate, heatRow, MONTH_LETTERS, MONTHS, pad, score } from "./tui/format.ts";
import type { Profile, Trip } from "./types.ts";

const HELP = `atlas: seasonal travel scout

  atlas serve                       start the backend (same as: bun run server)
  atlas tui                         interactive terminal UI
  atlas where [place | --ip]        show or set where you are now
  atlas home <place>                set home base (fallback origin)
  atlas add <place> [--do hiking,beach] [--p 1-5] [--prefer 4,5] [--avoid 8] [--notes text]
                                    [--lat 38.5 --lon -28.4] when the name is ambiguous
  atlas rm <id>                     remove a place
  atlas pause|resume <id>           keep a place but skip it in planning
  atlas list                        wish list ranked by season and distance
  atlas season <id>                 month-by-month breakdown for one place
  atlas plan                        re-organize trips now
  atlas trips                       organized trips
  atlas trip <id> save|booked|dismiss
  atlas run [research|discover]     send the cloud routine out
  atlas runs                        recent routine runs
  atlas profile [key=value ...]     budget=200-1500 days=4-10 horizon=150 maxhours=14
                                    lead=10 window=2026-12-19..2026-12-28 (repeatable) persona="..."
  atlas import <file.json>          bulk add places (array of {name, activities, priority, ...})

Activities: beach surf diving hiking nature culture city food wildlife ski
Env: ATLAS_URL (default http://127.0.0.1:7878), ATLAS_TOKEN`;

const client = new Client();

function flags(args: string[]) {
  const pos: string[] = [];
  const f: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) f[args[i].slice(2)] = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : "true";
    else pos.push(args[i]);
  }
  return { pos, f };
}
const nums = (s?: string) => (s ? s.split(",").map(Number).filter((n) => n >= 1 && n <= 12) : undefined);
const range = (s: string) => {
  const [a, b] = s.split("-").map(Number);
  return { min: a, max: b ?? a };
};

async function main(argv: string[]) {
  const [cmd, ...rest] = argv;
  const { pos, f } = flags(rest);
  switch (cmd) {
    case "serve":
      await import("./server.ts").then(async (m) => {
        const { Atlas } = await import("./service.ts");
        const { Store } = await import("./store.ts");
        const atlas = new Atlas(new Store());
        const port = Number(process.env.PORT ?? 7878);
        Bun.serve({ port, hostname: process.env.HOST ?? "127.0.0.1", fetch: m.createApp(atlas) });
        m.startScheduler(atlas);
        console.log(`atlas-scout backend on http://${process.env.HOST ?? "127.0.0.1"}:${port}`);
      });
      return;
    case "tui":
    case undefined:
      if (cmd === undefined && !process.stdout.isTTY) return console.log(HELP);
      return (await import("./tui/app.ts")).runTui(client);
    case "where": {
      if (f.ip) {
        const hit = await ipLocate();
        if (!hit) throw new Error("IP lookup failed");
        const l = await client.where(hit);
        return console.log(`now in ${l.name} (ip)`);
      }
      if (pos.length) {
        const l = await client.where({ name: pos.join(" ") });
        return console.log(`now in ${l.name} (${l.lat.toFixed(2)}, ${l.lon.toFixed(2)})`);
      }
      const s = await client.state();
      return console.log(s.location ? `${s.location.name} (${s.location.source}, ${s.location.at.slice(0, 16)})` : "no location set");
    }
    case "home": {
      const l = await client.home({ name: pos.join(" ") });
      return console.log(`home set to ${l.name}`);
    }
    case "add": {
      if (!pos.length) throw new Error("usage: atlas add <place> [--do hiking] [--p 4]");
      const w = await client.add({
        name: pos.join(" "),
        ...(f.do ? { activities: f.do.split(",") } : {}),
        ...(f.p ? { priority: Number(f.p) } : {}),
        ...(f.prefer ? { prefer_months: nums(f.prefer) } : {}),
        ...(f.avoid ? { avoid_months: nums(f.avoid) } : {}),
        ...(f.notes ? { notes: f.notes } : {}),
        ...(f.iata ? { iata: f.iata.toUpperCase() } : {}),
        ...(f.lat && f.lon ? { lat: Number(f.lat), lon: Number(f.lon) } : {}),
      });
      return console.log(`added ${w.name} as ${w.id} (${w.activities.join(", ")}, priority ${w.priority})`);
    }
    case "import": {
      const items = JSON.parse(readFileSync(pos[0], "utf8")) as Record<string, unknown>[];
      for (const it of items) {
        try {
          const w = await client.add(it);
          console.log(`added ${w.id}`);
        } catch (e) {
          console.log(c.red(`skip ${String(it.name)}: ${(e as Error).message}`));
        }
      }
      return;
    }
    case "rm":
      await client.remove(pos[0]);
      return console.log(`removed ${pos[0]}`);
    case "pause":
    case "resume":
      await client.patchWish(pos[0], { status: cmd === "pause" ? "paused" : "active" });
      return console.log(`${pos[0]} ${cmd}d`);
    case "list": {
      const rows = await client.wishlist();
      if (!rows.length) return console.log("wish list is empty: atlas add <place>");
      console.log(c.dim(`${pad("id", 24)}  now   ${pad("best window", 17)}  fit   hours  ${MONTH_LETTERS}`));
      for (const w of rows) {
        const best = w.best ? `${fmtDate(w.best.start)} to ${fmtDate(w.best.end)}` : "n/a";
        console.log(
          `${pad(w.status === "active" ? w.id : c.dim(`${w.id} (${w.status})`), 24)}  ${pad(score(w.season_now), 4)}  ${pad(best, 17)}  ${pad(w.best ? score(w.best.composite) : "", 4)}  ${pad(w.too_far ? c.red(w.hours.toFixed(0)) : w.hours.toFixed(1), 5, true)}  ${w.has_climate ? heatRow(w.months) : c.dim("climate pending")}`,
        );
      }
      return;
    }
    case "season": {
      const rows = await client.wishlist();
      const w = rows.find((r) => r.id === pos[0]);
      if (!w) throw new Error(`unknown id ${pos[0]}; see atlas list`);
      console.log(`${c.bold(w.name)}  ${w.activities.join(", ")}  ${w.km} km, ${w.hours} h`);
      console.log(c.dim("month  score  climate  quiet  cond  events"));
      for (const m of w.months)
        console.log(
          `${pad(MONTHS[m.month - 1], 5)}  ${pad(score(m.score), 5)}  ${pad(m.climate?.toFixed(1) ?? "-", 7)}  ${pad(m.quiet?.toString() ?? ".", 5)}  ${pad(m.conditions?.toString() ?? ".", 4)}  ${m.events.join("; ")}`,
        );
      return;
    }
    case "plan": {
      const r = await client.plan();
      console.log(`${r.kept} trips planned, ${r.removed} stale drafts removed`);
      return printTrips(await client.trips());
    }
    case "trips":
      return printTrips(await client.trips());
    case "trip": {
      const map: Record<string, Trip["status"]> = { save: "saved", booked: "booked", dismiss: "dismissed" };
      const status = map[pos[1]];
      if (!status) throw new Error("usage: atlas trip <id> save|booked|dismiss");
      const t = await client.setTrip(pos[0], status);
      return console.log(`${t.title}: ${t.status}`);
    }
    case "run": {
      const r = await client.run(pos[0] === "discover" ? "discover" : "research");
      return console.log(r.status === "failed" ? c.red(`failed: ${r.detail}`) : `fired ${r.id}`);
    }
    case "runs":
      for (const r of await client.runs()) console.log(`${r.fired_at.slice(0, 16)}  ${r.status}  ${r.detail}${r.summary ? `\n  ${r.summary.replace(/\n/g, "\n  ")}` : ""}`);
      return;
    case "profile": {
      if (!pos.length) return console.log(JSON.stringify((await client.state()).profile, null, 2));
      const patch: Partial<Profile> & { availability?: Profile["availability"] } = {};
      const windows: Profile["availability"] = [];
      for (const kv of pos) {
        const [k, ...v] = kv.split("=");
        const val = v.join("=");
        if (k === "budget") patch.budget_eur = range(val);
        else if (k === "days") patch.trip_days = range(val);
        else if (k === "horizon") patch.horizon_days = Number(val);
        else if (k === "lead") patch.lead_days = Number(val);
        else if (k === "maxhours") patch.max_flight_hours = Number(val);
        else if (k === "multistop") patch.multi_stop_km = Number(val);
        else if (k === "persona") patch.persona = val;
        else if (k === "interests") patch.interests = val.split(",");
        else if (k === "window") {
          if (val === "none") patch.availability = [];
          else {
            const [start, end] = val.split("..");
            windows.push({ start, end });
          }
        } else throw new Error(`unknown key ${k}`);
      }
      if (windows.length) patch.availability = windows;
      console.log(JSON.stringify(await client.profile(patch), null, 2));
      return;
    }
    case "help":
    case "--help":
    case "-h":
      return console.log(HELP);
    default:
      throw new Error(`unknown command ${cmd}\n\n${HELP}`);
  }
}

function printTrips(trips: Trip[]) {
  if (!trips.length) return console.log("no trips yet: set a location and add places");
  for (const t of trips) {
    console.log(`${pad(t.status, 9)} ${pad(`${fmtDate(t.start)} to ${fmtDate(t.end)}`, 17)} ${pad(t.title, 30)} ${score(t.score)}  ${eur(t.est_cost_eur)}  ${c.dim(t.id)}`);
    for (const part of t.rationale.split(" | ")) console.log(c.dim(`          ${part}`));
  }
}

main(process.argv.slice(2)).catch((e) => {
  console.error(c.red((e as Error).message));
  process.exit(1);
});
