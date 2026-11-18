import { useEffect, useMemo, useState } from "react";
import { BestThisMonth } from "./components/BestThisMonth.tsx";
import { EventsHazards } from "./components/EventsHazards.tsx";
import { LivabilityScatter } from "./components/LivabilityScatter.tsx";
import { SeasonHeatmap } from "./components/SeasonHeatmap.tsx";
import { VisaReach } from "./components/VisaReach.tsx";
import { WorldMap } from "./components/WorldMap.tsx";
import { data, isActive, MONTHS, MONTHS_LONG, visaRow } from "./data.ts";
import { comfortBand } from "./lib/scale.ts";

const PASSPORTS = Object.keys(data.visa.matrix).sort((a, b) => (data.visa.names[a] ?? a).localeCompare(data.visa.names[b] ?? b));

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
function save(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage unavailable: settings just are not remembered */
  }
}

export function App() {
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [passport, setPassport] = useState(() => load("md.passport", "ES"));
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    load("md.theme", window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
  );
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    save("md.theme", theme);
  }, [theme]);
  useEffect(() => save("md.passport", passport), [passport]);

  return (
    <div className="page">
      <header className="masthead">
        <div>
          <div className="kicker">
            Meridian <b>/</b> dashboard <b>/</b> {MONTHS_LONG[month]}
          </div>
          <h1>
            Where the world is <em>at its best</em>
          </h1>
          <p>
            Comfort by month for {data.cities.length} cities from {data.climateWindow} climate data, places to live, what is on, what to
            avoid, and how far your passport reaches.
          </p>
        </div>
        <div className="controls">
          <label className="field">
            <span className="kicker">Month</span>
            <div className="months" role="group" aria-label="Month">
              {MONTHS.map((m, i) => (
                <button key={m} aria-pressed={i === month} onClick={() => setMonth(i)} title={MONTHS_LONG[i]}>
                  {m[0]}
                </button>
              ))}
            </div>
          </label>
          <label className="field">
            <span className="kicker">Passport</span>
            <select className="select" value={passport} onChange={(e) => setPassport(e.target.value)}>
              {PASSPORTS.map((p) => (
                <option key={p} value={p}>
                  {data.visa.names[p] ?? p}
                </option>
              ))}
            </select>
          </label>
          <button className="iconbtn" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label="Toggle theme">
            {theme === "light" ? "Night" : "Paper"}
          </button>
        </div>
      </header>

      <div className="grid">
        <div className="span-12">
          <Kpis month={month} passport={passport} />
        </div>
        <div className="span-8">
          <WorldMap month={month} passport={passport} />
        </div>
        <div className="span-4">
          <BestThisMonth month={month} selected={selected} onSelect={setSelected} />
        </div>
        <div className="span-12">
          <SeasonHeatmap month={month} selected={selected} onSelect={setSelected} />
        </div>
        <div className="span-7">
          <LivabilityScatter />
        </div>
        <div className="span-5">
          <EventsHazards month={month} />
        </div>
        <div className="span-12">
          <VisaReach passport={passport} />
        </div>
      </div>

      <footer className="footer">
        <span>
          Data from <a href="https://github.com/kygura/meridian">kygura/meridian</a>: Open-Meteo climate {data.climateWindow}, UNDP, World
          Happiness Report, World Bank, Natural Earth, {data.visa.source}. Built {data.builtAt}.
        </span>
        <span>Comfort Index: temperature comfort minus rain, air and desert penalties, 0 to 100.</span>
      </footer>
    </div>
  );
}

function Kpis({ month, passport }: { month: number; passport: string }) {
  const k = useMemo(() => {
    const ranked = [...data.cities].sort((a, b) => b.months[month].s - a.months[month].s);
    const best = ranked[0];
    const good = data.cities.filter((c) => c.months[month].s >= 70).length;
    const events = data.events.filter((e) => e.month === month + 1).length;
    const hazards = data.phenomena.filter((p) => p.kind === "hazard" && isActive(p, month)).length;
    const conflicts = data.phenomena.filter((p) => p.kind === "conflict").length;
    const row = visaRow(passport).filter((r) => r.kind !== "own" && r.kind !== "unknown");
    const easy = row.filter((r) => r.kind === "free" || r.kind === "arrival" || r.kind === "eta").length;
    return { best, good, events, hazards, conflicts, easy, total: row.length };
  }, [month, passport]);
  return (
    <div className="kpis">
      <div className="kpi">
        <div className="kicker">Best in {MONTHS[month]}</div>
        <div className="value">{k.best.name}</div>
        <div className="note">
          {k.best.country}, comfort {k.best.months[month].s} ({comfortBand(k.best.months[month].s)}), {k.best.months[month].t} C
        </div>
      </div>
      <div className="kpi">
        <div className="kicker">Cities in good shape</div>
        <div className="value">
          {k.good}
          <small>/ {data.cities.length}</small>
        </div>
        <div className="note">comfort 70 or more this month</div>
      </div>
      <div className="kpi">
        <div className="kicker">Events this month</div>
        <div className="value">{k.events}</div>
        <div className="note">festivals, culture, sport, sky</div>
      </div>
      <div className="kpi">
        <div className="kicker">Hazards and conflicts</div>
        <div className="value">
          {k.hazards}
          <small>+ {k.conflicts}</small>
        </div>
        <div className="note">seasonal hazards active, standing conflicts</div>
      </div>
      <div className="kpi">
        <div className="kicker">Easy entry</div>
        <div className="value">
          {k.easy}
          <small>/ {k.total}</small>
        </div>
        <div className="note">visa free, on arrival or ETA for {data.visa.names[passport]}</div>
      </div>
    </div>
  );
}
