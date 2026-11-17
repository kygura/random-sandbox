// Vercel functions: each /api route calls the same handler as the local server.
import { createHandler } from "../server.mjs";
import { createClaude } from "../lib/claude.mjs";
import { createExa } from "../lib/exa.mjs";
import { createCommons } from "../lib/commons.mjs";

let handler;
export default function handle(req, res) {
  handler ||= createHandler({ claude: createClaude(), exa: createExa(), commons: createCommons() });
  return handler(req, res);
}
