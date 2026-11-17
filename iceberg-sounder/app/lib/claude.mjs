import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";
import { AppError } from "./errors.mjs";

export const modelId = () => process.env.ICEBERG_MODEL || "claude-opus-5-5";

// Server-side refusal fallback: if a safety classifier declines, the API re-runs
// the request on a fallback model inside the same call.
const FALLBACK = { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };

const EFFORT = { quick: "low", thorough: "medium", deep: "high" };
export const effortFor = (depth) => EFFORT[depth] || "medium";

const LAYER_KEYS = ["tip", "waterline", "twilight", "midnight", "abyss", "trench"];

export const PlanSchema = z.object({
  title: z.string().describe("Short canonical name of the topic"),
  summary: z.string().describe("Two sentences orienting a newcomer"),
  layers: z.array(z.object({
    key: z.enum(LAYER_KEYS),
    theme: z.string().describe("One line: what this layer covers for this topic"),
    queries: z.array(z.string()).describe("Exactly 3 web search queries"),
  })),
  media: z.object({
    video: z.string().describe("Search for YouTube videos, lectures or documentaries"),
    images: z.string().describe("Search for pages with photographs, scans, maps or diagrams"),
    papers: z.string().describe("Search for academic papers"),
  }),
  commons: z.string().describe("2-4 keyword search for Wikimedia Commons images"),
});

export const ChartSchema = z.object({
  entries: z.array(z.object({
    term: z.string(),
    summary: z.string(),
    detail: z.string(),
    sources: z.array(z.string()),
    confidence: z.enum(["established", "debated", "speculative"]),
    media: z.array(z.string()).describe("Tags of MEDIA items that show this entry; empty if none fit"),
    image_query: z.string().describe("2-4 keywords for Wikimedia Commons, or empty"),
  })),
});

function wrapApiError(e) {
  if (e instanceof AppError) return e;
  if (e instanceof Anthropic.APIUserAbortError) return e;
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError)
    return new AppError("claude_auth", "The Anthropic API rejected your credentials. Check ANTHROPIC_API_KEY in your .env file.", { fatal: true, source: "claude" });
  if (e instanceof Anthropic.RateLimitError)
    return new AppError("claude_rate", "The Anthropic API is rate limiting requests. Wait a minute and dive again.", { fatal: true, source: "claude" });
  if (e instanceof Anthropic.BadRequestError)
    return new AppError("claude_bad_request", `The Anthropic API rejected the request: ${e.message}`, { source: "claude" });
  if (e instanceof Anthropic.APIError)
    return new AppError("claude_api", `The Anthropic API returned an error (${e.status ?? "network"}). Try again shortly.`, { source: "claude" });
  if (e instanceof Anthropic.APIConnectionError)
    return new AppError("claude_network", "Couldn't reach the Anthropic API. Check the server's network connection.", { fatal: true, source: "claude" });
  return e;
}

export function createClaude({ client } = {}) {
  let anthropic = client || null;
  const get = () => {
    if (!anthropic) {
      try { anthropic = new Anthropic(); }
      catch (e) { throw new AppError("claude_missing", "No Anthropic credentials found. Set ANTHROPIC_API_KEY in your .env file and restart.", { fatal: true, source: "claude" }); }
    }
    return anthropic;
  };

  return {
    configured: Boolean(client || process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),

    /** One request whose answer must match `schema`. */
    async structured(prompt, schema, { depth, signal } = {}) {
      // create() rather than parse(): parse() throws on unparsable text before
      // stop_reason can be read, which would hide refusals and truncation.
      let msg;
      try {
        msg = await get().beta.messages.create({
          model: modelId(),
          max_tokens: 16000,
          ...FALLBACK,
          output_config: { effort: effortFor(depth), format: betaZodOutputFormat(schema) },
          messages: [{ role: "user", content: prompt }],
        }, { signal });
      } catch (e) { throw wrapApiError(e); }
      if (msg.stop_reason === "refusal")
        throw new AppError("refused", "Claude declined this topic. Try a different one.", { source: "claude" });
      if (msg.stop_reason === "max_tokens")
        throw new AppError("truncated", "Claude's answer ran past the length limit. Try a narrower topic.", { source: "claude" });
      const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
      let parsed;
      try { parsed = schema.safeParse(JSON.parse(text)); } catch { parsed = null; }
      if (!parsed?.success)
        throw new AppError("bad_output", "Claude's answer didn't match the expected format. Dive again.", { source: "claude" });
      return parsed.data;
    },

    /** Streamed prose. Calls onText(delta) as text arrives, onReset() if a fallback model takes over. */
    async stream(prompt, { depth, signal, onText, onReset } = {}) {
      try {
        const stream = get().beta.messages.stream({
          model: modelId(),
          max_tokens: 64000,
          ...FALLBACK,
          output_config: { effort: effortFor(depth) },
          messages: [{ role: "user", content: prompt }],
        }, { signal });
        for await (const event of stream) {
          if (event.type === "content_block_start" && event.content_block.type === "fallback") onReset?.();
          else if (event.type === "content_block_delta" && event.delta.type === "text_delta") onText?.(event.delta.text);
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal")
          throw new AppError("refused", "Claude declined to write this deep dive.", { source: "claude" });
        return { truncated: final.stop_reason === "max_tokens" };
      } catch (e) { throw wrapApiError(e); }
    },
  };
}
