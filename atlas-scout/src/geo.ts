import type { Location } from "./types.ts";

const R = 6371;

export function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Door-to-door estimate: cruise at ~800 km/h on a 15% detour, plus 2.5 h of
// airport time, plus one connection for anything past 3,000 km.
export function travelHours(distanceKm: number): number {
  if (distanceKm < 250) return distanceKm / 80; // ground transport
  const air = (distanceKm * 1.15) / 800;
  return air + 2.5 + (distanceKm > 3000 ? 2 : 0);
}

export function slug(s: string): string {
  return s
    .replace(/[øØ]/g, "o")
    .replace(/[æÆ]/g, "ae")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

type GeoHit = { name: string; latitude: number; longitude: number; country?: string; admin1?: string };

export async function geocode(query: string, fetcher: typeof fetch = fetch): Promise<Omit<Location, "source" | "at"> | null> {
  // Open-Meteo matches on the place name only, so "Pico, Azores" searches
  // "Pico" (then "Pico Island") and uses "Azores" to pick between hits.
  const [head, ...rest] = query.split(",").map((s) => s.trim());
  const hint = fold(rest.join(" "));
  for (const name of hint ? [head, `${head} Island`] : [head]) {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=20&language=en&format=json`;
    const res = await fetcher(url);
    if (!res.ok) throw new Error(`geocode ${res.status}`);
    const hits = ((await res.json()) as { results?: GeoHit[] }).results ?? [];
    const pick = hint ? hits.find((h) => fold(`${h.country ?? ""} ${h.admin1 ?? ""} ${h.name}`).includes(hint)) : hits[0];
    if (pick)
      return {
        name: rest.length ? query : `${pick.name}${pick.country ? `, ${pick.country}` : ""}`,
        lat: pick.latitude,
        lon: pick.longitude,
        country: pick.country,
      };
  }
  return nominatim(query, fetcher);
}

const fold = (x: string) => x.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

// Fallback for spellings and regions Open-Meteo does not index (Marrakech,
// "Dolomites"). OpenStreetMap asks for an identifying User-Agent.
async function nominatim(query: string, fetcher: typeof fetch): Promise<Omit<Location, "source" | "at"> | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=1&accept-language=en`;
  const res = await fetcher(url, { headers: { "User-Agent": "atlas-scout/0.1" } });
  if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) return null;
  const [hit] = (await res.json()) as { lat: string; lon: string; name?: string; address?: { country?: string } }[];
  if (!hit) return null;
  const country = hit.address?.country;
  const name = hit.name || query.split(",")[0];
  return { name: country && !query.includes(",") ? `${name}, ${country}` : query, lat: Number(hit.lat), lon: Number(hit.lon), country };
}

// Approximate location of the machine running the terminal UI.
export async function ipLocate(fetcher: typeof fetch = fetch): Promise<Omit<Location, "at"> | null> {
  try {
    const res = await fetcher("https://ipapi.co/json/");
    if (!res.ok) return null;
    const b = (await res.json()) as { city?: string; country_name?: string; latitude?: number; longitude?: number };
    if (typeof b.latitude !== "number" || typeof b.longitude !== "number") return null;
    return {
      name: [b.city, b.country_name].filter(Boolean).join(", ") || "Unknown",
      lat: b.latitude,
      lon: b.longitude,
      country: b.country_name,
      source: "ip",
    };
  } catch {
    return null;
  }
}
