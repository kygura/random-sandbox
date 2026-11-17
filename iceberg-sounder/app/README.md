# Iceberg Sounder (standalone)

Name a research topic and get an iceberg chart: six depth layers from common knowledge down to fringe claims, built from live web search, with every entry citing its sources. Unlike the claude.ai artifact version, this one renders media inline:

- **Videos** play on the page through YouTube's privacy-enhanced player or Vimeo.
- **Images** come from each page's own preview image and from Wikimedia Commons (author and license shown), in a gallery with a full-size viewer.
- **Sources** show thumbnails or site icons, and each entry's panel leads with an image or video from its cited sources.

## Run it

Needs Node 20 or later.

```bash
npm install
cp .env.example .env   # then add ANTHROPIC_API_KEY and EXA_API_KEY
npm start              # http://localhost:3000
```

The page opens on a pre-built example (the Voynich manuscript), so you can look around before adding keys.

## How a dive works

1. Claude (`claude-opus-5-5`) plans three search queries for each layer, plus searches for videos, image-rich pages, papers and Commons images.
2. The server runs them through Exa and streams results to the browser as they arrive.
3. Claude charts each layer from that layer's results only, using structured output. Entries that cite nothing are dropped.
4. **Dig deeper** on an entry fetches the cited pages in full and streams a longer write-up with citations and follow-up topics.

The Quick / Thorough / Deepest setting maps to Claude's `low` / `medium` / `high` effort. Requests use the API's server-side refusal fallback, so a declined request is retried on a fallback model instead of failing.

## Cost

A dive makes 7 Claude calls and about 21 Exa searches; a deep dive makes 1 of each plus a page fetch. Every dive is billed to your keys. The server listens on 127.0.0.1 by default. Don't expose it publicly without putting auth in front.

## Layout

```
server.mjs          HTTP server: static files, /api/dive and /api/deep (NDJSON streams), /api/health
lib/pipeline.mjs    dive and deep-dive orchestration, prompts
lib/claude.mjs      Anthropic SDK calls and output schemas
lib/exa.mjs         Exa search and page contents
lib/commons.mjs     Wikimedia Commons image search
public/             the page (no build step)
test/               node:test suites; fakes stand in for Claude, Exa and Commons
```

`npm test` runs everything offline.
