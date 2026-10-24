// Queue consumer entrypoint. Picks up each ReviewJob, runs the
// LangGraph chain against the PR diff, and posts the teacher-style
// comment back to GitHub. Isolates the slow work (LLM + API calls)
// from the webhook hot path so failures retry via the queue.

import { App } from "octokit";
import { ChatAnthropic } from "@langchain/anthropic";
import type { ReviewJob } from "../shared/jobs";
import { buildGraph } from "./graph";
import { runReview } from "./review";

interface Env {
  GITHUB_APP_ID: string;
  GITHUB_PRIVATE_KEY: string;
  ANTHROPIC_API_KEY: string;
}

// Isolate-scoped cache. Reusing the App across invocations keeps its
// JWT and installation-token caches warm within an isolate lifetime.
let cachedApp: App | undefined;
function getApp(env: Env): App {
  if (!cachedApp) {
    cachedApp = new App({
      appId: env.GITHUB_APP_ID,
      privateKey: env.GITHUB_PRIVATE_KEY,
    });
  }
  return cachedApp;
}

export default {
  async queue(batch: MessageBatch<ReviewJob>, env: Env) {
    const app = getApp(env);
    const graph = buildGraph(new ChatAnthropic({
      model: "claude-sonnet-4-5",
      apiKey: env.ANTHROPIC_API_KEY,
      maxTokens: 1500,
    }));

    for (const msg of batch.messages) {
      const job = msg.body;
      try {
        const octokit = await app.getInstallationOctokit(job.installationId);
        await runReview({ octokit, job, graph });
        msg.ack();
      } catch (err) {
        console.error("review failed", err);
        msg.retry();
      }
    }
  },
};
