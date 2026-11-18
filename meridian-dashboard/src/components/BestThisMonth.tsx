import { useMemo, useState } from "react";
import { data, MONTHS_LONG } from "../data.ts";
import { comfortColor, comfortInk } from "../lib/scale.ts";
import { Card } from "./Card.tsx";
import "./Season.css";

type Mode = "best" | "rising";

export function BestThisMonth(props: { month: number; selected: string | null; onSelect: (id: string) => void }) {
  const { month, selected, onSelect } = props;
  const [mode, setMode] = useState<Mode>("best");
  const prev = (month + 11) % 12;

  const rows = useMemo(() => {
    const list = data.cities.map((c) => {
      const scores = c.months.map((m) => m.s);
      const bestIdx = scores.indexOf(Math.max(...scores));
      return { c, score: scores[month], delta: scores[month] - scores[prev], bestIdx, scores };
    });
    list.sort((a, b) => (mode === "best" ? b.score - a.score || b.delta - a.delta : b.delta - a.delta || b.score - a.score));
    return list.slice(0, 10);
  }, [month, prev, mode]);

  const actions = (
    <div className="seg" role="group" aria-label="Ranking">
      <button type="button" aria-pressed={mode === "best"} onClick={() => setMode("best")}>Best</button>
      <button type="button" aria-pressed={mode === "rising"} onClick={() => setMode("rising")}>Rising</button>
    </div>
  );

  return (
    <Card
      kicker="Ranking"
      title={mode === "best" ? `Best in ${MONTHS_LONG[month]}` : `Rising into ${MONTHS_LONG[month]}`}
      subtitle={
        mode === "best"
          ? "Top 10 of 120 cities by Comfort Index for the selected month."
          : `Top 10 by score gain from ${MONTHS_LONG[prev]} to ${MONTHS_LONG[month]}.`
      }
      actions={actions}
      foot="Comfort Index runs 0 to 100 and combines temperature, rain and air quality. 100 is a mild, dry, clean-air month."
    >
      <ol className="best-list">
        {rows.map(({ c, score, delta, bestIdx, scores }, i) => (
          <li key={c.id}>
            <button
              type="button"
              className="best-row"
              aria-pressed={selected === c.id}
              onClick={() => onSelect(c.id)}
              title={`${c.name}, ${c.country}`}
            >
              <span className="best-rank">{String(i + 1).padStart(2, "0")}</span>
              <span className="best-name">
                <strong>{c.name}</strong>
                <span>{c.country}</span>
              </span>
              <span className="best-strip" aria-hidden="true">
                {scores.map((s, m) => (
                  <i
                    key={m}
                    className={`${m === month ? "now" : ""} ${m === bestIdx ? "top" : ""}`}
                    style={{ background: comfortColor(s) }}
                  />
                ))}
              </span>
              <span className="best-score">
                <span className="best-badge" style={{ background: comfortColor(score), color: comfortInk(score) }}>
                  {Math.round(score)}
                </span>
                {mode === "rising" && (
                  <span className="best-delta">{delta >= 0 ? "+" : "-"}{Math.abs(Math.round(delta))}</span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <div className="best-legend">
        <span><i className="sw" /> Selected month</span>
        <span><i className="dot" /> Best month of year</span>
      </div>
    </Card>
  );
}
