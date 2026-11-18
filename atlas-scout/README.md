# atlas-scout

A seasonal travel scout. It keeps a wish list of places, scores each one month by month, works out where you are, and organizes trips from there. A cloud routine with Claude's travel connectors checks crowds and events and prices the trips, then posts the results back.

It follows the Atlas routine (`kygura/atlas`) but splits the work differently. Atlas did everything inside one long routine run. Here the backend does the deterministic part (climate, distances, ranking, trip layout) all the time and for free, and the routine only does what needs the connectors.

```
 terminal UI / CLI  ──HTTP──>  backend (Bun + SQLite)  ──API trigger──>  cloud routine
        ^                      climate normals (Open-Meteo)            Exa, Kiwi.com, lastminute.com,
        │                      season scores, ranking                  Booking.com, Expedia, Viator,
        └── where am I (IP,    trip organizer, scheduler   <──POST───  Google Calendar, Turkish Airlines
            typed place)                                   /api/ingest
```

## What it does

- **Seasonality from real data.** For every place it pulls five years of daily ERA5 reanalysis (Open-Meteo archive API, no key) and builds monthly normals: daytime high, rain days, sunshine. Each month gets a 1 to 5 score for the place's activities (beach, surf, diving, hiking, nature, culture, city, food, wildlife, ski).
- **Research on top.** The routine adds what weather data cannot show: how crowded the month is (`quiet`), activity conditions (swell, trail state, wildlife), and dated events. Month score = 50% climate, 25% quiet, 25% conditions. Unresearched values stay neutral at 3.
- **Where you are.** Current location comes from, in order: what you type (`atlas where Lisbon`), an IP lookup (`atlas where --ip`, or automatically the first time the TUI opens), or the routine reading Google Calendar for upcoming stays. Home is the fallback.
- **Trip organizer.** Ranks every place by season fit for its best window (50%), your priority (20%), distance from where you are (15%), and price once a flight is known (15%). Then lays out up to 4 non-overlapping trips: one per explicit free window if you set them, otherwise the best Friday departure per place inside the horizon. Long windows get a second stop when another place within 700 km is also in season. Places over your flight limit are ranked but not planned.
- **Autonomous loop.** The backend refreshes climate and replans every hour. With `ATLAS_AUTORUN_HOURS` set it also fires the routine on that cadence. The routine researches the months that matter, prices the nearest trips, suggests up to 3 new places, and posts everything to `/api/ingest`. Trips it prices or you save are locked; the planner works around them.

## Run it

Needs Bun 1.3+.

```bash
cd atlas-scout
bun install
bun run server            # backend on http://127.0.0.1:7878
bun run src/cli.ts tui    # terminal UI (or link it: bun link, then `atlas`)
```

```bash
atlas where Malaga
atlas add Madeira --do hiking,nature --p 5
atlas add "Lofoten" --do hiking --prefer 6,7,8
atlas add Marrakech --do culture,food --avoid 7,8
atlas profile budget=300-1500 days=4-9 maxhours=10 window=2026-12-19..2026-12-28
atlas list                # ranking with a 12-month heat strip
atlas season madeira-portugal
atlas trips
atlas run                 # send the routine out now
```

`atlas import config/wishlist.example.json` loads a starter list.

### Terminal UI

Four tabs: **now** (what is in season in the next 30 days, organized trips, last run), **wishlist** (ranking, best window, month heat strip, per-month detail), **trips**, **runs**.

Keys: `1`-`4` or tab to switch, up/down or `j`/`k` to move, `w` set where you are, `l` locate by IP, `a` add a place (`Madeira; hiking,nature; 4`), `x` remove, `+`/`-` priority, `v` pause, `s`/`b`/`d` save, booked or dismiss a trip, `p` replan, `r` research, `D` discover, `q` quit.

## The routine

`routine/ROUTINE.md` is the prompt. Create it as a routine (claude.ai/code, Routines) with these connectors: Exa, Kiwi.com, lastminute.com, Booking.com, Expedia, Viator, Google Calendar, Turkish Airlines. Then:

1. In the routine, add an API trigger and generate its token (shown once).
2. On the backend host set `ATLAS_ROUTINE_FIRE_URL` and `ATLAS_ROUTINE_TOKEN` to those values.
3. For results to come back, the backend must be reachable from the cloud: deploy it (see below) and set `ATLAS_PUBLIC_URL`. Put the same `ATLAS_TOKEN` in the routine's cloud environment.

Without a reachable backend the routine still runs: it falls back to discovery from your calendar location and pushes its digest to your phone, but nothing is stored.

The routine is read only: it never books, holds, pays, signs in, or edits your calendar.

## API

All routes need `Authorization: Bearer $ATLAS_TOKEN` when it is set, except `/api/health`.

| Method | Path | |
|---|---|---|
| GET | `/api/state` | profile, location, trips, last runs |
| GET, PUT | `/api/profile` | budget, trip length, free windows, horizon, flight limit |
| PUT | `/api/profile/home` | `{name}` or `{lat, lon}` |
| GET, POST | `/api/location` | current position; POST `{name}` geocodes |
| GET, POST | `/api/wishlist` | ranked list with month scores; POST adds (geocodes by name) |
| GET, PATCH, DELETE | `/api/wishlist/:id` | detail with climate, signals, offers |
| POST | `/api/plan` | re-organize trips |
| GET, PATCH | `/api/trips`, `/api/trips/:id` | `{status: saved, booked, dismissed}` |
| GET | `/api/context` | everything the routine needs, plus `research_needed` |
| POST | `/api/ingest` | routine results: signals, offers, trip prices, discoveries |
| POST | `/api/run` | fire the routine (`{mode: research or discover}`) |

## Config

| Env | Default | |
|---|---|---|
| `PORT`, `HOST` | `7878`, `127.0.0.1` | set `HOST=0.0.0.0` when deployed |
| `ATLAS_DB` | `data/atlas.sqlite` | |
| `ATLAS_TOKEN` | none | API bearer token, shared with the routine |
| `ATLAS_ROUTINE_FIRE_URL`, `ATLAS_ROUTINE_TOKEN` | none | routine API trigger |
| `ATLAS_PUBLIC_URL` | none | callback URL the routine posts to |
| `ATLAS_AUTORUN_HOURS` | `0` | fire the routine every N hours |
| `ATLAS_URL` | `http://127.0.0.1:7878` | where the CLI and TUI find the backend |

## Deploy

Any host that runs a long-lived Bun process with a disk works (Fly.io, Railway, a small VPS). Vercel functions do not suit it: the SQLite file and the hourly scheduler need a persistent process. A `Dockerfile` is included.

## Tests

```bash
bun test        # season scoring, planner, API with a fake network
bun run typecheck
```
