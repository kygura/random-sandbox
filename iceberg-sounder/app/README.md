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

A dive makes 7 Claude calls and about 21 Exa searches; a deep dive makes 1 of each plus a page fetch. Every dive is billed to whichever keys it runs on. The server listens on 127.0.0.1 by default.

## Keys

Visitors can bring their own keys: the **Keys** panel stores an Anthropic and an Exa key in the browser and sends them as `x-anthropic-key` and `x-exa-key` headers with each search. The server builds clients from them for that request only and doesn't store or log them. A visitor can bring one key and use the server's other one, where the server's keys are available.

Running locally, the server's own keys from `.env` are used when a visitor brings none.

## Deploy on Vercel

The repo deploys as-is: `public/` is served statically and each file in `api/` is a function using the same handler as `server.mjs`. No environment variables are required: visitors search with their own keys. Optional ones:

| Variable | |
|---|---|
| `ANTHROPIC_API_KEY`, `EXA_API_KEY` | the server's own keys, used for owner-mode browsers or with `ALLOW_PUBLIC=1` |
| `OWNER_SECRET` | 16+ characters. Open `https://your-site/#owner=SECRET` once per browser and that browser searches on the server's keys from then on |
| `ALLOW_PUBLIC` | `1` lets visitors without keys search on the server's keys, at your cost |
| `WIKIMEDIA_CONTACT` | an email or URL; turns on Commons images |

On Vercel the server's keys are never used unless `ALLOW_PUBLIC=1`, so a public URL can't spend your credits by accident. For yourself, set `OWNER_SECRET` and open the owner link once on each browser you use: an HttpOnly cookie (an HMAC of the secret, not the secret itself) then marks that browser, and the secret travels in the URL fragment so it never reaches request logs. The Keys panel has a link to leave owner mode.

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
