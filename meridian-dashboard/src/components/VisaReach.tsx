import { useMemo } from "react";
import { data, VISA_COLOR, VISA_LABEL, visaRow, type VisaKind } from "../data.ts";
import "./Panels.css";
import { Card } from "./Card.tsx";

const KINDS: VisaKind[] = ["free", "arrival", "eta", "evisa", "required", "none"];
const DARK_TEXT: VisaKind[] = ["eta", "evisa"];
const EASY: VisaKind[] = ["free", "arrival", "eta"];

/** Easy-entry destination count for every passport, computed once. */
const ALL_EASY: { code: string; easy: number }[] = Object.keys(data.visa.matrix).map((code) => ({
  code,
  easy: visaRow(code).filter((r) => EASY.includes(r.kind)).length,
}));

export function VisaReach(props: { passport: string }) {
  const { passport } = props;
  const rows = useMemo(() => visaRow(passport), [passport]);
  const name = data.visa.names[passport] ?? passport;
  const nm = (d: string) => data.visa.names[d] ?? d;

  const counts = useMemo(() => {
    const c = {} as Record<VisaKind, number>;
    for (const k of KINDS) c[k] = rows.filter((r) => r.kind === k).length;
    return c;
  }, [rows]);
  const total = KINDS.reduce((s, k) => s + counts[k], 0);
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  const stays = rows
    .filter((r) => r.kind === "free" && r.days != null)
    .sort((a, b) => (b.days ?? 0) - (a.days ?? 0) || nm(a.dest).localeCompare(nm(b.dest)))
    .slice(0, 10);
  const needs = rows.filter((r) => r.kind === "required").sort((a, b) => nm(a.dest).localeCompare(nm(b.dest)));

  const easy = counts.free + counts.arrival + counts.eta;
  const rank = ALL_EASY.filter((p) => p.easy > easy).length + 1;
  const BIN = 10;
  const maxE = Math.max(...ALL_EASY.map((p) => p.easy));
  const nb = Math.floor(maxE / BIN) + 1;
  const bins = Array.from({ length: nb }, () => 0);
  for (const p of ALL_EASY) bins[Math.floor(p.easy / BIN)]++;
  const maxBin = Math.max(...bins);
  const mine = Math.floor(easy / BIN);
  const HW = 240;
  const HH = 70;
  const bw = HW / nb;

  return (
    <Card
      kicker="Visa reach"
      title={`Where a ${name} passport goes`}
      subtitle={`${total} destinations by entry rule. ${easy} need no visa in advance (visa free, on arrival or ETA).`}
      foot={`${data.visa.source}. Rules change; check the destination's official source before travel.`}
    >
      <div className="vz-bar" role="img" aria-label="Destinations by entry rule">
        {KINDS.map((k) =>
          counts[k] > 0 ? (
            <div key={k} className={DARK_TEXT.includes(k) ? "dk" : ""} style={{ flex: counts[k], background: VISA_COLOR[k] }} title={`${VISA_LABEL[k]}: ${counts[k]}`}>
              {pct(counts[k]) >= 6 ? `${pct(counts[k])}%` : ""}
            </div>
          ) : null,
        )}
      </div>
      <div className="vz-legend">
        {KINDS.map((k) => (
          <div key={k} style={{ ["--c" as string]: VISA_COLOR[k] }}>
            <div className="n">{counts[k]}<small>{pct(counts[k])}%</small></div>
            <div className="l">{VISA_LABEL[k]}</div>
          </div>
        ))}
      </div>

      <div className="vz-cols">
        <div>
          <div className="pn-h"><span>Longest visa-free stays</span><span>Days</span></div>
          <ul className="vz-stays">
            {stays.map((r) => (
              <li key={r.dest}><span>{nm(r.dest)}</span><span className="d">{r.days}</span></li>
            ))}
          </ul>
        </div>
        <div>
          <div className="pn-h"><span>Needs a visa</span><span>{needs.length}</span></div>
          <div className="vz-need">
            {needs.map((r) => (
              <span key={r.dest}>{nm(r.dest)}</span>
            ))}
          </div>
        </div>
        <div>
          <div className="pn-h"><span>Rank by easy entry</span></div>
          <div className="vz-rank">Rank {rank}<small>of {ALL_EASY.length}</small></div>
          <svg className="vz-hist" viewBox={`0 0 ${HW} ${HH + 16}`} role="img" aria-label={`Passports by number of easy-entry destinations. ${name} has ${easy}.`}>
            {bins.map((n, i) => {
              const h = maxBin ? (n / maxBin) * HH : 0;
              return <rect key={i} className={i === mine ? "me" : ""} x={i * bw + 1} y={HH - h} width={bw - 2} height={Math.max(h, n ? 1 : 0)} />;
            })}
            <line className="base" x1={0} x2={HW} y1={HH} y2={HH} />
            {bins.map((_, i) => (i % 3 === 0 ? <text key={i} x={i * bw} y={HH + 11}>{i * BIN}</text> : null))}
          </svg>
          <div className="vz-cap">{easy} easy-entry destinations. Bars count passports per band of {BIN}; the marked bar holds this one.</div>
        </div>
      </div>
    </Card>
  );
}
