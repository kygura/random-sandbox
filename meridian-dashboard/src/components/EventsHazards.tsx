import { data, isActive, MONTHS, MONTHS_LONG, type TravelEvent } from "../data.ts";
import "./Panels.css";
import { Card } from "./Card.tsx";

const KIND_LABEL: Record<TravelEvent["kind"], string> = { festival: "Festival", culture: "Culture", sport: "Sport", eclipse: "Eclipse", sky: "Sky", nature: "Nature" };

function dayOf(e: TravelEvent): string | null {
  if (!e.date) return null;
  const d = Number(e.date.slice(8, 10));
  return Number.isFinite(d) && d > 0 ? String(d) : null;
}

function Sev({ n }: { n: number }) {
  return (
    <span className="sev" role="img" aria-label={`Severity ${n} of 3`}>
      {[1, 2, 3].map((i) => (
        <i key={i} className={i <= n ? "f" : ""} />
      ))}
    </span>
  );
}

export function EventsHazards(props: { month: number }) {
  const m = props.month;
  const events = data.events.filter((e) => e.month === m + 1).sort((a, b) => (a.date ?? "z").localeCompare(b.date ?? "z") || a.title.localeCompare(b.title));
  let next: { m0: number; count: number } | null = null;
  if (events.length === 0) {
    for (let k = 1; k <= 12; k++) {
      const m0 = (m + k) % 12;
      const count = data.events.filter((e) => e.month === m0 + 1).length;
      if (count) {
        next = { m0, count };
        break;
      }
    }
  }
  const active = data.phenomena.filter((p) => p.kind === "hazard" && isActive(p, m)).sort((a, b) => b.severity - a.severity || a.label.localeCompare(b.label));
  const conflicts = data.phenomena.filter((p) => p.kind === "conflict").sort((a, b) => b.severity - a.severity || a.label.localeCompare(b.label));

  return (
    <Card
      kicker="What is on"
      title={`${MONTHS_LONG[m]}: events and hazards`}
      foot={`Events from Meridian's live feed, fetched ${data.eventsAsOf.slice(0, 10)}. Hazards and conflicts as of ${data.phenomenaAsOf}. Seasonal hazards are recurring risks, not forecasts.`}
    >
      <section className="eh-sec">
        <div className="pn-h"><span>On this month</span><span>{events.length}</span></div>
        {events.length > 0 ? (
          <ul className="eh-list">
            {events.map((e) => {
              const day = dayOf(e);
              return (
                <li key={e.id}>
                  <div className="badge">
                    <b>{e.recurring || !day ? MONTHS[e.month - 1] : day}</b>
                    <span>{e.recurring || !day ? "yearly" : MONTHS[e.month - 1]}</span>
                  </div>
                  <div>
                    <div className="eh-title">{e.title}</div>
                    <div className="eh-meta">
                      <span className="tag kind">{KIND_LABEL[e.kind]}</span>
                      {e.cities.slice(0, 4).join(", ")}
                      {e.cities.length > 4 ? ` and ${e.cities.length - 4} more` : ""}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="eh-empty">
            No listed events in {MONTHS_LONG[m]}.{" "}
            {next && (
              <>
                Next is <strong>{MONTHS_LONG[next.m0]}</strong> with {next.count} {next.count === 1 ? "event" : "events"}.
              </>
            )}
          </div>
        )}
      </section>

      <section className="eh-sec">
        <div className="pn-h"><span>Watch out</span><span>{active.length} seasonal</span></div>
        {active.length > 0 ? (
          <ul className="eh-list">
            {active.map((p) => {
              const peak = !!p.peak?.includes(m + 1);
              return (
                <li key={p.id}>
                  <div className="badge" style={{ padding: "6px 0" }}>
                    <Sev n={p.severity} />
                  </div>
                  <div>
                    <div className="eh-title">
                      {p.label}
                    </div>
                    <div className="eh-meta">
                      {peak && <span className="tag peak">Peak</span>}
                      <span className="tag">{p.type}</span>
                      {p.country ?? ""}
                    </div>
                    <div className="strip" role="img" aria-label={`Active months: ${(p.months ?? []).map((k) => MONTHS[k - 1]).join(", ")}`}>
                      {MONTHS.map((mm, i) => {
                        const on = !!p.months?.includes(i + 1);
                        const pk = !!p.peak?.includes(i + 1);
                        return <i key={mm} title={mm} className={`${pk ? "pk" : on ? "on" : ""}${i === m ? " now" : ""}`} />;
                      })}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="eh-empty">No seasonal hazards are listed for {MONTHS_LONG[m]}.</div>
        )}

        <div className="pn-h" style={{ marginTop: "var(--space-4)" }}><span>Standing conflicts</span><span>{conflicts.length}</span></div>
        <ul className="eh-conf">
          {conflicts.map((p) => (
            <li key={p.id}>
              <span>
                {p.label}
                <span className="t">{p.type}</span>
              </span>
              <Sev n={p.severity} />
            </li>
          ))}
        </ul>
      </section>
    </Card>
  );
}
