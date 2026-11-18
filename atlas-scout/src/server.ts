import { ZodError } from "zod";
import { Atlas, HttpError } from "./service.ts";
import { Store } from "./store.ts";
import { ProfileSchema, TripSchema } from "./types.ts";

type Handler = (req: Request, params: Record<string, string>) => Promise<unknown> | unknown;

export function createApp(atlas: Atlas, token = process.env.ATLAS_TOKEN) {
  const routes: [string, RegExp, string[], Handler][] = [];
  const on = (method: string, path: string, h: Handler) => {
    const keys: string[] = [];
    const re = new RegExp(`^${path.replace(/:(\w+)/g, (_, k) => (keys.push(k), "([^/]+)"))}$`);
    routes.push([method, re, keys, h]);
  };
  const body = async (req: Request) => {
    const text = await req.text();
    return text ? JSON.parse(text) : {};
  };
  const s = atlas.store;

  on("GET", "/api/health", () => ({ ok: true }));
  on("GET", "/api/state", () => ({
    profile: s.profile(),
    location: atlas.origin() ?? null,
    wishlist: s.wishlist().length,
    trips: s.trips(),
    runs: s.runs().slice(0, 10),
  }));

  on("GET", "/api/profile", () => s.profile());
  on("PUT", "/api/profile", async (req) => {
    const next = ProfileSchema.parse({ ...s.profile(), ...(await body(req)) });
    s.setProfile(next);
    await atlas.replan();
    return next;
  });
  on("PUT", "/api/profile/home", async (req) => {
    const loc = await atlas.setLocation({ ...(await body(req)), source: "home" });
    s.setProfile({ ...s.profile(), home: loc });
    return loc;
  });

  on("GET", "/api/location", () => atlas.origin() ?? null);
  on("POST", "/api/location", async (req) => atlas.setLocation(await body(req)));

  on("GET", "/api/wishlist", () =>
    atlas.ranking().map((r) => ({
      ...r.dest,
      km: r.km,
      hours: r.hours,
      too_far: r.too_far,
      season_now: r.now,
      best: r.best,
      months: r.months,
      cheapest_flight: r.cheapest_flight,
      has_climate: Boolean(s.climate(r.dest.id)),
    })),
  );
  on("POST", "/api/wishlist", async (req) => atlas.addWish(await body(req)));
  on("PATCH", "/api/wishlist/:id", async (req, p) => atlas.updateWish(p.id, await body(req)));
  on("DELETE", "/api/wishlist/:id", async (_req, p) => (await atlas.removeWish(p.id), { ok: true }));
  on("GET", "/api/wishlist/:id", (_req, p) => {
    const w = s.wish(p.id);
    if (!w) throw new HttpError(404, "unknown destination");
    const r = atlas.ranking().find((x) => x.dest.id === p.id);
    return { ...w, climate: s.climate(p.id) ?? null, signals: s.signals(p.id), offers: s.offers(p.id), ranking: r ?? null };
  });

  on("POST", "/api/climate/refresh", () => atlas.refreshClimate());
  on("POST", "/api/plan", () => atlas.replan());
  on("GET", "/api/trips", () => s.trips());
  on("PATCH", "/api/trips/:id", async (req, p) => {
    const prev = s.trip(p.id);
    if (!prev) throw new HttpError(404, "unknown trip");
    const patch = (await body(req)) as { status?: string };
    const next = TripSchema.parse({ ...prev, status: patch.status ?? prev.status, updated_at: new Date().toISOString() });
    s.putTrip(next);
    return next;
  });

  on("GET", "/api/context", () => atlas.context());
  on("POST", "/api/ingest", async (req) => {
    const res = atlas.ingest(await body(req));
    await atlas.refreshClimate();
    await atlas.replan();
    return res;
  });
  on("POST", "/api/run", async (req) => {
    const { mode } = (await body(req)) as { mode?: "research" | "discover" };
    return atlas.fireRoutine(mode === "discover" ? "discover" : "research");
  });
  on("GET", "/api/runs", () => s.runs());

  return async function fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (token && url.pathname !== "/api/health" && req.headers.get("authorization") !== `Bearer ${token}`) {
      return json({ error: "unauthorized" }, 401);
    }
    for (const [method, re, keys, h] of routes) {
      if (method !== req.method) continue;
      const m = url.pathname.match(re);
      if (!m) continue;
      const params = Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      try {
        return json(await h(req, params));
      } catch (e) {
        if (e instanceof HttpError) return json({ error: e.message }, e.status);
        if (e instanceof ZodError) return json({ error: "invalid body", issues: e.issues }, 422);
        if (e instanceof SyntaxError) return json({ error: "invalid JSON" }, 400);
        console.error(e);
        return json({ error: (e as Error).message }, 500);
      }
    }
    return json({ error: "not found" }, 404);
  };
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

// Background loop: keep climate normals filled and the plan fresh; optionally
// fire the research routine on a fixed cadence.
export function startScheduler(atlas: Atlas, env = process.env) {
  const tick = async () => {
    try {
      await atlas.refreshClimate();
      await atlas.replan();
    } catch (e) {
      console.error("tick failed", e);
    }
  };
  void tick();
  setInterval(tick, 60 * 60 * 1000);
  const every = Number(env.ATLAS_AUTORUN_HOURS ?? 0);
  if (every > 0) {
    setInterval(() => void atlas.fireRoutine("research"), every * 3600 * 1000);
  }
}

if (import.meta.main) {
  const atlas = new Atlas(new Store());
  const port = Number(process.env.PORT ?? 7878);
  Bun.serve({ port, hostname: process.env.HOST ?? "127.0.0.1", fetch: createApp(atlas) });
  startScheduler(atlas);
  console.log(`atlas-scout backend on http://${process.env.HOST ?? "127.0.0.1"}:${port}${process.env.ATLAS_TOKEN ? "" : " (no ATLAS_TOKEN set, API is open)"}`);
}
