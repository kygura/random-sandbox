import { AppError } from "./errors.mjs";

const BASE = "https://api.exa.ai";

function exaError(status, body) {
  const detail = typeof body === "string" ? body.slice(0, 200) : "";
  if (status === 401 || status === 403)
    return new AppError("exa_auth", "Exa rejected the API key. Check EXA_API_KEY in your .env file.", { fatal: true, source: "exa" });
  if (status === 402)
    return new AppError("exa_credits", "Your Exa account is out of credits. Top up at dashboard.exa.ai.", { fatal: true, source: "exa" });
  if (status === 429)
    return new AppError("exa_rate", "Exa is rate limiting requests. Wait a minute and dive again.", { source: "exa" });
  return new AppError("exa_" + status, `Exa search failed (${status}). ${detail}`.trim(), { source: "exa" });
}

export function createExa({ apiKey = process.env.EXA_API_KEY, fetchImpl = fetch } = {}) {
  async function post(path, body, signal) {
    if (!apiKey) throw new AppError("exa_missing", "EXA_API_KEY isn't set. Add it to your .env file and restart.", { fatal: true, source: "exa" });
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetchImpl(BASE + path, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify(body),
        signal,
      });
      if (res.ok) return res.json();
      const text = await res.text().catch(() => "");
      if ((res.status === 429 || res.status >= 500) && attempt === 0) {
        await new Promise((r) => setTimeout(r, 1200 + Math.random() * 800));
        continue;
      }
      throw exaError(res.status, text);
    }
  }

  return {
    configured: Boolean(apiKey),

    /** Web search with highlights. Returns normalized results. */
    async search(query, { numResults = 5, includeDomains, signal } = {}) {
      const body = { query, type: "auto", numResults, contents: { highlights: true } };
      if (includeDomains?.length) body.includeDomains = includeDomains;
      const data = await post("/search", body, signal);
      return (data.results || []).map((r) => ({
        title: r.title || "",
        url: r.url,
        date: r.publishedDate || "",
        author: r.author || "",
        image: r.image || "",
        favicon: r.favicon || "",
        text: Array.isArray(r.highlights) ? r.highlights.join(" … ") : r.text || "",
      })).filter((r) => /^https?:\/\//.test(r.url || ""));
    },

    /** Full page text for a few URLs. */
    async contents(urls, { maxCharacters = 6000, signal } = {}) {
      const data = await post("/contents", { urls, text: { maxCharacters } }, signal);
      return (data.results || []).map((r) => ({ url: r.url, title: r.title || "", text: r.text || "" }));
    },
  };
}
