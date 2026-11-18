import { useMemo, useState } from "react";
import { data, type LiveCity } from "../data.ts";
import { fmtPop } from "../lib/scale.ts";
import { Card, Tip } from "./Card.tsx";
import "./Panels.css";

const W = 560;
const H = 520;
const M = { l: 34, r: 12, t: 12, b: 34 };
const PW = W - M.l - M.r;
const PH = H - M.t - M.b;
/** About 10% of the 600 cities fall in the best-of-both box at these thresholds. */
const QMIN = 80;
const BMIN = 55;
const TICKS = [0, 20, 40, 60, 80, 100];

const x = (b: number) => M.l + (b / 100) * PW;
const y = (q: number) => M.t + (1 - q / 100) * PH;

type Placed = { c: LiveCity; tx: number; ty: number; anchor: "start" | "end"; w: number };

export function LivabilityScatter(_props: Record<string, never>) {
  const [big, setBig] = useState(false);
  const [hover, setHover] = useState<{ c: LiveCity; at: { x: number; y: number } } | null>(null);

  const cities = useMemo(() => (big ? data.live.filter((c) => c.pop >= 1e6) : data.live), [big]);
  const maxPop = useMemo(() => Math.max(...data.live.map((c) => c.pop)), []);
  const r = (p: number) => 2 + 7 * Math.sqrt(p / maxPop);

  const ranked = useMemo(() => cities.slice().sort((a, b) => b.quality + b.beauty - (a.quality + a.beauty)), [cities]);
  const inBox = useMemo(() => cities.filter((c) => c.quality >= QMIN && c.beauty >= BMIN).length, [cities]);

  const labels = useMemo(() => {
    const placed: Placed[] = [];
    const boxes: { x0: number; x1: number; y0: number; y1: number }[] = [];
    for (const c of ranked.slice(0, 8)) {
      const w = c.name.length * 6.1;
      const rad = r(c.pop);
      const cx = x(c.beauty);
      const cy = y(c.quality);
      const opts: [number, number, "start" | "end"][] = [
        [cx + rad + 3, cy + 3, "start"],
        [cx - rad - 3, cy + 3, "end"],
        [cx + rad + 3, cy - 9, "start"],
        [cx - rad - 3, cy - 9, "end"],
        [cx + rad + 3, cy + 15, "start"],
        [cx - rad - 3, cy + 15, "end"],
        [cx + rad + 3, cy - 21, "start"],
        [cx - rad - 3, cy + 27, "end"],
        [cx + rad + 3, cy + 27, "start"],
        [cx - rad - 3, cy - 21, "end"],
        [cx + rad + 3, cy - 33, "start"],
        [cx - rad - 3, cy + 39, "end"],
        [cx + rad + 3, cy + 39, "start"],
        [cx - rad - 3, cy - 33, "end"],
      ];
      let pick = opts[0];
      for (const o of opts) {
        const x0 = o[2] === "start" ? o[0] : o[0] - w;
        const b = { x0, x1: x0 + w, y0: o[1] - 9, y1: o[1] + 3 };
        const inside = b.x0 >= 0 && b.x1 <= W;
        const hit = boxes.some((k) => b.x0 < k.x1 && b.x1 > k.x0 && b.y0 < k.y1 && b.y1 > k.y0);
        if (inside && !hit) {
          pick = o;
          break;
        }
      }
      const x0 = pick[2] === "start" ? pick[0] : pick[0] - w;
      boxes.push({ x0, x1: x0 + w, y0: pick[1] - 9, y1: pick[1] + 3 });
      placed.push({ c, tx: pick[0], ty: pick[1], anchor: pick[2], w });
    }
    return placed;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ranked, maxPop]);

  // Draw big dots first so small ones stay hoverable.
  const draw = useMemo(() => cities.slice().sort((a, b) => b.pop - a.pop), [cities]);
  const top6 = ranked.slice(0, 6);

  return (
    <Card
      kicker="Places to live"
      title="Quality of life against beauty"
      subtitle={`${cities.length} cities. Dot size follows population. ${inBox} sit in the shaded box.`}
      actions={
        <div className="seg" role="group" aria-label="Population filter">
          <button aria-pressed={!big} onClick={() => setBig(false)}>All</button>
          <button aria-pressed={big} onClick={() => setBig(true)}>Over 1M</button>
        </div>
      }
      foot="Quality combines HDI, happiness, safety and air. Beauty combines setting and character. Both are 0 to 100."
    >
      <svg className="sc-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Scatter of beauty against quality of life for cities">
        <rect className="sc-quad" x={x(BMIN)} y={y(100)} width={x(100) - x(BMIN)} height={y(QMIN) - y(100)} />
        <rect className="sc-quad-edge" x={x(BMIN)} y={y(100)} width={x(100) - x(BMIN)} height={y(QMIN) - y(100)} />
        {TICKS.map((t) => (
          <g key={t}>
            <line className="sc-grid" x1={x(t)} x2={x(t)} y1={y(0)} y2={y(100)} />
            <line className="sc-grid" x1={x(0)} x2={x(100)} y1={y(t)} y2={y(t)} />
            <text className="sc-tick" x={x(t)} y={y(0) + 14} textAnchor="middle">{t}</text>
            <text className="sc-tick" x={x(0) - 6} y={y(t) + 3} textAnchor="end">{t}</text>
          </g>
        ))}
        <line className="sc-axis" x1={x(0)} x2={x(100)} y1={y(0)} y2={y(0)} />
        <line className="sc-axis" x1={x(0)} x2={x(0)} y1={y(0)} y2={y(100)} />
        <text className="sc-axlabel" x={x(50)} y={H - 4} textAnchor="middle">Beauty</text>
        <text className="sc-axlabel" transform={`translate(10 ${y(50)}) rotate(-90)`} textAnchor="middle">Quality of life</text>
        <text className="sc-quad-label" x={x(BMIN) + 6} y={y(100) + 14}>Best of both</text>
        {draw.map((c) => (
          <circle
            key={c.id}
            className={`sc-dot${hover?.c.id === c.id ? " on" : ""}`}
            cx={x(c.beauty)}
            cy={y(c.quality)}
            r={r(c.pop)}
            onPointerMove={(e) => setHover({ c, at: { x: e.clientX, y: e.clientY } })}
            onPointerLeave={() => setHover(null)}
          />
        ))}
        {labels.map((p) => (
          <text key={p.c.id} className="sc-lab" x={p.tx} y={p.ty} textAnchor={p.anchor}>{p.c.name}</text>
        ))}
      </svg>

      <div className="sc-list">
        <div className="pn-h"><span>Best of both</span><span>Quality + beauty</span></div>
        <ol className="rank">
          {top6.map((c, i) => (
            <li key={c.id}>
              <span className="n">{i + 1}</span>
              <span className="nm">{c.name}<small>{c.country}</small></span>
              <span className="v"><i>Q</i>{c.quality}</span>
              <span className="v"><i>B</i>{c.beauty}</span>
            </li>
          ))}
        </ol>
      </div>

      <Tip at={hover?.at ?? null}>
        {hover && (
          <>
            <strong>{hover.c.name}</strong>
            <span className="mono">{hover.c.country} · pop {fmtPop(hover.c.pop)}</span>
            <div className="tip-rows">
              <span>Quality</span><span>{hover.c.quality}</span>
              <span>HDI</span><span>{hover.c.q.hdi}</span>
              <span>Happiness</span><span>{hover.c.q.happiness}</span>
              <span>Safety</span><span>{hover.c.q.safety}</span>
              <span>Air</span><span>{hover.c.q.air}</span>
              <span>Beauty</span><span>{hover.c.beauty}</span>
              <span>Setting</span><span>{hover.c.b.setting}</span>
              <span>Character</span><span>{hover.c.b.character}</span>
            </div>
          </>
        )}
      </Tip>
    </Card>
  );
}
