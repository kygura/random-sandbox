# Iceberg Sounder

A single-page claude.ai artifact that builds an "iceberg" chart for any research topic.

Live: https://claude.ai/artifact/9YRVMtfpKwmRQb5QY3oK2G

## How it works

1. Claude (via the artifact `sample` capability) plans three web search queries for each of six levels: Everyone knows, Newcomers learn, Enthusiasts know, Specialists know, In the archives, Contested.
2. The page runs them through the viewer's Exa connector (`web_search_exa`), plus three media queries for videos, image collections and papers.
3. Claude charts each layer from those results only. Every entry cites numbered sources, and a confidence label marks it as established, debated or speculative.
4. "Dig deeper" fetches the cited pages in full (`web_fetch_exa`) and streams a longer write-up with citations and follow-up topics.

Icebergs are saved in the viewer's browser. The page opens with a pre-built example (the Voynich manuscript) charted from real sources.

## Limits

Artifacts can't load images or embeds from other sites, so images and videos appear as link cards that open at their source.

## Standalone version

`app/` is a self-hosted version that renders images and plays videos inline. It runs on your own Anthropic and Exa keys. See [app/README.md](app/README.md).
