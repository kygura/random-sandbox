import { km, travelHours } from "./geo.ts";
import { monthScores, windowScore, type MonthScore } from "./season.ts";
import type { ClimateMonth, Location, Offer, Profile, Signal, Trip, WishItem } from "./types.ts";

const DAY = 86_400_000;
// A window only gets a trip if some destination is at least fair in it.
export const MIN_SEASON = 3;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type PlanInput = {
  profile: Profile;
  origin: Location;
  wishlist: WishItem[];
  climate: Record<string, ClimateMonth[] | undefined>;
  signals: Signal[];
  offers: Offer[];
  today?: Date;
};

export type Ranked = {
  dest: WishItem;
  km: number;
  hours: number;
  too_far: boolean;
  now: number; // season score for the next 30 days
  months: MonthScore[];
  best: { start: string; end: string; nights: number; season: number; composite: number } | null;
  cheapest_flight: Offer | null;
};

export const iso = (d: Date) => d.toISOString().slice(0, 10);
const parse = (s: string) => new Date(`${s}T00:00:00Z`);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const r2 = (x: number) => Math.round(x * 100) / 100;

function nightsFor(p: Profile, hours: number): number {
  const { min, max } = p.trip_days;
  if (hours > 8) return max;
  if (hours > 4) return Math.round((min + max) / 2);
  return min;
}

function composite(p: Profile, w: WishItem, season: number, hours: number, flight: Offer | null): number {
  const proximity = 5 - 4 * Math.min(1, hours / p.max_flight_hours);
  const price = flight && p.budget_eur.max > 0 ? Math.max(1, Math.min(5, 5 * (1 - flight.price_eur / p.budget_eur.max) + 1)) : 3;
  return r2(0.5 * season + 0.2 * w.priority + 0.15 * proximity + 0.15 * price);
}

// Candidate departure dates: every Friday from lead time to the horizon.
function fridays(p: Profile, today: Date): Date[] {
  const out: Date[] = [];
  let d = addDays(today, p.lead_days);
  while (d.getUTCDay() !== 5) d = addDays(d, 1);
  const limit = addDays(today, p.horizon_days);
  for (; d <= limit; d = addDays(d, 7)) out.push(d);
  return out;
}

export function rank(input: PlanInput): Ranked[] {
  const today = input.today ?? new Date();
  const p = input.profile;
  const starts = fridays(p, today);
  return input.wishlist
    .filter((w) => w.status === "active")
    .map((w) => {
      const months = monthScores(w, input.climate[w.id], input.signals.filter((s) => s.dest_id === w.id));
      const dist = km(input.origin, w);
      const hours = r2(travelHours(dist));
      const flights = input.offers.filter((o) => o.dest_id === w.id && o.kind === "flight");
      const cheapest = flights.sort((a, b) => a.price_eur - b.price_eur)[0] ?? null;
      const nights = nightsFor(p, hours);
      let best: Ranked["best"] = null;
      for (const s of starts) {
        const e = addDays(s, nights);
        const season = windowScore(months, s, e);
        const c = composite(p, w, season, hours, cheapest);
        if (!best || c > best.composite) best = { start: iso(s), end: iso(e), nights, season, composite: c };
      }
      return {
        dest: w,
        km: Math.round(dist),
        hours,
        too_far: hours > p.max_flight_hours,
        now: windowScore(months, today, addDays(today, 30)),
        months,
        best,
        cheapest_flight: cheapest,
      };
    })
    .sort((a, b) => Number(a.too_far) - Number(b.too_far) || (b.best?.composite ?? 0) - (a.best?.composite ?? 0));
}

function why(r: Ranked, start: string, origin: Location): string {
  const m = r.months[parse(start).getUTCMonth()];
  const parts = [`${MONTHS[m.month - 1]} season ${m.score.toFixed(1)}/5 for ${r.dest.activities.join("/")}`];
  if (m.climate != null) parts.push(`climate ${m.climate.toFixed(1)}`);
  if (m.quiet != null) parts.push(`quiet ${m.quiet}`);
  if (!m.researched) parts.push("crowds not researched yet");
  parts.push(`${r.hours.toFixed(1)} h from ${origin.name.split(",")[0]}`);
  parts.push(`priority ${r.dest.priority}`);
  if (m.events.length) parts.push(`events: ${m.events.slice(0, 2).join("; ")}`);
  return parts.join(", ");
}

const tripId = (stops: string[], start: string) => `t-${start}-${Bun.hash(stops.join("+")).toString(36).slice(0, 6)}`;

// Turn the ranking into concrete, non-overlapping trips. With explicit
// availability windows each window gets the best destination for it; without
// them, each top destination gets its best window, skipping overlaps.
// Trips in `locked` (priced, saved, booked) keep their dates and destinations.
export function organize(input: PlanInput, maxTrips = 4, locked: Trip[] = []): Trip[] {
  const p = input.profile;
  const today = input.today ?? new Date();
  const ranked = rank(input).filter((r) => !r.too_far && r.best);
  const used = new Set<string>(locked.flatMap((t) => t.stops.map((s) => s.dest_id)));
  const trips: Trip[] = [];
  const busy = [...locked];
  const origin = input.origin;

  const build = (first: Ranked, s: Date, nights: number): Trip => {
    const e = addDays(s, nights);
    let stops = [{ r: first, nights }];
    // Second stop when the window is long enough and a nearby wish fits the same dates.
    if (nights >= 2 * p.trip_days.min && p.multi_stop_km > 0) {
      const partner = ranked
        .filter((x) => x.dest.id !== first.dest.id && !used.has(x.dest.id) && km(x.dest, first.dest) <= p.multi_stop_km)
        .map((x) => ({ x, season: windowScore(x.months, s, e) }))
        .filter((c) => c.season >= 3.5)
        .sort((a, b) => b.season - a.season)[0];
      if (partner) {
        const n1 = Math.ceil(nights / 2);
        stops = [
          { r: first, nights: n1 },
          { r: partner.x, nights: nights - n1 },
        ];
      }
    }
    let cursor = s;
    const outStops = stops.map(({ r, nights: n }) => {
      const arrive = cursor;
      cursor = addDays(cursor, n);
      return { dest_id: r.dest.id, arrive: iso(arrive), depart: iso(cursor), nights: n };
    });
    stops.forEach(({ r }) => used.add(r.dest.id));
    const flights = stops.map(({ r }) => r.cheapest_flight?.price_eur ?? null);
    const season = r2(stops.reduce((a, { r, nights: n }) => a + windowScore(r.months, s, e) * n, 0) / nights);
    return {
      id: tripId(outStops.map((x) => x.dest_id), iso(s)),
      title: stops.map(({ r }) => r.dest.name.split(",")[0]).join(" + "),
      origin: origin.name,
      start: iso(s),
      end: iso(e),
      stops: outStops,
      score: r2(composite(p, first.dest, season, first.hours, first.cheapest_flight)),
      est_cost_eur: flights.every((f) => f != null) ? flights.reduce((a, b) => a! + b!, 0) : null,
      status: "draft",
      rationale: stops.map(({ r }) => `${r.dest.name}: ${why(r, iso(s), origin)}`).join(" | "),
      source: "planner",
      updated_at: new Date().toISOString(),
    };
  };

  const overlaps = (s: Date, e: Date) =>
    [...busy, ...trips].some((t) => s < addDays(parse(t.end), 7) && e > addDays(parse(t.start), -7));

  const windows = p.availability
    .map((w) => ({ s: parse(w.start), e: parse(w.end) }))
    .filter((w) => w.e > addDays(today, p.lead_days))
    .sort((a, b) => a.s.getTime() - b.s.getTime());

  // Explicit windows replace the rolling search, even when all are in the past.
  if (p.availability.length) {
    for (const w of windows) {
      if (trips.length >= maxTrips) break;
      if (busy.some((t) => w.s < parse(t.end) && w.e > parse(t.start))) continue;
      const nights = Math.max(1, Math.round((w.e.getTime() - w.s.getTime()) / DAY));
      const pick = ranked
        .filter((r) => !used.has(r.dest.id))
        .map((r) => ({ r, season: windowScore(r.months, w.s, w.e) }))
        .filter((x) => x.season >= MIN_SEASON)
        .map((x) => ({ ...x, c: composite(p, x.r.dest, x.season, x.r.hours, x.r.cheapest_flight) }))
        .sort((a, b) => b.c - a.c)[0];
      if (pick) trips.push(build(pick.r, w.s, nights));
    }
    return trips;
  }

  for (const r of ranked) {
    if (trips.length + locked.length >= maxTrips) break;
    if (used.has(r.dest.id) || !r.best || r.best.season < MIN_SEASON) continue;
    let s = parse(r.best.start);
    let e = parse(r.best.end);
    if (overlaps(s, e)) {
      // Try other Fridays that are nearly as good.
      const alt = fridays(p, today)
        .map((d) => ({ d, season: windowScore(r.months, d, addDays(d, r.best!.nights)) }))
        .filter((x) => x.season >= r.best!.season - 0.3 && !overlaps(x.d, addDays(x.d, r.best!.nights)))
        .sort((a, b) => b.season - a.season)[0];
      if (!alt) continue;
      s = alt.d;
      e = addDays(s, r.best.nights);
    }
    trips.push(build(r, s, Math.round((e.getTime() - s.getTime()) / DAY)));
  }
  return trips.sort((a, b) => a.start.localeCompare(b.start));
}

// Merge a fresh plan into stored trips: keep anything the user or the routine
// touched, drop stale planner drafts, never resurrect a dismissed trip.
export function mergePlan(existing: Trip[], fresh: Trip[]): { keep: Trip[]; remove: string[] } {
  const byId = new Map(existing.map((t) => [t.id, t]));
  const keep: Trip[] = [];
  for (const t of fresh) {
    const old = byId.get(t.id);
    if (!old || old.status === "draft") keep.push(old ? { ...t, est_cost_eur: t.est_cost_eur ?? old.est_cost_eur } : t);
  }
  const freshIds = new Set(fresh.map((t) => t.id));
  const remove = existing.filter((t) => t.status === "draft" && t.source === "planner" && !freshIds.has(t.id)).map((t) => t.id);
  return { keep, remove };
}
