import type { Activity, ClimateMonth, Signal, WishItem } from "./types.ts";

// Trapezoid: 0 below a, ramps to 1 between b and c, back to 0 at d.
function trap(x: number, a: number, b: number, c: number, d: number): number {
  if (x <= a || x >= d) return 0;
  if (x < b) return (x - a) / (b - a);
  if (x <= c) return 1;
  return (d - x) / (d - c);
}
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

type Comfort = { temp: [number, number, number, number]; dry: number; sun: number };

// Daytime high (deg C) bands per activity, and how much rain and sun matter.
const COMFORT: Record<Activity, Comfort> = {
  beach: { temp: [21, 26, 32, 37], dry: 0.3, sun: 0.2 },
  surf: { temp: [16, 21, 31, 36], dry: 0.2, sun: 0.1 },
  diving: { temp: [22, 26, 32, 36], dry: 0.3, sun: 0.1 },
  hiking: { temp: [6, 13, 24, 31], dry: 0.35, sun: 0.1 },
  nature: { temp: [6, 13, 26, 33], dry: 0.3, sun: 0.1 },
  culture: { temp: [7, 15, 27, 34], dry: 0.25, sun: 0.1 },
  city: { temp: [5, 14, 27, 34], dry: 0.25, sun: 0.1 },
  food: { temp: [5, 13, 29, 36], dry: 0.15, sun: 0.05 },
  wildlife: { temp: [-5, 10, 30, 38], dry: 0.3, sun: 0.05 },
  ski: { temp: [-18, -8, 2, 7], dry: 0, sun: 0.15 },
};

// 1..5 for how good the weather is for this activity in this month.
export function climateScore(c: ClimateMonth, activity: Activity): number {
  const p = COMFORT[activity];
  const temp = trap(c.tmax, ...p.temp);
  const dry = clamp01(1 - (c.rain_days - 4) / 14);
  const sun = clamp01((c.sunshine_h - 3) / 6);
  const wTemp = 1 - p.dry - p.sun;
  return 1 + 4 * (temp * wTemp + dry * p.dry + sun * p.sun);
}

export type MonthScore = {
  month: number;
  climate: number | null;
  quiet: number | null;
  conditions: number | null;
  score: number;
  researched: boolean;
  events: string[];
};

export function monthScores(w: WishItem, climate: ClimateMonth[] | undefined, signals: Signal[]): MonthScore[] {
  return Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const c = climate?.find((x) => x.month === month);
    const s = signals.find((x) => x.month === month);
    const cl = c ? avg(w.activities.map((a) => climateScore(c, a))) : null;
    const quiet = s?.quiet ?? null;
    const conditions = s?.conditions ?? null;

    // Unknowns stay neutral (3) rather than inventing a signal.
    let score = 0.5 * (cl ?? 3) + 0.25 * (quiet ?? 3) + 0.25 * (conditions ?? cl ?? 3);
    if (w.prefer_months.includes(month)) score += 0.75;
    if (w.avoid_months.includes(month)) score = Math.min(score, 1.5);
    return {
      month,
      climate: cl == null ? null : round(cl),
      quiet,
      conditions,
      score: round(Math.max(1, Math.min(5, score))),
      researched: Boolean(s),
      events: s?.events ?? [],
    };
  });
}

// Day-weighted average of month scores across [start, end).
export function windowScore(months: MonthScore[], start: Date, end: Date): number {
  let total = 0;
  let n = 0;
  for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
    total += months[d.getUTCMonth()].score;
    n += 1;
  }
  return n ? round(total / n) : 0;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const round = (x: number) => Math.round(x * 100) / 100;
