// Typed access to src/data/dashboard.json (built by scripts/build-data.ts from kygura/meridian).
import raw from "./data/dashboard.json";

/** One month of a tracked city. s = Meridian Comfort Index 0..100, t = mean temp C, p = rain mm, a = PM2.5 ug/m3. */
export type CityMonth = { s: number; t: number; p: number; a?: number };
export type SeasonCity = {
  id: string;
  name: string;
  country: string;
  iso3: string | null;
  lat: number;
  lng: number;
  pop: number;
  months: CityMonth[]; // 12 entries, Jan..Dec
};
/** Quality of life (0..100) vs beauty (0..100) for one city. */
export type LiveCity = {
  id: string;
  name: string;
  country: string;
  iso3: string | null;
  pop: number;
  quality: number;
  beauty: number;
  q: { hdi: number; happiness: number; safety: number; air: number };
  b: { setting: number; character: number };
};
export type TravelEvent = {
  id: string;
  title: string;
  kind: "festival" | "culture" | "sport" | "eclipse" | "sky" | "nature";
  month: number; // 1..12
  date: string | null; // ISO date when fixed
  recurring: boolean;
  cities: string[]; // display names, every city the event is placed on
};
export type Phenomenon = {
  id: string;
  kind: "conflict" | "hazard";
  type: string; // war, civil-war, storm, monsoon, wildfire, ...
  label: string;
  country?: string;
  lat: number;
  lng: number;
  severity: number; // 1..3
  months: number[] | null; // hazards: active months; conflicts: null (standing)
  peak: number[] | null;
};
export type CountryFeature = {
  type: "Feature";
  properties: { name: string; iso3: string; continent: string };
  geometry: { type: "MultiPolygon"; coordinates: number[][][][] };
};
export type VisaData = {
  destinations: string[]; // ISO2, same order as each matrix row
  names: Record<string, string>; // ISO2 -> name
  iso3: Record<string, string | null>; // ISO2 -> ISO3 (matches CountryFeature.properties.iso3)
  matrix: Record<string, string>; // passport ISO2 -> space-separated tokens, one per destination
  source: string;
};
export type Dashboard = {
  builtAt: string;
  climateWindow: string;
  cities: SeasonCity[];
  live: LiveCity[];
  events: TravelEvent[];
  eventsAsOf: string; // when Meridian last refreshed its live events
  eventsSource: string;
  phenomena: Phenomenon[];
  phenomenaAsOf: string;
  countries: { type: "FeatureCollection"; features: CountryFeature[] };
  visa: VisaData;
};

export const data = raw as unknown as Dashboard;

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Month index 0..11 helpers. */
export const isActive = (p: Phenomenon, m0: number) => !p.months || p.months.includes(m0 + 1);

/** Visa categories, from Passport Index tokens. */
export type VisaKind = "own" | "free" | "arrival" | "eta" | "evisa" | "required" | "none" | "unknown";
export function parseVisa(token: string): { kind: VisaKind; days: number | null } {
  const m = token.match(/^([a-z?-]+?)(\d+)?$/);
  const head = m?.[1] ?? token;
  const days = m?.[2] ? Number(m[2]) : null;
  const kind: VisaKind =
    head === "-" ? "own" : head === "vf" ? "free" : head === "voa" ? "arrival" : head === "eta" ? "eta" : head === "ev" ? "evisa" : head === "vr" ? "required" : head === "na" ? "none" : "unknown";
  return { kind, days };
}
export const VISA_LABEL: Record<VisaKind, string> = {
  own: "Own country",
  free: "Visa free",
  arrival: "On arrival",
  eta: "ETA",
  evisa: "E-visa",
  required: "Visa required",
  none: "No admission",
  unknown: "No data",
};
/** CSS variable per visa kind (defined in styles/app.css). */
export const VISA_COLOR: Record<VisaKind, string> = {
  own: "var(--visa-own)",
  free: "var(--visa-free)",
  arrival: "var(--visa-arrival)",
  eta: "var(--visa-eta)",
  evisa: "var(--visa-evisa)",
  required: "var(--visa-required)",
  none: "var(--visa-none)",
  unknown: "var(--visa-unknown)",
};

export function visaRow(passport: string): { dest: string; kind: VisaKind; days: number | null }[] {
  const row = data.visa.matrix[passport]?.split(" ") ?? [];
  return data.visa.destinations.map((dest, i) => ({ dest, ...parseVisa(row[i] ?? "?") }));
}
