// Colour scales shared by every panel. Values come from Meridian's design tokens
// (styles/tokens.css); components use these helpers instead of picking colours.

/** Warm comfort ramp, 7 steps (--ramp-0 pale straw .. --ramp-6 deep sienna). */
const RAMP = ["--ramp-0", "--ramp-1", "--ramp-2", "--ramp-3", "--ramp-4", "--ramp-5", "--ramp-6"];

/** Comfort Index 0..100 -> CSS colour. */
export function comfortColor(score: number): string {
  const i = Math.max(0, Math.min(6, Math.round((score / 100) * 6)));
  return `var(${RAMP[i]})`;
}
/** Text colour that reads on comfortColor(score). */
export function comfortInk(score: number): string {
  return Math.round((score / 100) * 6) >= 4 ? "var(--ramp-text-light)" : "var(--ramp-text-dark)";
}
/** Mean temperature C -> CSS colour on the cold..hot ramp. */
export function tempColor(c: number): string {
  const steps = [-5, 5, 12, 18, 23, 28];
  const i = steps.findIndex((s) => c < s);
  return `var(--temp-${i === -1 ? 6 : i})`;
}
/** Short band label for a comfort score. */
export function comfortBand(score: number): string {
  if (score >= 85) return "ideal";
  if (score >= 70) return "good";
  if (score >= 50) return "fair";
  if (score >= 25) return "poor";
  return "harsh";
}
export const fmtPop = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));
