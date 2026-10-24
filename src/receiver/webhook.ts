// Pure business logic — parse, verify, filter, enqueue. No knowledge
// of Request/Response or env plumbing. The Worker entrypoint at
// `./index.ts` wraps this with the fetch handler.

import type { ReviewJob } from "../shared/jobs";

async function verifyHmac(secret: string, body: string, sigHeader: string): Promise<boolean> {
  const expected = sigHeader.startsWith("sha256=") ? sigHeader.slice(7) : sigHeader;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const actual = [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export async function handleWebhook({
  event, body, sig, secret, queue,
}: {
  event: string;
  body: string;
  sig: string;
  secret: string;
  queue: { send: (job: ReviewJob) => Promise<unknown> };
}): Promise<{ status: number; body: string }> {
  if (!(await verifyHmac(secret, body, sig))) {
    return { status: 401, body: "bad signature" };
  }
  if (event !== "pull_request") {
    return { status: 200, body: "ignored" };
  }
  const payload = JSON.parse(body);
  if (payload.action !== "opened" && payload.action !== "synchronize") {
    return { status: 200, body: "ignored" };
  }
  await queue.send({
    installationId: payload.installation.id,
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
    pull_number: payload.pull_request.number,
    title: payload.pull_request.title,
    body: (payload.pull_request.body ?? "").slice(0, 8000),
  });
  return { status: 200, body: "queued" };
}
