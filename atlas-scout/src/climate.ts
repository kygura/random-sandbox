import type { ClimateMonth } from "./types.ts";

type Daily = {
  time: string[];
  temperature_2m_max: (number | null)[];
  temperature_2m_min: (number | null)[];
  precipitation_sum: (number | null)[];
  sunshine_duration: (number | null)[];
};

const YEARS = 5;

// Monthly normals from the last five full years of ERA5 reanalysis
// (Open-Meteo archive API, no key). One request per destination.
export async function fetchClimate(lat: number, lon: number, fetcher: typeof fetch = fetch, now = new Date()): Promise<ClimateMonth[]> {
  const endYear = now.getUTCFullYear() - 1;
  const start = `${endYear - YEARS + 1}-01-01`;
  const end = `${endYear}-12-31`;
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}` +
    `&start_date=${start}&end_date=${end}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,sunshine_duration&timezone=UTC`;
  const res = await fetcher(url);
  if (!res.ok) throw new Error(`climate ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { daily: Daily };
  return monthlyNormals(body.daily);
}

export function monthlyNormals(d: Daily): ClimateMonth[] {
  const acc = Array.from({ length: 12 }, () => ({ tmax: 0, tmin: 0, precip: 0, wet: 0, sun: 0, n: 0, years: new Set<string>() }));
  d.time.forEach((t, i) => {
    const tmax = d.temperature_2m_max[i];
    const tmin = d.temperature_2m_min[i];
    if (tmax == null || tmin == null) return;
    const m = Number(t.slice(5, 7)) - 1;
    const p = d.precipitation_sum[i] ?? 0;
    const a = acc[m];
    a.tmax += tmax;
    a.tmin += tmin;
    a.precip += p;
    a.wet += p >= 1 ? 1 : 0;
    a.sun += (d.sunshine_duration[i] ?? 0) / 3600;
    a.n += 1;
    a.years.add(t.slice(0, 4));
  });
  return acc.map((a, i) => {
    const years = Math.max(1, a.years.size);
    const n = Math.max(1, a.n);
    return {
      month: i + 1,
      tmax: round(a.tmax / n),
      tmin: round(a.tmin / n),
      precip_mm: round(a.precip / years),
      rain_days: round(a.wet / years),
      sunshine_h: round(a.sun / n),
    };
  });
}

const round = (x: number) => Math.round(x * 10) / 10;
