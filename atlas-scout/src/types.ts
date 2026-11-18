import { z } from "zod";

export const Month = z.number().int().min(1).max(12);

export const LocationSchema = z.object({
  name: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  country: z.string().optional(),
  iata: z.string().length(3).optional(),
  source: z.enum(["manual", "ip", "calendar", "routine", "home"]).default("manual"),
  at: z.string().default(() => new Date().toISOString()),
});
export type Location = z.infer<typeof LocationSchema>;

export const WindowSchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  label: z.string().optional(),
});
export type Window = z.infer<typeof WindowSchema>;

export const ProfileSchema = z.object({
  home: LocationSchema.optional(),
  budget_eur: z.object({ min: z.number().min(0), max: z.number().min(0) }).default({ min: 0, max: 1500 }),
  trip_days: z.object({ min: z.number().int().min(1), max: z.number().int().min(1) }).default({ min: 4, max: 10 }),
  // Explicit free windows. Empty means: any week inside the horizon.
  availability: z.array(WindowSchema).default([]),
  horizon_days: z.number().int().min(14).max(365).default(150),
  lead_days: z.number().int().min(0).max(120).default(10),
  max_flight_hours: z.number().min(1).max(40).default(14),
  interests: z.array(z.string()).default(["beach", "hiking", "culture"]),
  avoid: z.array(z.string()).default(["peak crowds"]),
  multi_stop_km: z.number().min(0).max(3000).default(700),
  persona: z.string().default(""),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const ACTIVITIES = ["beach", "surf", "hiking", "culture", "city", "wildlife", "diving", "ski", "food", "nature"] as const;
export const Activity = z.enum(ACTIVITIES);
export type Activity = z.infer<typeof Activity>;

export const WishInputSchema = z.object({
  name: z.string().min(1),
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
  country: z.string().optional(),
  iata: z.string().length(3).optional(),
  activities: z.array(Activity).default(["culture"]),
  priority: z.number().int().min(1).max(5).default(3),
  prefer_months: z.array(Month).default([]),
  avoid_months: z.array(Month).default([]),
  notes: z.string().optional(),
  status: z.enum(["active", "paused", "visited"]).default("active"),
  source: z.enum(["user", "discovered"]).default("user"),
});
export type WishInput = z.infer<typeof WishInputSchema>;

export const WishItemSchema = WishInputSchema.extend({
  id: z.string(),
  lat: z.number(),
  lon: z.number(),
  added_at: z.string(),
});
export type WishItem = z.infer<typeof WishItemSchema>;

export const ClimateMonthSchema = z.object({
  month: Month,
  tmax: z.number(),
  tmin: z.number(),
  precip_mm: z.number(),
  rain_days: z.number(),
  sunshine_h: z.number(),
});
export type ClimateMonth = z.infer<typeof ClimateMonthSchema>;

// What the research routine learned about one destination in one month.
export const SignalSchema = z.object({
  dest_id: z.string(),
  month: Month,
  quiet: z.number().int().min(1).max(5).optional(), // 5 = low season, 1 = peak crowds
  conditions: z.number().int().min(1).max(5).optional(), // activity fit: swell, trails, wildlife
  events: z.array(z.string()).default([]),
  note: z.string().optional(),
  sources: z.array(z.string().url()).max(5).default([]),
  researched_at: z.string().default(() => new Date().toISOString()),
});
export type Signal = z.infer<typeof SignalSchema>;

export const OfferSchema = z.object({
  id: z.string().optional(),
  dest_id: z.string(),
  trip_id: z.string().optional(),
  kind: z.enum(["flight", "stay", "activity"]),
  title: z.string(),
  price_eur: z.number().min(0),
  origin: z.string().optional(),
  depart: z.string().optional(),
  return: z.string().optional(),
  url: z.string().url(),
  provider: z.string(),
  found_at: z.string().default(() => new Date().toISOString()),
});
export type Offer = z.infer<typeof OfferSchema>;

export const StopSchema = z.object({
  dest_id: z.string(),
  arrive: z.string(),
  depart: z.string(),
  nights: z.number().int().min(1),
});
export type Stop = z.infer<typeof StopSchema>;

export const TripSchema = z.object({
  id: z.string(),
  title: z.string(),
  origin: z.string(),
  start: z.string(),
  end: z.string(),
  stops: z.array(StopSchema).min(1),
  score: z.number(),
  est_cost_eur: z.number().nullable().default(null),
  status: z.enum(["draft", "priced", "saved", "booked", "dismissed"]).default("draft"),
  rationale: z.string(),
  source: z.enum(["planner", "routine"]).default("planner"),
  updated_at: z.string().default(() => new Date().toISOString()),
});
export type Trip = z.infer<typeof TripSchema>;

// Body the routine posts back after a research run.
export const IngestSchema = z.object({
  run_id: z.string().optional(),
  location: LocationSchema.optional(),
  signals: z.array(SignalSchema).default([]),
  offers: z.array(OfferSchema).default([]),
  trips: z
    .array(
      z.object({
        id: z.string(),
        est_cost_eur: z.number().min(0).nullable().optional(),
        status: z.enum(["priced", "dismissed"]).optional(),
        rationale: z.string().optional(),
      }),
    )
    .default([]),
  discoveries: z.array(WishInputSchema.extend({ lat: z.number(), lon: z.number() })).max(5).default([]),
  summary: z.string().max(2000).optional(),
});
export type Ingest = z.infer<typeof IngestSchema>;

export type Run = {
  id: string;
  fired_at: string;
  status: "fired" | "failed" | "ingested";
  detail: string;
  summary?: string;
};
