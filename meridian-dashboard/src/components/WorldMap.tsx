import { memo, useMemo, useState } from "react";
import { geoGraticule10, geoNaturalEarth1, geoPath } from "d3-geo";
import { Card, Tip } from "./Card.tsx";
import { comfortBand, comfortColor, comfortInk } from "../lib/scale.ts";
import { MONTHS, MONTHS_LONG, VISA_COLOR, VISA_LABEL, data, isActive, visaRow } from "../data.ts";
import type { Phenomenon, SeasonCity, VisaKind } from "../data.ts";
import "./WorldMap.css";

const W = 960;
const H = 500;

// Geometry is static: compute projection and path strings once at module load.
const projection = geoNaturalEarth1().fitExtent(
  [
    [4, 4],
    [W - 4, H - 4],
  ],
  { type: "Sphere" },
);
const pathGen = geoPath(projection);
const SPHERE_D = pathGen({ type: "Sphere" }) ?? "";
const GRAT_D = pathGen(geoGraticule10()) ?? "";
const COUNTRY_PATHS = data.countries.features.map((f) => ({
  iso3: f.properties.iso3,
  name: f.properties.name,
  d: pathGen(f as never) ?? "",
}));
const project = (lng: number, lat: number): [number, number] => projection([lng, lat]) ?? [0, 0];

const CITIES_BY_ISO3 = new Map<string, SeasonCity[]>();
for (const c of data.cities) {
  if (!c.iso3) continue;
  const list = CITIES_BY_ISO3.get(c.iso3) ?? [];
  list.push(c);
  CITIES_BY_ISO3.set(c.iso3, list);
}
const MAX_POP = Math.max(...data.cities.map((c) => c.pop), 1);
const VISA_ORDER: VisaKind[] = ["own", "free", "arrival", "eta", "evisa", "required", "none", "unknown"];
const RAMP_STEPS = [0, 17, 33, 50, 67, 83, 100];

type Mode = "comfort" | "visa";
type Hover =
  | { t: "country"; iso3: string; name: string }
  | { t: "city"; city: SeasonCity }
  | { t: "ph"; ph: Phenomenon };

const CountryPaths = memo(function CountryPaths(props: {
  fills: Map<string, string>;
  onHover: (h: Hover | null, e?: React.PointerEvent) => void;
}) {
  return (
    <g>
      {COUNTRY_PATHS.map((c, i) => (
        <path
          key={c.iso3 + i}
          className="wm-country"
          d={c.d}
          style={{ fill: props.fills.get(c.iso3) ?? "var(--land)" }}
          onPointerMove={(e) => props.onHover({ t: "country", iso3: c.iso3, name: c.name }, e)}
          onPointerLeave={() => props.onHover(null)}
        />
      ))}
    </g>
  );
});

export function WorldMap(props: { month: number; passport: string }) {
  const { month, passport } = props;
  const passportName = data.visa.names[passport] ?? passport;
  const [mode, setMode] = useState<Mode>("comfort");
  const [hover, setHover] = useState<Hover | null>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);

  const onHover = (h: Hover | null, e?: React.PointerEvent) => {
    setHover(h);
    setAt(h && e ? { x: e.clientX, y: e.clientY } : null);
  };

  // Mean comfort per country for the month.
  const meanByIso3 = useMemo(() => {
    const m = new Map<string, number>();
    for (const [iso3, list] of CITIES_BY_ISO3) m.set(iso3, list.reduce((a, c) => a + c.months[month].s, 0) / list.length);
    return m;
  }, [month]);

  // Visa lookups for the selected passport.
  const visa = useMemo(() => {
    const byIso3 = new Map<string, { kind: VisaKind; days: number | null }>();
    const counts = new Map<VisaKind, number>();
    const ownIso3 = data.visa.iso3[passport] ?? null;
    for (const r of visaRow(passport)) {
      const iso3 = data.visa.iso3[r.dest];
      const kind: VisaKind = r.dest === passport ? "own" : r.kind;
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
      if (iso3) byIso3.set(iso3, { kind, days: r.days });
    }
    if (ownIso3) byIso3.set(ownIso3, { kind: "own", days: null });
    return { byIso3, counts };
  }, [passport]);

  const fills = useMemo(() => {
    const m = new Map<string, string>();
    if (mode === "comfort") for (const [iso3, v] of meanByIso3) m.set(iso3, comfortColor(v));
    else for (const [iso3, v] of visa.byIso3) m.set(iso3, VISA_COLOR[v.kind]);
    return m;
  }, [mode, meanByIso3, visa]);

  const cities = useMemo(
    () =>
      data.cities.map((c) => {
        const [x, y] = project(c.lng, c.lat);
        return { c, x, y, s: c.months[month].s, r: 3 + 2 * Math.sqrt(c.pop / MAX_POP) };
      }),
    [month],
  );
  const topIds = useMemo(() => new Set([...cities].sort((a, b) => b.s - a.s).slice(0, 5).map((d) => d.c.id)), [cities]);

  const marks = useMemo(
    () =>
      data.phenomena
        .filter((p) => isActive(p, month))
        .map((p) => ({ p, xy: project(p.lng, p.lat) })),
    [month],
  );

  const monthName = MONTHS_LONG[month];
  const sub =
    mode === "comfort" ? (
      <>Mean comfort of tracked cities in {monthName}. Dots are cities; red marks are conflicts, rings are seasonal hazards.</>
    ) : (
      <>Entry requirement for a passport from {passportName}, by destination. Red marks are conflicts, rings are seasonal hazards in {monthName}.</>
    );

  const tipBody = () => {
    if (!hover) return null;
    if (hover.t === "city") {
      const c = hover.city;
      const m = c.months[month];
      return (
        <>
          <strong>{c.name}</strong>
          <div className="wm-tip-row"><span>{c.country}</span><span>{MONTHS[month]}</span></div>
          <div className="wm-tip-row"><span>Comfort</span><b>{Math.round(m.s)} ({comfortBand(m.s)})</b></div>
          <div className="wm-tip-row"><span>Temp</span><b>{m.t.toFixed(1)} C</b></div>
          <div className="wm-tip-row"><span>Rain</span><b>{Math.round(m.p)} mm</b></div>
        </>
      );
    }
    if (hover.t === "ph") {
      const p = hover.ph;
      return (
        <>
          <strong>{p.label}</strong>
          <div className="wm-tip-row"><span>{p.kind === "conflict" ? "Conflict" : "Seasonal hazard"}</span><b>{p.type}</b></div>
          <div className="wm-tip-row"><span>Severity</span><b>{p.severity} of 3</b></div>
          <div className="wm-tip-row">
            <span>Months</span>
            <b>{p.months ? p.months.map((m) => MONTHS[m - 1]).join(", ") : "Ongoing"}</b>
          </div>
          {p.peak && <div className="wm-tip-row"><span>Peak</span><b>{p.peak.map((m) => MONTHS[m - 1]).join(", ")}</b></div>}
        </>
      );
    }
    if (mode === "visa") {
      const v = visa.byIso3.get(hover.iso3);
      return (
        <>
          <strong>{hover.name}</strong>
          <div className="wm-tip-row">
            <span>{passportName} passport</span>
            <b>{v ? `${VISA_LABEL[v.kind]}${v.days ? `, ${v.days} days` : ""}` : VISA_LABEL.unknown}</b>
          </div>
        </>
      );
    }
    const list = CITIES_BY_ISO3.get(hover.iso3);
    const mean = meanByIso3.get(hover.iso3);
    return (
      <>
        <strong>{hover.name}</strong>
        {list && mean !== undefined ? (
          <>
            <div className="wm-tip-row"><span>Mean comfort</span><b>{Math.round(mean)} ({comfortBand(mean)})</b></div>
            {list.map((c) => (
              <div className="wm-tip-row" key={c.id}><span>{c.name}</span><b>{Math.round(c.months[month].s)}</b></div>
            ))}
          </>
        ) : (
          <div className="wm-tip-row"><span>No tracked cities</span></div>
        )}
      </>
    );
  };

  return (
    <Card
      kicker="World map"
      title={mode === "comfort" ? "Where to be in " + monthName : "Where a passport from " + passportName + " goes"}
      subtitle={sub}
      actions={
        <div className="seg" role="group" aria-label="Map mode">
          <button type="button" aria-pressed={mode === "comfort"} onClick={() => setMode("comfort")}>Comfort</button>
          <button type="button" aria-pressed={mode === "visa"} onClick={() => setMode("visa")}>Visa</button>
        </div>
      }
      foot={<>Comfort Index from Open-Meteo 2015 to 2024. Hazards and conflicts as of {data.phenomenaAsOf}.</>}
    >
      <svg
        className="wm-svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={
          mode === "comfort"
            ? `World map of mean comfort for tracked cities in ${monthName}, with conflict and seasonal hazard markers`
            : `World map of visa requirements for a passport from ${passportName}, with conflict and seasonal hazard markers`
        }
      >
        <path d={SPHERE_D} style={{ fill: "var(--ocean)" }} />
        <path d={GRAT_D} className="wm-grat" />
        <CountryPaths fills={fills} onHover={onHover} />
        <path d={SPHERE_D} className="wm-outline" />

        {mode === "comfort" &&
          cities.map(({ c, x, y, s, r }) => (
            <circle
              key={c.id}
              className="wm-city"
              cx={x}
              cy={y}
              r={r}
              style={{ fill: comfortColor(s) }}
              onPointerMove={(e) => onHover({ t: "city", city: c }, e)}
              onPointerLeave={() => onHover(null)}
            />
          ))}
        {mode === "comfort" &&
          cities
            .filter((d) => topIds.has(d.c.id))
            .map(({ c, x, y, r }) => (
              <text key={c.id} className="wm-label" x={x + r + 2} y={y - r}>{c.name}</text>
            ))}

        {marks.map(({ p, xy: [x, y] }) =>
          p.kind === "conflict" ? (
            <polygon
              key={p.id}
              className="wm-conflict"
              points={`${x},${y - 3 - p.severity} ${x + 3 + p.severity},${y} ${x},${y + 3 + p.severity} ${x - 3 - p.severity},${y}`}
              onPointerMove={(e) => onHover({ t: "ph", ph: p }, e)}
              onPointerLeave={() => onHover(null)}
            />
          ) : (
            <circle
              key={p.id}
              className={"wm-hazard" + (p.peak?.includes(month + 1) ? " peak" : "")}
              cx={x}
              cy={y}
              r={3 + p.severity * 2.5}
              onPointerMove={(e) => onHover({ t: "ph", ph: p }, e)}
              onPointerLeave={() => onHover(null)}
            />
          ),
        )}
      </svg>

      <div className="wm-legend">
        {mode === "comfort" ? (
          <div className="wm-ramp">
            <span>0</span>
            <span className="wm-ramp-bar" role="img" aria-label="Comfort scale from 0 to 100">
              {RAMP_STEPS.map((v) => (
                <i key={v} style={{ background: comfortColor(v), color: comfortInk(v) }} />
              ))}
            </span>
            <span>100</span>
            <span>Comfort Index</span>
          </div>
        ) : (
          VISA_ORDER.filter((k) => visa.counts.get(k)).map((k) => (
            <span className="wm-key" key={k}>
              <span className="wm-swatch" style={{ background: VISA_COLOR[k] }} />
              {VISA_LABEL[k]} {visa.counts.get(k)}
            </span>
          ))
        )}
        <span className="wm-key">
          <svg viewBox="-7 -7 14 14" aria-hidden="true"><polygon className="wm-conflict" points="0,-6 6,0 0,6 -6,0" /></svg>
          Conflict
        </span>
        <span className="wm-key">
          <svg viewBox="-7 -7 14 14" aria-hidden="true"><circle className="wm-hazard" r="5" /></svg>
          Hazard
        </span>
        <span className="wm-key">
          <svg viewBox="-7 -7 14 14" aria-hidden="true"><circle className="wm-hazard peak" r="5" /></svg>
          Hazard in peak month
        </span>
      </div>

      <Tip at={at}>{tipBody()}</Tip>
    </Card>
  );
}
