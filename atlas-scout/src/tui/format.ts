import type { MonthScore } from "../season.ts";

export const ESC = "\x1b[";
export const c = {
  dim: (s: string) => `${ESC}2m${s}${ESC}22m`,
  bold: (s: string) => `${ESC}1m${s}${ESC}22m`,
  inv: (s: string) => `${ESC}7m${s}${ESC}27m`,
  cyan: (s: string) => `${ESC}36m${s}${ESC}39m`,
  yellow: (s: string) => `${ESC}33m${s}${ESC}39m`,
  red: (s: string) => `${ESC}31m${s}${ESC}39m`,
  green: (s: string) => `${ESC}32m${s}${ESC}39m`,
};

export const MONTH_LETTERS = "J F M A M J J A S O N D";
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// 256-colour ramp from poor (red) to ideal (green).
const RAMP = [124, 166, 178, 148, 112, 34];

export function heatCell(score: number, mark = false): string {
  const i = Math.max(0, Math.min(RAMP.length - 1, Math.round(((score - 1) / 4) * (RAMP.length - 1))));
  return `${ESC}48;5;${RAMP[i]}m${ESC}38;5;16m${mark ? "*" : " "} ${ESC}0m`;
}

// One row of 12 coloured cells; the current month is marked.
export function heatRow(months: MonthScore[], now = new Date()): string {
  return months.map((m) => heatCell(m.score, m.month === now.getUTCMonth() + 1)).join("");
}

export const visible = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

export function pad(s: string, n: number, right = false): string {
  const len = visible(s).length;
  if (len > n) return truncate(s, n);
  return right ? " ".repeat(n - len) + s : s + " ".repeat(n - len);
}

export function truncate(s: string, n: number): string {
  const plain = visible(s);
  if (plain.length <= n) return s;
  return plain.slice(0, Math.max(0, n - 1)) + "…";
}

export function table(rows: string[][], widths: number[], rightCols: number[] = []): string[] {
  return rows.map((r) => r.map((cell, i) => pad(cell ?? "", widths[i], rightCols.includes(i))).join("  "));
}

export const fmtDate = (s: string) => {
  const d = new Date(`${s}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};

export const score = (x: number) => {
  const s = x.toFixed(1);
  return x >= 4 ? c.green(s) : x >= 3 ? c.yellow(s) : c.red(s);
};

export const eur = (x: number | null | undefined) => (x == null ? c.dim("n/a") : `€${Math.round(x)}`);
