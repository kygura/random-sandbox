# Iceberg Sounder

Live at **https://iceberg.nca.ink**

Name a research topic and get an iceberg chart: six levels from common knowledge down to contested claims, built from live web search, with every entry citing its sources. Images and video live with the entries they show:

- **Each level** shows a strip of its entries' pictures and videos.
- **Each entry** opens a modal with a media stage (videos play inline through YouTube's privacy-enhanced player or Vimeo; images open full size), a filmstrip of everything attached, then the text and sources.
- **Images** come from the cited pages' preview images and from Wikimedia Commons, with author and license shown.

## Run it

Needs Node 20 or later.

```bash
npm install
cp .env.example .env   # then add ANTHROPIC_API_KEY and EXA_API_KEY
npm start              # http://localhost:3000
```

The page opens on a blank note. Write the topic as the title and, if you like, notes underneath to steer the research (an angle, a period, sources to favor or skip). The notes are a [Tiptap](https://tiptap.dev) editor: Markdown shortcuts (`## `, `- `, `1. `, `> `, `**bold**`) work as you type, selecting text shows a formatting bar, and `/` opens a menu of blocks and actions (research now, set the effort, open the example, start a new search). Claude receives the notes as Markdown. Press Ctrl+Enter (⌘+Enter on a Mac) or **Research** to start.

Past searches and a pre-built example (the Voynich manuscript) are in the **Saved searches** menu, so you can look around before adding keys.

## How a dive works

1. Claude (`claude-opus-5-5`) reads the topic and your notes and plans three search queries for each level, plus searches for videos, image-rich pages, papers and Commons images.
2. The server runs them through Exa and streams results to the browser as they arrive.
3. Claude charts each level from that level's results only, using structured output. Entries that cite nothing are dropped.
4. **Dig deeper** on an entry fetches the cited pages in full and streams a longer write-up with citations and follow-up topics.

The Quick / Thorough / Deepest setting maps to Claude's `low` / `medium` / `high` effort. Requests use the API's server-side refusal fallback, so a declined request is retried on a fallback model instead of failing.

## Cost

A dive makes 7 Claude calls and about 21 Exa searches; a deep dive makes 1 of each plus a page fetch. Every dive is billed to your keys. The server listens on 127.0.0.1 by default. Don't expose it publicly without putting auth in front.

## Deploy on Vercel

The repo deploys as-is: `public/` is served statically and each file in `api/` is a function using the same handler as `server.mjs`. Set these environment variables on the project:

| Variable | |
|---|---|
| `ANTHROPIC_API_KEY` | required |
| `EXA_API_KEY` | required |
| `ACCESS_CODE` | required on Vercel: visitors enter it before they can search |
| `WIKIMEDIA_CONTACT` | optional: an email or URL, turns on Commons images |

On Vercel, searching stays off until `ACCESS_CODE` is set, so a public URL can't spend your credits. Set `ALLOW_PUBLIC=1` instead only if you mean to let anyone search.

## Layout

```
server.mjs          HTTP server: static files, /api/dive and /api/deep (NDJSON streams), /api/health
lib/pipeline.mjs    dive and deep-dive orchestration, prompts
public/editor.js    the notes editor (Tiptap), Markdown export
public/vendor/      prebuilt Tiptap bundle; regenerate with `npm run vendor`
lib/claude.mjs      Anthropic SDK calls and output schemas
lib/exa.mjs         Exa search and page contents
lib/commons.mjs     Wikimedia Commons image search
public/             the page (no build step)
test/               node:test suites; fakes stand in for Claude, Exa and Commons
```

`npm test` runs everything offline.
