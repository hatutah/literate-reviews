import { describe, it, expect, vi } from "vitest";
import { handleWebhook } from "./webhook";
import type { ReviewJob } from "../shared/jobs";

const SECRET = "test-webhook-secret";

async function sign(body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const hex = [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256=${hex}`;
}

function fakeQueue() {
  const sent: ReviewJob[] = [];
  return {
    send: vi.fn(async (job: ReviewJob) => {
      sent.push(job);
    }),
    sent,
  };
}

const openedPayload = () => JSON.stringify({
  action: "opened",
  installation: { id: 12345 },
  repository: { owner: { login: "octocat" }, name: "hello-world" },
  pull_request: { number: 7, title: "Fix typo", body: "Fixes a typo in the README." },
});

describe("literate-reviews receiver", () => {
  it("verifies HMAC, extracts a ReviewJob, and enqueues it on pull_request.opened", async () => {
    const body = openedPayload();
    const queue = fakeQueue();

    const result = await handleWebhook({
      event: "pull_request",
      body,
      sig: await sign(body),
      secret: SECRET,
      queue,
    });

    expect(result).toEqual({ status: 200, body: "queued" });
    expect(queue.send).toHaveBeenCalledOnce();
    expect(queue.sent[0]).toEqual({
      installationId: 12345,
      owner: "octocat",
      repo: "hello-world",
      pull_number: 7,
      title: "Fix typo",
      body: "Fixes a typo in the README.",
    });
  });

  it("enqueues an empty body when the PR description is null", async () => {
    const body = JSON.stringify({
      action: "opened",
      installation: { id: 12345 },
      repository: { owner: { login: "octocat" }, name: "hello-world" },
      pull_request: { number: 7, title: "Fix typo", body: null },
    });
    const queue = fakeQueue();

    await handleWebhook({
      event: "pull_request",
      body,
      sig: await sign(body),
      secret: SECRET,
      queue,
    });

    expect(queue.sent[0].body).toBe("");
  });

  it("rejects a bad HMAC with 401 and does not enqueue", async () => {
    const queue = fakeQueue();

    const result = await handleWebhook({
      event: "pull_request",
      body: openedPayload(),
      sig: "sha256=deadbeef",
      secret: SECRET,
      queue,
    });

    expect(result.status).toBe(401);
    expect(queue.send).not.toHaveBeenCalled();
  });

  it("ignores non-pull_request events", async () => {
    const body = JSON.stringify({ action: "opened" });
    const queue = fakeQueue();

    const result = await handleWebhook({
      event: "issues",
      body,
      sig: await sign(body),
      secret: SECRET,
      queue,
    });

    expect(result).toEqual({ status: 200, body: "ignored" });
    expect(queue.send).not.toHaveBeenCalled();
  });

  it("ignores pull_request actions other than opened/synchronize", async () => {
    const body = JSON.stringify({
      action: "closed",
      installation: { id: 1 },
      repository: { owner: { login: "o" }, name: "r" },
      pull_request: { number: 1, title: "x" },
    });
    const queue = fakeQueue();

    const result = await handleWebhook({
      event: "pull_request",
      body,
      sig: await sign(body),
      secret: SECRET,
      queue,
    });

    expect(result).toEqual({ status: 200, body: "ignored" });
    expect(queue.send).not.toHaveBeenCalled();
  });
});
