// Builds src/data/dashboard.json from a checkout of kygura/meridian.
//   MERIDIAN_DIR=../meridian bun scripts/build-data.ts
// Scores are recomputed with Meridian's own comfort formula (src/lib/comfort.ts,
// copied verbatim), the same way the Meridian server rescores its seed data.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { annualRain, comfortScore } from "../src/lib/comfort.ts";

const M = process.env.MERIDIAN_DIR;
if (!M) throw new Error("set MERIDIAN_DIR to a kygura/meridian checkout");
const ISO = process.env.ISO_3166_JSON ?? "/usr/share/iso-codes/json/iso_3166-1.json";
const read = (p: string) => JSON.parse(readFileSync(join(M, p), "utf8"));

const slugify = (city: string, country: string) =>
  `${city}-${country}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// worldcities.csv: City,lat,lng,country,population (no quoted commas in practice; handle them anyway)
type CityRow = { id: string; name: string; country: string; lat: number; lng: number; pop: number };
const rows = new Map<string, CityRow>();
for (const line of readFileSync(join(M, "data/worldcities.csv"), "utf8").split("\n").slice(1)) {
  if (!line.trim()) continue;
  const cells = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.map((c) => c.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"'));
  const [name, lat, lng, country, pop] = cells;
  const id = slugify(name, country);
  if (!rows.has(id)) rows.set(id, { id, name, country, lat: +lat, lng: +lng, pop: +pop || 0 });
}

const cityData = read("data/city-data.json").cities as Record<string, { c?: string }>;
const r1 = (x: number) => Math.round(x * 10) / 10;

// 1. Seasonality: monthly comfort for the tracked cities.
const seas = read("data/seasonality.json");
const cities = Object.entries(seas.cities as Record<string, { months: { score: number; tempC: number; precipMm: number; pm25?: number }[] }>)
  .map(([id, v]) => {
    const r = rows.get(id);
    if (!r || v.months.length !== 12) return null;
    const year = annualRain(v.months.map((m) => m.precipMm));
    return {
      id,
      name: r.name,
      country: r.country,
      iso3: cityData[id]?.c ?? null,
      lat: r1(r.lat),
      lng: r1(r.lng),
      pop: r.pop,
      months: v.months.map((m) => ({
        s: comfortScore(m.tempC, m.precipMm, m.pm25, year),
        t: r1(m.tempC),
        p: Math.round(m.precipMm),
        ...(m.pm25 != null ? { a: r1(m.pm25) } : {}),
      })),
    };
  })
  .filter(Boolean);

// 2. Livability: quality of life vs beauty, the 600 largest cities with data.
const liv = read("data/livability.json").cities as Record<string, any>;
const live = [...rows.values()]
  .filter((r) => liv[r.id] && liv[r.id].quality != null && liv[r.id].beauty != null)
  .sort((a, b) => b.pop - a.pop)
  .slice(0, 600)
  .map((r) => {
    const l = liv[r.id];
    return {
      id: r.id,
      name: r.name,
      country: r.country,
      iso3: cityData[r.id]?.c ?? null,
      pop: r.pop,
      quality: l.quality,
      beauty: l.beauty,
      q: l.qualityParts,
      b: { setting: l.setting, character: l.character },
    };
  });

// 3. Events, from Meridian's live events API (ADR 0021). Events are no longer a file in the
// repo: Meridian fetches them from Wikidata and other sources at runtime. One request per
// month; an event listed in several months (an aurora season) gets an entry for each.
const API = (process.env.MERIDIAN_API ?? "https://meridian-virid-nine.vercel.app").replace(/\/$/, "");
type ApiPoint = { eventId: string; title: string; kind: string; recurring: boolean; date?: string; cityId: string; cityName: string };
const byKey = new Map<string, { id: string; title: string; kind: string; month: number; date: string | null; recurring: boolean; cities: string[] }>();
let eventsAsOf = "";
for (let month = 1; month <= 12; month++) {
  const res = await fetch(`${API}/api/overlays/events?month=${month}`);
  if (!res.ok) throw new Error(`events for month ${month}: ${API} answered ${res.status}`);
  const body = (await res.json()) as { asOf: string; events: ApiPoint[] };
  if (body.asOf > eventsAsOf) eventsAsOf = body.asOf;
  for (const p of body.events) {
    const key = `${p.eventId}|${month}`;
    const e = byKey.get(key) ?? { id: key, title: p.title, kind: p.kind, month, date: p.date ?? null, recurring: Boolean(p.recurring), cities: [] };
    if (!e.cities.includes(p.cityName)) e.cities.push(p.cityName);
    byKey.set(key, e);
  }
}
const events = [...byKey.values()];

const ph = read("data/phenomena.json");
const phenomena = ph.items.map((p: any) => ({
  id: p.id,
  kind: p.kind,
  type: p.type,
  label: p.label,
  country: p.country,
  lat: p.lat,
  lng: p.lng,
  severity: p.severity ?? 1,
  months: p.months ?? null,
  peak: p.peak ?? null,
}));

// 4. Country outlines, coordinates rounded to 0.1 degree, tiny rings dropped.
const geo = read("public/geo/countries.json");
const ringArea = (ring: number[][]) => {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  return Math.abs(a / 2);
};
const simplifyRing = (ring: number[][]) => {
  const out: number[][] = [];
  for (const [x, y] of ring) {
    const p = [r1(x), r1(y)];
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  return out;
};
const countries = {
  type: "FeatureCollection",
  features: geo.features.map((f: any) => {
    const polys: number[][][][] = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    const kept = polys
      .map((poly) => poly.map(simplifyRing).filter((r) => r.length >= 4))
      .filter((poly) => poly.length && (ringArea(poly[0]) > 0.05 || polys.length === 1));
    return {
      type: "Feature",
      properties: { name: f.properties.name, iso3: f.properties.iso_a3, continent: f.properties.continent },
      geometry: { type: "MultiPolygon", coordinates: kept },
    };
  }),
};

// 5. Visa matrix: passport (ISO2) -> requirement token per destination.
const visa = read("data/visa-requirements.json");
const iso = JSON.parse(readFileSync(ISO, "utf8"))["3166-1"] as { alpha_2: string; alpha_3: string }[];
const a2to3 = Object.fromEntries(iso.map((c) => [c.alpha_2, c.alpha_3]));
const visaOut = {
  destinations: visa.destinations as string[],
  names: Object.fromEntries(Object.entries(visa.countries as Record<string, { name: string }>).map(([k, v]) => [k, v.name])),
  iso3: Object.fromEntries((visa.destinations as string[]).map((c) => [c, a2to3[c] ?? null])),
  matrix: visa.matrix as Record<string, string>,
  source: "Passport Index Data, dataset of 17 February 2026",
};

const out = {
  builtAt: new Date().toISOString().slice(0, 10),
  climateWindow: seas.window,
  cities,
  live,
  events,
  eventsAsOf,
  eventsSource: API,
  phenomena,
  phenomenaAsOf: ph.asOf,
  countries,
  visa: visaOut,
};
writeFileSync(new URL("../src/data/dashboard.json", import.meta.url), JSON.stringify(out));
console.log(`cities ${cities.length}, live ${live.length}, events ${events.length}, phenomena ${phenomena.length}, countries ${countries.features.length}, passports ${Object.keys(visa.matrix).length}`);
