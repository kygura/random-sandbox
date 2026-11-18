import { fetchClimate } from "./climate.ts";
import { geocode, slug } from "./geo.ts";
import { mergePlan, organize, rank, type Ranked } from "./planner.ts";
import { Store } from "./store.ts";
import {
  IngestSchema,
  LocationSchema,
  WishInputSchema,
  type ClimateMonth,
  type Ingest,
  type Location,
  type Run,
  type WishInput,
  type WishItem,
} from "./types.ts";

const CLIMATE_TTL_DAYS = 180;
const RESEARCH_TTL_DAYS = 45;

export class Atlas {
  constructor(
    public store: Store,
    private fetcher: typeof fetch = fetch,
    private env: Record<string, string | undefined> = process.env,
  ) {}

  // Where trips start from: the freshest known position, else home.
  origin(): Location | undefined {
    return this.store.location() ?? this.store.profile().home;
  }

  async setLocation(input: { name?: string; lat?: number; lon?: number; source?: Location["source"]; iata?: string }): Promise<Location> {
    let loc: Location;
    if (typeof input.lat === "number" && typeof input.lon === "number") {
      loc = LocationSchema.parse({ name: input.name ?? `${input.lat.toFixed(2)}, ${input.lon.toFixed(2)}`, lat: input.lat, lon: input.lon, iata: input.iata, source: input.source ?? "manual" });
    } else if (input.name) {
      const hit = await geocode(input.name, this.fetcher);
      if (!hit) throw new HttpError(404, `no place found for "${input.name}"`);
      loc = LocationSchema.parse({ ...hit, iata: input.iata, source: input.source ?? "manual" });
    } else throw new HttpError(400, "name or lat/lon required");
    this.store.setLocation(loc);
    await this.replan();
    return loc;
  }

  async addWish(raw: unknown): Promise<WishItem> {
    const input: WishInput = WishInputSchema.parse(raw);
    let { lat, lon, country } = input;
    let name = input.name;
    if (lat == null || lon == null) {
      const hit = await geocode(input.name, this.fetcher);
      if (!hit) throw new HttpError(404, `no place found for "${input.name}"`);
      ({ lat, lon, country } = hit);
      name = hit.name;
    }
    const id = slug(name);
    const prev = this.store.wish(id);
    const item: WishItem = { ...input, name, lat: lat!, lon: lon!, country, id, added_at: prev?.added_at ?? new Date().toISOString() };
    this.store.putWish(item);
    await this.ensureClimate(item).catch(() => undefined);
    await this.replan();
    return item;
  }

  async updateWish(id: string, patch: Partial<WishInput>): Promise<WishItem> {
    const prev = this.store.wish(id);
    if (!prev) throw new HttpError(404, `unknown destination ${id}`);
    const merged = WishInputSchema.parse({ ...prev, ...patch });
    const item: WishItem = { ...prev, ...merged, lat: prev.lat, lon: prev.lon, id, added_at: prev.added_at };
    this.store.putWish(item);
    await this.replan();
    return item;
  }

  async removeWish(id: string) {
    this.store.deleteWish(id);
    await this.replan();
  }

  async ensureClimate(w: WishItem, force = false): Promise<ClimateMonth[] | undefined> {
    const have = this.store.climate(w.id);
    const fresh = have && Date.now() - Date.parse(have.fetched_at) < CLIMATE_TTL_DAYS * 86_400_000;
    if (have && fresh && !force) return have.months;
    const months = await fetchClimate(w.lat, w.lon, this.fetcher);
    this.store.setClimate(w.id, months);
    return months;
  }

  // Backfill climate normals for any destination missing them.
  async refreshClimate(): Promise<{ updated: string[]; failed: string[] }> {
    const updated: string[] = [];
    const failed: string[] = [];
    for (const w of this.store.wishlist()) {
      const before = this.store.climate(w.id)?.fetched_at;
      try {
        await this.ensureClimate(w);
        if (this.store.climate(w.id)?.fetched_at !== before) updated.push(w.id);
      } catch {
        failed.push(w.id);
      }
    }
    return { updated, failed };
  }

  private planInput() {
    const origin = this.origin();
    if (!origin) return null;
    const wishlist = this.store.wishlist();
    const climate: Record<string, ClimateMonth[] | undefined> = {};
    for (const w of wishlist) climate[w.id] = this.store.climate(w.id)?.months;
    return { profile: this.store.profile(), origin, wishlist, climate, signals: this.store.signals(), offers: this.store.offers() };
  }

  ranking(): Ranked[] {
    const input = this.planInput();
    return input ? rank(input) : [];
  }

  async replan() {
    const input = this.planInput();
    if (!input) return { kept: 0, removed: 0 };
    const locked = this.store.trips().filter((t) => ["priced", "saved", "booked"].includes(t.status) && t.end >= new Date().toISOString().slice(0, 10));
    const fresh = organize(input, 4, locked);
    const { keep, remove } = mergePlan(this.store.trips(), fresh);
    remove.forEach((id) => this.store.deleteTrip(id));
    keep.forEach((t) => this.store.putTrip(t));
    return { kept: keep.length, removed: remove.length };
  }

  // Everything the research routine needs, so it never has to guess.
  context() {
    const origin = this.origin();
    const ranking = this.ranking();
    const now = Date.now();
    const signals = this.store.signals();
    const stale = ranking
      .filter((r) => !r.too_far)
      .map((r) => {
        const months = r.best ? monthsBetween(r.best.start, r.best.end) : [];
        const missing = months.filter((m) => {
          const s = signals.find((x) => x.dest_id === r.dest.id && x.month === m);
          return !s || now - Date.parse(s.researched_at) > RESEARCH_TTL_DAYS * 86_400_000;
        });
        return { dest_id: r.dest.id, months: missing };
      })
      .filter((x) => x.months.length);
    return {
      generated_at: new Date().toISOString(),
      profile: this.store.profile(),
      origin,
      wishlist: ranking.map((r) => ({
        id: r.dest.id,
        name: r.dest.name,
        country: r.dest.country,
        iata: r.dest.iata,
        lat: r.dest.lat,
        lon: r.dest.lon,
        activities: r.dest.activities,
        priority: r.dest.priority,
        notes: r.dest.notes,
        km: r.km,
        hours: r.hours,
        too_far: r.too_far,
        season_now: r.now,
        best_window: r.best,
        month_scores: r.months.map((m) => m.score),
      })),
      trips: this.store.trips().filter((t) => t.status === "draft" || t.status === "saved"),
      research_needed: stale,
    };
  }

  ingest(raw: unknown): { signals: number; offers: number; trips: number; discoveries: number } {
    const body: Ingest = IngestSchema.parse(raw);
    const known = new Set(this.store.wishlist().map((w) => w.id));
    if (body.location) this.store.setLocation({ ...body.location, source: body.location.source ?? "routine" });
    let discoveries = 0;
    for (const d of body.discoveries) {
      const id = slug(d.name);
      if (known.has(id)) continue;
      this.store.putWish({ ...d, id, source: "discovered", status: d.status ?? "active", added_at: new Date().toISOString() });
      known.add(id);
      discoveries += 1;
    }
    const signals = body.signals.filter((s) => known.has(s.dest_id));
    signals.forEach((s) => this.store.putSignal(s));
    const offers = body.offers.filter((o) => known.has(o.dest_id));
    offers.forEach((o) => this.store.putOffer(o));
    let trips = 0;
    for (const t of body.trips) {
      const prev = this.store.trip(t.id);
      if (!prev) continue;
      this.store.putTrip({
        ...prev,
        est_cost_eur: t.est_cost_eur ?? prev.est_cost_eur,
        status: t.status ?? prev.status,
        rationale: t.rationale ?? prev.rationale,
        source: "routine",
        updated_at: new Date().toISOString(),
      });
      trips += 1;
    }
    if (body.run_id) {
      const run = this.store.runs().find((r) => r.id === body.run_id);
      if (run) this.store.putRun({ ...run, status: "ingested", summary: body.summary });
    } else if (body.summary) {
      this.store.putRun({ id: `r-${Date.now()}`, fired_at: new Date().toISOString(), status: "ingested", detail: "posted without a run id", summary: body.summary });
    }
    return { signals: signals.length, offers: offers.length, trips, discoveries };
  }

  // Fire the cloud routine through its API trigger, with the context inline.
  async fireRoutine(mode: "research" | "discover" = "research"): Promise<Run> {
    const url = this.env.ATLAS_ROUTINE_FIRE_URL;
    const token = this.env.ATLAS_ROUTINE_TOKEN;
    const run: Run = { id: `r-${Date.now().toString(36)}`, fired_at: new Date().toISOString(), status: "fired", detail: mode };
    if (!url || !token) {
      run.status = "failed";
      run.detail = "ATLAS_ROUTINE_FIRE_URL and ATLAS_ROUTINE_TOKEN are not set";
      this.store.putRun(run);
      return run;
    }
    const text = [
      `atlas-scout ${mode}`,
      `run_id: ${run.id}`,
      `callback: ${this.env.ATLAS_PUBLIC_URL ?? "(none, report in the final message only)"}`,
      "",
      JSON.stringify(this.context()),
    ].join("\n");
    try {
      const res = await this.fetcher(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "experimental-cc-routine-2026-04-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        run.status = "failed";
        run.detail = `${mode}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`;
      }
    } catch (e) {
      run.status = "failed";
      run.detail = `${mode}: ${(e as Error).message}`;
    }
    this.store.putRun(run);
    return run;
  }
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function monthsBetween(start: string, end: string): number[] {
  const out = new Set<number>();
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  for (const d = new Date(s); d < e; d.setUTCDate(d.getUTCDate() + 1)) out.add(d.getUTCMonth() + 1);
  return [...out];
}
