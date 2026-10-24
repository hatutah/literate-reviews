// Pure business logic — fetch the diff, run the graph, post the
// comment. No knowledge of queues or env. The Worker entrypoint at
// `./index.ts` wraps this with the queue handler.

import type { ReviewJob } from "../shared/jobs";

export async function runReview({
  octokit, job, graph,
}: {
  octokit: any;
  job: ReviewJob;
  graph: {
    invoke: (
      s: { diff: string; title: string; body: string; commits: string },
    ) => Promise<{ review: string }>;
  };
}) {
  const [diff, commitList] = await Promise.all([
    octokit.request("GET /repos/{owner}/{repo}/pulls/{pull_number}", {
      owner: job.owner,
      repo: job.repo,
      pull_number: job.pull_number,
      mediaType: { format: "diff" },
    }),
    // First page only — 100 commits of messages is plenty of intent
    // signal for the prompt.
    octokit.rest.pulls.listCommits({
      owner: job.owner,
      repo: job.repo,
      pull_number: job.pull_number,
      per_page: 100,
    }),
  ]);

  const commits = commitList.data
    .map((c: { commit: { message: string } }) => c.commit.message.split("\n")[0])
    .join("\n");

  const rawDiff = diff.data as unknown as string;
  const { review } = await graph.invoke(
    { diff: rawDiff, title: job.title, body: job.body, commits },
  );

  await octokit.rest.issues.createComment({
    owner: job.owner,
    repo: job.repo,
    issue_number: job.pull_number,
    body: review,
  });
}
