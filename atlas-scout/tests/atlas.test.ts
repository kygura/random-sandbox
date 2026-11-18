import { describe, expect, test } from "bun:test";
import { monthlyNormals } from "../src/climate.ts";
import { km, slug, travelHours } from "../src/geo.ts";
import { mergePlan, organize, rank } from "../src/planner.ts";
import { climateScore, monthScores } from "../src/season.ts";
import { createApp } from "../src/server.ts";
import { Atlas } from "../src/service.ts";
import { Store } from "../src/store.ts";
import { ProfileSchema, type ClimateMonth, type Trip, type WishItem } from "../src/types.ts";

const month = (m: number, tmax: number, rain = 3, sun = 8): ClimateMonth => ({ month: m, tmax, tmin: tmax - 8, precip_mm: rain * 5, rain_days: rain, sunshine_h: sun });
// Mild all year, hot and dry in summer, wet in winter: a Mediterranean island.
const island = Array.from({ length: 12 }, (_, i) => month(i + 1, [17, 17, 18, 20, 22, 25, 28, 29, 27, 24, 20, 18][i], [8, 7, 6, 5, 3, 1, 0, 0, 2, 5, 7, 8][i]));
// Arctic: below zero half the year.
const arctic = Array.from({ length: 12 }, (_, i) => month(i + 1, [-2, -2, 0, 4, 9, 13, 16, 15, 11, 6, 2, -1][i], 12, 2));

const wish = (id: string, lat: number, lon: number, activities: WishItem["activities"], extra: Partial<WishItem> = {}): WishItem => ({
  id,
  name: id,
  lat,
  lon,
  activities,
  priority: 3,
  prefer_months: [],
  avoid_months: [],
  status: "active",
  source: "user",
  added_at: "2026-01-01",
  ...extra,
});

const malaga = { name: "Malaga", lat: 36.72, lon: -4.42, source: "manual" as const, at: "" };
const today = new Date("2026-11-18T00:00:00Z");

describe("geo", () => {
  test("distance and travel time", () => {
    expect(km(malaga, { lat: 40.42, lon: -3.7 })).toBeGreaterThan(400);
    expect(km(malaga, { lat: 40.42, lon: -3.7 })).toBeLessThan(440);
    expect(travelHours(1200)).toBeCloseTo(4.2, 1);
    expect(travelHours(9000)).toBeGreaterThan(15);
  });
  test("slug folds accents and nordic letters", () => {
    expect(slug("Tromsø, Norway")).toBe("tromso-norway");
    expect(slug("Málaga")).toBe("malaga");
  });
});

describe("climate normals", () => {
  test("averages per month and counts wet days per year", () => {
    const days = ["2024-01-01", "2024-01-02", "2025-01-01", "2025-07-01"];
    const n = monthlyNormals({
      time: days,
      temperature_2m_max: [10, 12, 14, 30],
      temperature_2m_min: [2, 4, 6, 20],
      precipitation_sum: [5, 0, 2, 0],
      sunshine_duration: [3600 * 4, 3600 * 6, 3600 * 5, 3600 * 12],
    });
    expect(n[0].tmax).toBe(12);
    expect(n[0].rain_days).toBe(1); // 2 wet days over 2 years
    expect(n[0].sunshine_h).toBe(5);
    expect(n[6].tmax).toBe(30);
  });
});

describe("season", () => {
  test("beach weather peaks in summer, hiking in the shoulder months", () => {
    expect(climateScore(island[7], "beach")).toBeGreaterThan(climateScore(island[0], "beach"));
    expect(climateScore(island[3], "hiking")).toBeGreaterThan(climateScore(island[7], "hiking"));
  });
  test("ski needs cold", () => {
    expect(climateScore(arctic[0], "ski")).toBeGreaterThan(4);
    expect(climateScore(island[0], "ski")).toBeLessThan(2);
  });
  test("research signals and month preferences move the score", () => {
    const w = wish("isle", 32.7, -16.9, ["beach"], { avoid_months: [8] });
    const base = monthScores(w, island, []);
    const quietJuly = monthScores(w, island, [{ dest_id: "isle", month: 7, quiet: 5, conditions: 5, events: [], sources: [], researched_at: "" }]);
    expect(quietJuly[6].score).toBeGreaterThan(base[6].score);
    expect(base[7].score).toBeLessThanOrEqual(1.5);
    expect(base[6].researched).toBe(false);
  });
  test("unknown climate stays neutral", () => {
    const s = monthScores(wish("x", 0, 0, ["culture"]), undefined, []);
    expect(s.every((m) => m.score === 3)).toBe(true);
  });
});

describe("planner", () => {
  const profile = ProfileSchema.parse({ trip_days: { min: 4, max: 8 }, max_flight_hours: 12 });
  const input = {
    profile,
    origin: malaga,
    wishlist: [
      wish("madeira", 32.65, -16.92, ["hiking", "nature"], { priority: 5 }),
      wish("fuerte", 28.36, -14.05, ["nature"]),
      wish("lofoten", 68.2, 14.5, ["hiking"]),
      wish("kyoto", 35.0, 135.7, ["culture"]),
    ],
    climate: { madeira: island, fuerte: island, lofoten: arctic, kyoto: island },
    signals: [],
    offers: [],
    today,
  };

  test("ranking flags places beyond the flight limit", () => {
    const r = rank(input);
    expect(r.find((x) => x.dest.id === "kyoto")!.too_far).toBe(true);
    expect(r[r.length - 1].dest.id).toBe("kyoto");
    expect(r[0].best!.start >= "2026-11-28").toBe(true);
  });

  test("organizes non-overlapping trips and skips poor seasons", () => {
    const trips = organize(input);
    expect(trips.length).toBeGreaterThan(0);
    expect(trips.some((t) => t.stops.some((s) => s.dest_id === "kyoto"))).toBe(false);
    const sorted = [...trips].sort((a, b) => a.start.localeCompare(b.start));
    for (let i = 1; i < sorted.length; i++) expect(sorted[i].start >= sorted[i - 1].end).toBe(true);
  });

  test("availability windows get the best place for those dates, with a second stop when close", () => {
    const p = ProfileSchema.parse({ ...profile, availability: [{ start: "2027-05-07", end: "2027-05-17" }] });
    const trips = organize({ ...input, profile: p });
    expect(trips).toHaveLength(1);
    expect(trips[0].start).toBe("2027-05-07");
    expect(trips[0].stops.map((s) => s.dest_id).sort()).toEqual(["fuerte", "madeira"]);
    expect(trips[0].stops.reduce((a, s) => a + s.nights, 0)).toBe(10);
  });

  test("locked trips keep their place and dates", () => {
    const first = organize(input)[0];
    const locked: Trip = { ...first, status: "priced" };
    const next = organize(input, 4, [locked]);
    const lockedDest = locked.stops[0].dest_id;
    expect(next.some((t) => t.stops.some((s) => s.dest_id === lockedDest))).toBe(false);
  });

  test("merge keeps user decisions and drops stale drafts", () => {
    const a = organize(input)[0];
    const b: Trip = { ...a, id: "other" };
    const existing: Trip[] = [{ ...a, status: "dismissed" }, { ...a, id: "old-draft" }];
    const { keep, remove } = mergePlan(existing, [a, b]);
    expect(keep.map((t) => t.id)).toEqual(["other"]);
    expect(remove).toEqual(["old-draft"]);
  });
});

describe("api", () => {
  // Fake network: geocoding and climate answer from fixtures.
  const fakeFetch = (async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes("geocoding-api")) {
      const name = new URL(u).searchParams.get("name")!;
      const places: Record<string, [number, number, string]> = { Madeira: [32.65, -16.92, "Portugal"], Malaga: [36.72, -4.42, "Spain"] };
      const p = places[name];
      return Response.json({ results: p ? [{ name, latitude: p[0], longitude: p[1], country: p[2] }] : [] });
    }
    if (u.includes("nominatim")) return Response.json([]);
    if (u.includes("archive-api")) {
      const time: string[] = [];
      for (let m = 1; m <= 12; m++) time.push(`2025-${String(m).padStart(2, "0")}-15`);
      return Response.json({ daily: { time, temperature_2m_max: island.map((x) => x.tmax), temperature_2m_min: island.map((x) => x.tmin), precipitation_sum: island.map(() => 0), sunshine_duration: island.map(() => 30000) } });
    }
    if (u.includes("routines")) return new Response("ok");
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  const setup = () => {
    const atlas = new Atlas(new Store(":memory:"), fakeFetch, { ATLAS_ROUTINE_FIRE_URL: "https://api.example/v1/claude_code/routines/x/fire", ATLAS_ROUTINE_TOKEN: "t", ATLAS_PUBLIC_URL: "https://atlas.example" });
    const app = createApp(atlas, "secret");
    const call = async (method: string, path: string, body?: unknown, token = "secret") => {
      const res = await app(new Request(`http://x${path}`, { method, headers: { authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined }));
      return { status: res.status, body: (await res.json()) as any };
    };
    return { atlas, call };
  };

  test("auth is required", async () => {
    const { call } = setup();
    expect((await call("GET", "/api/state", undefined, "wrong")).status).toBe(401);
    expect((await call("GET", "/api/health", undefined, "wrong")).status).toBe(200);
  });

  test("location, wish list, plan, ingest, run", async () => {
    const { call } = setup();
    expect((await call("POST", "/api/location", { name: "Malaga" })).body.name).toBe("Malaga, Spain");
    const added = await call("POST", "/api/wishlist", { name: "Madeira", activities: ["hiking"], priority: 5 });
    expect(added.body.id).toBe("madeira-portugal");
    expect((await call("POST", "/api/wishlist", { name: "Atlantis" })).status).toBe(404);
    expect((await call("POST", "/api/wishlist", { name: "Madeira", activities: ["golf"] })).status).toBe(422);

    const list = await call("GET", "/api/wishlist");
    expect(list.body[0].has_climate).toBe(true);
    expect(list.body[0].months).toHaveLength(12);

    const trips = (await call("GET", "/api/trips")).body as Trip[];
    expect(trips.length).toBe(1);

    const ctx = (await call("GET", "/api/context")).body;
    expect(ctx.research_needed[0].dest_id).toBe("madeira-portugal");

    const run = (await call("POST", "/api/run", { mode: "research" })).body;
    expect(run.status).toBe("fired");

    const ing = await call("POST", "/api/ingest", {
      run_id: run.id,
      signals: [{ dest_id: "madeira-portugal", month: 2, quiet: 4, sources: ["https://example.com/a"] }, { dest_id: "unknown", month: 2, quiet: 1 }],
      offers: [{ dest_id: "madeira-portugal", kind: "flight", title: "AGP-FNC", price_eur: 140, url: "https://kiwi.com/x", provider: "Kiwi.com" }],
      trips: [{ id: trips[0].id, est_cost_eur: 600, status: "priced" }],
      discoveries: [{ name: "La Palma", lat: 28.68, lon: -17.76, country: "Spain", activities: ["hiking"], priority: 3 }],
      summary: "done",
    });
    expect(ing.body).toEqual({ signals: 1, offers: 1, trips: 1, discoveries: 1 });
    const runs = (await call("GET", "/api/runs")).body;
    expect(runs[0].status).toBe("ingested");
    expect(runs[0].summary).toBe("done");
    const priced = ((await call("GET", "/api/trips")).body as Trip[]).find((t) => t.id === trips[0].id)!;
    expect(priced.status).toBe("priced");
    expect(priced.est_cost_eur).toBe(600);
    expect((await call("GET", "/api/wishlist")).body).toHaveLength(2);
  });

  test("run without routine credentials is recorded as failed", async () => {
    const atlas = new Atlas(new Store(":memory:"), fakeFetch, {});
    const r = await atlas.fireRoutine();
    expect(r.status).toBe("failed");
    expect(atlas.store.runs()).toHaveLength(1);
  });
});
