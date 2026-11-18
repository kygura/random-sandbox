import { useEffect, useMemo, useRef, useState } from "react";
import { data, MONTHS, MONTHS_LONG } from "../data.ts";
import { comfortBand, comfortColor, comfortInk } from "../lib/scale.ts";
import { Card, Tip } from "./Card.tsx";
import "./Season.css";

type Sort = "month" | "year" | "az";
type Region = "All" | "Europe" | "Asia" | "Americas" | "Africa" | "Oceania";
const REGIONS: Region[] = ["All", "Europe", "Asia", "Americas", "Africa", "Oceania"];

const CONTINENT: Record<string, Exclude<Region, "All">> = {};
const add = (r: Exclude<Region, "All">, names: string) => names.split("|").forEach((n) => (CONTINENT[n] = r));
add("Europe", "Albania|Austria|Belarus|Belgium|Bosnia And Herzegovina|Croatia|Cyprus|Estonia|Finland|France|Germany|Gibraltar|Greece|Hungary|Ireland|Italy|Latvia|Lithuania|Macedonia|Moldova|Montenegro|Netherlands|Norway|Poland|Portugal|Romania|Russia|Serbia|Slovakia|Spain|United Kingdom");
add("Asia", "Afghanistan|Armenia|Azerbaijan|Bahrain|Bangladesh|Burma|China|Georgia|Indonesia|Iran|Iraq|Israel|Japan|Jordan|Korea, North|Korea, South|Kyrgyzstan|Laos|Lebanon|Maldives|Nepal|Oman|Pakistan|Philippines|Saudi Arabia|Singapore|Sri Lanka|Syria|Taiwan|Tajikistan|Thailand|Timor-Leste|Turkmenistan|United Arab Emirates|Uzbekistan|Vietnam");
add("Americas", "Argentina|Barbados|Bolivia|Brazil|Canada|Chile|Cuba|Curaçao|Dominican Republic|Ecuador|Haiti|Honduras|Jamaica|Mexico|Nicaragua|Paraguay|Peru|Uruguay|Venezuela");
add("Africa", "Algeria|Angola|Botswana|Central African Republic|Comoros|Côte D’Ivoire|Djibouti|Egypt|Equatorial Guinea|Eritrea|Ethiopia|Gabon|Ghana|Guinea-Bissau|Kenya|Liberia|Libya|Madagascar|Malawi|Mali|Mauritania|Mauritius|Morocco|Niger|Nigeria|Rwanda|Senegal|Sierra Leone|Somalia|Sudan|Tanzania|Tunisia|Zimbabwe");
add("Oceania", "Fiji");

const regionOf = (country: string): Region | "Other" => CONTINENT[country] ?? "Other";
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const DEFAULT_ROWS = 24;

type Hover = { id: string; m: number; x: number; y: number } | null;

export function SeasonHeatmap(props: { month: number; selected: string | null; onSelect: (id: string) => void }) {
  const { month, selected, onSelect } = props;
  const [sort, setSort] = useState<Sort>("month");
  const [region, setRegion] = useState<Region>("All");
  const [showAll, setShowAll] = useState(false);
  const [hover, setHover] = useState<Hover>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const list = useMemo(() => {
    const rows = data.cities
      .filter((c) => region === "All" || regionOf(c.country) === region)
      .map((c) => {
        const scores = c.months.map((m) => m.s);
        const order = scores.map((s, i) => [s, i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
        const best = order.slice(0, 3).map(([, i]) => i).sort((a, b) => a - b).map((i) => MONTHS[i]).join(", ");
        return { c, scores, year: mean(scores), best };
      });
    rows.sort((a, b) =>
      sort === "az" ? a.c.name.localeCompare(b.c.name) : sort === "year" ? b.year - a.year : b.scores[month] - a.scores[month] || b.year - a.year,
    );
    return rows;
  }, [sort, region, month]);

  const visible = showAll ? list : list.slice(0, DEFAULT_ROWS);

  // Bring the selected row into view when the selection changes, if it is in the list.
  useEffect(() => {
    if (!selected) return;
    const box = scrollRef.current;
    const el = box?.querySelector<HTMLElement>(`[data-city="${CSS.escape(selected)}"]`);
    if (!box || !el) return;
    const head = box.querySelector<HTMLElement>(".hm-head")?.offsetHeight ?? 0;
    const top = el.offsetTop - head - 8;
    const bottom = el.offsetTop + el.offsetHeight;
    if (el.offsetTop - head < box.scrollTop || bottom > box.scrollTop + box.clientHeight) box.scrollTo({ top, behavior: "smooth" });
  }, [selected, sort, region, showAll, month]);

  const tipCity = hover ? data.cities.find((c) => c.id === hover.id) : null;
  const tipM = tipCity && hover ? tipCity.months[hover.m] : null;

  const actions = (
    <div className="hm-controls">
      <div className="seg" role="group" aria-label="Sort cities">
        <button type="button" aria-pressed={sort === "month"} onClick={() => setSort("month")}>This month</button>
        <button type="button" aria-pressed={sort === "year"} onClick={() => setSort("year")}>Year round</button>
        <button type="button" aria-pressed={sort === "az"} onClick={() => setSort("az")}>A-Z</button>
      </div>
      <div className="seg" role="group" aria-label="Region">
        {REGIONS.map((r) => (
          <button key={r} type="button" aria-pressed={region === r} onClick={() => setRegion(r)}>{r}</button>
        ))}
      </div>
    </div>
  );

  return (
    <Card
      kicker="Seasons"
      title="Comfort by city and month"
      subtitle={`Comfort Index by month, ${data.climateWindow} normals. 100 is a mild, dry, clean-air month.`}
      actions={actions}
      foot={`Cells show the monthly score. Sorted by ${sort === "month" ? MONTHS_LONG[month] + " score" : sort === "year" ? "mean of all 12 months" : "city name"}. Best months are the three highest scores of the year.`}
    >
      <div className="hm-scroll" ref={scrollRef} onMouseLeave={() => setHover(null)}>
        <div className="hm-grid" role="table" aria-label="Comfort Index by city and month">
          <div className="hm-head" role="row">
            <div className="hm-label" role="columnheader">City</div>
            {MONTHS.map((m, i) => (
              <div key={m} className={i === month ? "cur" : ""} role="columnheader" title={MONTHS_LONG[i]}>{m[0]}</div>
            ))}
            <div className="hm-best" role="columnheader">Best months</div>
          </div>
          {visible.map(({ c, scores, best }) => (
            <div
              key={c.id}
              data-city={c.id}
              role="row"
              tabIndex={0}
              className={`hm-row ${selected === c.id ? "sel" : ""}`}
              onClick={() => onSelect(c.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(c.id);
                }
              }}
            >
              <div className="hm-label" role="rowheader">
                <strong>{c.name}</strong>
                <span>{c.country}</span>
              </div>
              {scores.map((s, m) => (
                <div
                  key={m}
                  role="cell"
                  className={`hm-cell ${m === month ? "cur" : ""}`}
                  style={{ background: comfortColor(s), color: comfortInk(s) }}
                  onMouseMove={(e) => setHover({ id: c.id, m, x: e.clientX, y: e.clientY })}
                >
                  {Math.round(s)}
                </div>
              ))}
              <div className="hm-best" role="cell">{best}</div>
            </div>
          ))}
          {visible.length === 0 && <div className="hm-empty">No cities in this region.</div>}
        </div>
      </div>
      {list.length > DEFAULT_ROWS && (
        <div className="hm-more">
          <button type="button" onClick={() => setShowAll((v) => !v)}>
            {showAll ? `Show top ${DEFAULT_ROWS}` : `Show all ${list.length}`}
          </button>
          <span>Showing {visible.length} of {list.length}</span>
        </div>
      )}
      <Tip at={hover && tipCity && tipM ? { x: hover.x, y: hover.y } : null}>
        {tipCity && tipM && hover && (
          <>
            <strong>{tipCity.name}</strong>
            <div className="hm-tip-row">
              {tipCity.country}
              <br />
              {MONTHS_LONG[hover.m]}: comfort {Math.round(tipM.s)} ({comfortBand(tipM.s)})
              <br />
              {tipM.t.toFixed(1)} C, {Math.round(tipM.p)} mm rain
              {tipM.a != null && (
                <>
                  <br />
                  PM2.5 {Math.round(tipM.a)} ug/m3
                </>
              )}
            </div>
          </>
        )}
      </Tip>
    </Card>
  );
}
