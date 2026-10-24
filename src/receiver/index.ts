// Webhook receiver entrypoint. Kept dependency-free (no octokit, no
// langchain) so the cold-start on the hot webhook path stays small.

import type { ReviewJob } from "../shared/jobs";
import { handleWebhook } from "./webhook";

interface Env {
  GITHUB_WEBHOOK_SECRET: string;
  REVIEWS: Queue<ReviewJob>;
}

export default {
  async fetch(req: Request, env: Env) {
    const result = await handleWebhook({
      event: req.headers.get("x-github-event") ?? "",
      body: await req.text(),
      sig: req.headers.get("x-hub-signature-256") ?? "",
      secret: env.GITHUB_WEBHOOK_SECRET,
      queue: env.REVIEWS,
    });
    return new Response(result.body, { status: result.status });
  },
};
