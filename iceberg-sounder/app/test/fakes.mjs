// Stand-ins for Claude, Exa and Commons so the pipeline, server and UI can be
// exercised without API keys. They mimic the real modules' interfaces.
import { ZONES } from "../public/zones.js";
import { AppError } from "../lib/errors.mjs";

export function fakeDeps({ exaFails = null, chartFailsAt = -1, slowMs = 0 } = {}) {
  const calls = { structured: 0, search: [], contents: 0, stream: 0, commons: [], prompts: [] };
  const wait = (signal) => new Promise((res, rej) => {
    const t = setTimeout(res, slowMs);
    signal?.addEventListener("abort", () => { clearTimeout(t); rej(Object.assign(new Error("aborted"), { name: "AbortError" })); }, { once: true });
  });

  const claude = {
    configured: true,
    async structured(prompt, schema, { signal } = {}) {
      calls.structured++;
      calls.prompts.push(prompt);
      await wait(signal);
      if (prompt.includes('planning an "iceberg"')) {
        return {
          title: "Test Topic", summary: "A topic used for tests.",
          layers: ZONES.map((z) => ({ key: z.key, theme: `${z.name} theme`, queries: [`${z.key} q1`, `${z.key} q2`, `${z.key} q3`] })),
          records: "official records for test topic",
          media: { video: "videos about test topic", images: "photos of test topic", papers: "papers on test topic" },
          commons: "test topic",
        };
      }
      const zone = ZONES.find((z) => prompt.includes(`This layer: ${z.name} (`));
      if (ZONES.indexOf(zone) === chartFailsAt) throw new AppError("bad_output", "Claude's answer didn't match the expected format.", { source: "claude" });
      return {
        entries: [
          { term: `${zone.name} fact one`, summary: "First.", detail: "Detail one.", sources: ["S1", "S2", "S10"], confidence: "established", media: ["M1", "M2", "M99"], image_query: `${zone.key} picture` },
          { term: `${zone.name} fact two`, summary: "Second.", detail: "Detail two.", sources: ["S3"], confidence: "debated", media: [], image_query: "" },
          { term: `${zone.name} uncited`, summary: "Dropped.", detail: "No sources.", sources: ["S99"], confidence: "speculative", media: [], image_query: "" },
        ],
      };
    },
    async stream(prompt, { onText, signal } = {}) {
      calls.stream++;
      await wait(signal);
      for (const piece of ["**Deep** text with a cite [1].", "\n\nSecond paragraph [2].", "\nRabbit holes: Alpha | Beta | Gamma"]) onText(piece);
      return { truncated: false };
    },
  };

  const exa = {
    configured: true,
    async search(query, { includeDomains, signal } = {}) {
      calls.search.push(query);
      await wait(signal);
      if (exaFails) throw exaFails;
      const slug = query.replace(/\W+/g, "-");
      if (/^official records/.test(query)) {
        return [
          { title: "Commission report", url: `https://www.archives.gov/${slug}/report`, date: "1964-09-24", author: "", image: "", favicon: "", text: "The official report." },
          { title: "A video of the hearing", url: "https://www.youtube.com/watch?v=abcdefghijk", date: "", author: "", image: "", favicon: "", text: "" },
        ];
      }
      if (includeDomains?.includes("youtube.com")) {
        return [{ title: `Video for ${query}`, url: "https://www.youtube.com/watch?v=8NS4CbBJQ84", date: "2017-05-25", author: "TED-Ed", image: "", favicon: "", text: "A video." }];
      }
      return [1, 2, 3].map((n) => ({
        title: `Result ${n} for ${query}`, url: `https://example.org/${slug}/${n}`, date: "2024-01-0" + n, author: "Author " + n,
        image: n === 1 ? `https://images.example.org/${slug}.jpg` : "", favicon: "", text: `Highlight ${n} about ${query}.`,
      }));
    },
    async contents(urls) { calls.contents++; return urls.map((u) => ({ url: u, title: "Page", text: "Full page text." })); },
  };

  const commons = {
    configured: true,
    async searchImages(q) {
      calls.commons.push(q);
      const slug = String(q).replace(/\W+/g, "_");
      return [{ title: `Commons picture ${q}`, url: `https://commons.wikimedia.org/wiki/File:${slug}.jpg`, image: `https://upload.wikimedia.org/test/${slug}.jpg`, author: "Someone", license: "CC BY-SA 4.0", text: "" }];
    },
  };

  return { deps: { claude, exa, commons }, calls };
}
