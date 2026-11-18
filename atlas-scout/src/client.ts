import type { MonthScore } from "./season.ts";
import type { Location, Offer, Profile, Run, Trip, WishItem } from "./types.ts";

export type WishRow = WishItem & {
  km: number;
  hours: number;
  too_far: boolean;
  season_now: number;
  best: { start: string; end: string; nights: number; season: number; composite: number } | null;
  months: MonthScore[];
  cheapest_flight: Offer | null;
  has_climate: boolean;
};

export type State = { profile: Profile; location: Location | null; wishlist: number; trips: Trip[]; runs: Run[] };

export class Client {
  constructor(
    public base = process.env.ATLAS_URL ?? "http://127.0.0.1:7878",
    private token = process.env.ATLAS_TOKEN,
  ) {}

  async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new Error(`backend not reachable at ${this.base} (start it with: bun run server)`);
    }
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    return data;
  }

  state = () => this.call<State>("GET", "/api/state");
  wishlist = () => this.call<WishRow[]>("GET", "/api/wishlist");
  detail = (id: string) => this.call<Record<string, unknown>>("GET", `/api/wishlist/${encodeURIComponent(id)}`);
  add = (w: Record<string, unknown>) => this.call<WishItem>("POST", "/api/wishlist", w);
  patchWish = (id: string, w: Record<string, unknown>) => this.call<WishItem>("PATCH", `/api/wishlist/${encodeURIComponent(id)}`, w);
  remove = (id: string) => this.call("DELETE", `/api/wishlist/${encodeURIComponent(id)}`);
  where = (l: Record<string, unknown>) => this.call<Location>("POST", "/api/location", l);
  home = (l: Record<string, unknown>) => this.call<Location>("PUT", "/api/profile/home", l);
  profile = (p: Partial<Profile>) => this.call<Profile>("PUT", "/api/profile", p);
  plan = () => this.call<{ kept: number; removed: number }>("POST", "/api/plan");
  trips = () => this.call<Trip[]>("GET", "/api/trips");
  setTrip = (id: string, status: Trip["status"]) => this.call<Trip>("PATCH", `/api/trips/${encodeURIComponent(id)}`, { status });
  run = (mode: "research" | "discover") => this.call<Run>("POST", "/api/run", { mode });
  runs = () => this.call<Run[]>("GET", "/api/runs");
  refreshClimate = () => this.call<{ updated: string[]; failed: string[] }>("POST", "/api/climate/refresh");
}
