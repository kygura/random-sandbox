import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  ProfileSchema,
  type ClimateMonth,
  type Location,
  type Offer,
  type Profile,
  type Run,
  type Signal,
  type Trip,
  type WishItem,
} from "./types.ts";

type Kind = "profile" | "location" | "wish" | "climate" | "signal" | "offer" | "trip" | "run";

// One document table. The data set is small (tens of destinations), so JSON
// documents keyed by kind and id are enough and keep migrations trivial.
export class Store {
  db: Database;

  constructor(path = process.env.ATLAS_DB ?? "data/atlas.sqlite") {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path, { create: true });
    this.db.run("PRAGMA journal_mode = WAL");
    this.db.run(
      "CREATE TABLE IF NOT EXISTS docs (kind TEXT NOT NULL, id TEXT NOT NULL, json TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (kind, id))",
    );
  }

  private put(kind: Kind, id: string, value: unknown) {
    this.db
      .query("INSERT INTO docs (kind, id, json, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(kind, id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at")
      .run(kind, id, JSON.stringify(value), new Date().toISOString());
  }

  private get<T>(kind: Kind, id: string): T | undefined {
    const row = this.db.query("SELECT json FROM docs WHERE kind = ? AND id = ?").get(kind, id) as { json: string } | null;
    return row ? (JSON.parse(row.json) as T) : undefined;
  }

  private all<T>(kind: Kind): T[] {
    const rows = this.db.query("SELECT json FROM docs WHERE kind = ? ORDER BY id").all(kind) as { json: string }[];
    return rows.map((r) => JSON.parse(r.json) as T);
  }

  private del(kind: Kind, id: string) {
    this.db.query("DELETE FROM docs WHERE kind = ? AND id = ?").run(kind, id);
  }

  profile(): Profile {
    return ProfileSchema.parse(this.get("profile", "me") ?? {});
  }
  setProfile(p: Profile) {
    this.put("profile", "me", ProfileSchema.parse(p));
  }

  location(): Location | undefined {
    return this.get<Location>("location", "current");
  }
  setLocation(l: Location) {
    this.put("location", "current", l);
  }

  wishlist(): WishItem[] {
    return this.all<WishItem>("wish");
  }
  wish(id: string) {
    return this.get<WishItem>("wish", id);
  }
  putWish(w: WishItem) {
    this.put("wish", w.id, w);
  }
  deleteWish(id: string) {
    this.del("wish", id);
    this.db.query("DELETE FROM docs WHERE kind IN ('climate') AND id = ?").run(id);
    this.db.query("DELETE FROM docs WHERE kind = 'signal' AND id LIKE ?").run(`${id}:%`);
  }

  climate(destId: string): { fetched_at: string; months: ClimateMonth[] } | undefined {
    return this.get("climate", destId);
  }
  setClimate(destId: string, months: ClimateMonth[]) {
    this.put("climate", destId, { fetched_at: new Date().toISOString(), months });
  }

  signals(destId?: string): Signal[] {
    const all = this.all<Signal>("signal");
    return destId ? all.filter((s) => s.dest_id === destId) : all;
  }
  putSignal(s: Signal) {
    this.put("signal", `${s.dest_id}:${s.month}`, s);
  }

  offers(destId?: string): Offer[] {
    const all = this.all<Offer>("offer");
    return destId ? all.filter((o) => o.dest_id === destId) : all;
  }
  putOffer(o: Offer) {
    const id = o.id ?? `${o.dest_id}:${o.kind}:${Bun.hash(o.url).toString(36)}`;
    this.put("offer", id, { ...o, id });
  }

  trips(): Trip[] {
    return this.all<Trip>("trip").sort((a, b) => a.start.localeCompare(b.start));
  }
  trip(id: string) {
    return this.get<Trip>("trip", id);
  }
  putTrip(t: Trip) {
    this.put("trip", t.id, t);
  }
  deleteTrip(id: string) {
    this.del("trip", id);
  }

  runs(): Run[] {
    return this.all<Run>("run").sort((a, b) => b.fired_at.localeCompare(a.fired_at));
  }
  putRun(r: Run) {
    this.put("run", r.id, r);
  }
}
