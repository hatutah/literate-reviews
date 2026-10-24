import { describe, it, expect, vi } from "vitest";
import { buildGraph } from "./graph";
import { runReview } from "./review";

describe("literate-reviews consumer runReview", () => {
  it("fetches the diff, runs the graph, and posts the lesson as a comment", async () => {
    const fakeLlm = {
      invoke: vi.fn().mockResolvedValue({
        content: "This PR uses HMAC to verify the webhook payload.",
      }),
    };
    const graph = buildGraph(fakeLlm);

    const createComment = vi.fn().mockResolvedValue(undefined);
    const request = vi.fn().mockResolvedValue({ data: "--- a/x\n+++ b/x\n@@ diff @@" });
    const listCommits = vi.fn().mockResolvedValue({
      data: [
        { commit: { message: "Fix typo in README\n\nlonger explanation body" } },
        { commit: { message: "Address review feedback" } },
      ],
    });
    const octokit = {
      request,
      rest: { issues: { createComment }, pulls: { listCommits } },
    };

    const job = {
      installationId: 42,
      owner: "octocat",
      repo: "hello-world",
      pull_number: 7,
      title: "Fix typo",
      body: "Corrects a typo spotted by a reader.",
    };

    await runReview({ octokit, job, graph });

    expect(request).toHaveBeenCalledWith(
      "GET /repos/{owner}/{repo}/pulls/{pull_number}",
      expect.objectContaining({
        owner: "octocat",
        repo: "hello-world",
        pull_number: 7,
        mediaType: { format: "diff" },
      }),
    );
    expect(listCommits).toHaveBeenCalledWith(
      expect.objectContaining({ owner: "octocat", repo: "hello-world", pull_number: 7 }),
    );
    expect(fakeLlm.invoke).toHaveBeenCalledOnce();
    const userMsg = fakeLlm.invoke.mock.calls[0][0][1].content;
    expect(userMsg).toContain("Description:\nCorrects a typo spotted by a reader.");
    expect(userMsg).toContain("Commit messages:\nFix typo in README\nAddress review feedback");
    expect(userMsg).not.toContain("longer explanation body");
    expect(createComment).toHaveBeenCalledWith({
      owner: "octocat",
      repo: "hello-world",
      issue_number: 7,
      body: "This PR uses HMAC to verify the webhook payload.",
    });
  });
});
