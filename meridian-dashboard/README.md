# Meridian dashboard

A one-page dashboard over the datasets in [kygura/meridian](https://github.com/kygura/meridian): where the world is comfortable this month, places to live, what is on, what to avoid, and how far a passport reaches. It uses Meridian's own Comfort Index formula and design tokens (parchment and ink, burnt orange, Instrument Serif, square frames with hard offset shadows; a dark "night" theme too).

The build is a single self-contained `index.html` (data, fonts and code inlined), so it opens from disk, any static host, or a shared link. It makes no network requests.

## Panels

| Panel | Shows |
|---|---|
| Headline figures | Best city this month, cities with comfort 70+, events this month, active hazards and standing conflicts, easy-entry destinations for the chosen passport |
| World map | Countries tinted by the mean comfort of their tracked cities for the month, or by visa requirement for the chosen passport. City dots, conflicts, and seasonal hazards (rings, thicker at peak) |
| Best this month | Top 10 cities by comfort, or the biggest risers since last month, each with a 12-month strip |
| Seasons | Calendar heatmap of 120 cities by month, sortable and filterable by region |
| Places to live | Quality of life (HDI, happiness, safety, air) against beauty (setting, character) for the 600 largest cities |
| Events and hazards | Events in the month, seasonal hazards active and at peak, standing conflicts |
| Visa reach | Destinations by entry requirement, longest visa-free stays, and the passport's rank among 199 |

Pick the month and passport in the header; both, and the theme, are remembered in the browser.

## Run

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/index.html, one file
```

## Data

`src/data/dashboard.json` is generated from a Meridian checkout and committed, so the app builds without it:

```sh
git clone https://github.com/kygura/meridian ../meridian
MERIDIAN_DIR=../meridian bun scripts/build-data.ts
```

The script recomputes every monthly score with `src/lib/comfort.ts` (copied unchanged from Meridian), the same way Meridian's server rescores its seed data. Country outlines are rounded to 0.1 degree. ISO2 to ISO3 codes for the visa map come from the system `iso-codes` package (`ISO_3166_JSON` to override the path).

Sources, as credited in Meridian: Open-Meteo climate normals 2015 to 2024, UNDP Human Development Index, World Happiness Report, World Bank, Natural Earth, Wikidata, and Passport Index Data (17 February 2026). Visa rules change; check the destination's official source before travel.
