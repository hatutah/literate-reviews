import { describe, it, expect } from "vitest";
import { linkifyReview } from "./linkify";

describe("linkifyReview", () => {
  // sha256("src/consumer.ts") — verified against a real GitHub diff URL.
  const consumerHash =
    "720b6bfe5e0c4c43dcef59d90017b3517a0cfaa675b8f017ecf9e29fabfa48ef";

  it("produces a line-level anchor when the snippet is found in the diff", async () => {
    const diff = [
      "diff --git a/src/consumer.ts b/src/consumer.ts",
      "index abc..def 100644",
      "--- a/src/consumer.ts",
      "+++ b/src/consumer.ts",
      "@@ -40,3 +40,5 @@ export function foo() {",
      " unchanged 1",
      " unchanged 2",
      "+added line 1",
      "+added line 2",
      " unchanged 3",
    ].join("\n");
    const review = [
      "### 1. Foo",
      "",
      "From `src/consumer.ts`:",
      "",
      "```ts",
      "added line 1",
      "added line 2",
      "```",
      "",
      "Explanation.",
    ].join("\n");

    const out = await linkifyReview(review, diff, "hatutah", "literate-reviews", 7);

    expect(out).toContain(
      `From [\`src/consumer.ts\`](https://github.com/hatutah/literate-reviews/pull/7/files#diff-${consumerHash}R42):`,
    );
    // The fenced code block that follows the heading must be preserved verbatim.
    expect(out).toContain("```ts\nadded line 1\nadded line 2\n```");
  });

  it("falls back to file-level anchor when the snippet is not found in the diff", async () => {
    const diff = [
      "diff --git a/src/consumer.ts b/src/consumer.ts",
      "--- a/src/consumer.ts",
      "+++ b/src/consumer.ts",
      "@@ -1,1 +1,1 @@",
      " nothing to see here",
    ].join("\n");
    const review = [
      "From `src/consumer.ts`:",
      "",
      "```ts",
      "line not present in the diff",
      "```",
    ].join("\n");

    const out = await linkifyReview(review, diff, "hatutah", "literate-reviews", 7);

    expect(out).toContain(
      `(https://github.com/hatutah/literate-reviews/pull/7/files#diff-${consumerHash}):`,
    );
    expect(out).not.toContain(`#diff-${consumerHash}R`);
  });

  it.each([
    { name: "falls back for a snippet spanning separate hunks", snippet: "first\nsecond", anchor: "" },
    { name: "links a snippet contained in a later hunk", snippet: "second\nthird", anchor: "R100" },
  ])("$name", async ({ snippet, anchor }) => {
    const diff = [
      "diff --git a/src/consumer.ts b/src/consumer.ts",
      "--- a/src/consumer.ts",
      "+++ b/src/consumer.ts",
      "@@ -1,1 +1,1 @@",
      " first",
      "@@ -100,2 +100,2 @@",
      " second",
      " third",
    ].join("\n");
    const review = `From \`src/consumer.ts\`:\n\n\`\`\`ts\n${snippet}\n\`\`\``;

    const out = await linkifyReview(review, diff, "hatutah", "literate-reviews", 7);

    expect(out).toContain(
      `From [\`src/consumer.ts\`](https://github.com/hatutah/literate-reviews/pull/7/files#diff-${consumerHash}${anchor}):`,
    );
    expect(out).toContain(`\`\`\`ts\n${snippet}\n\`\`\``);
  });

  it("falls back to file-level anchor when no fenced code block follows the heading", async () => {
    const diff = "";
    const review = "From `src/consumer.ts`:\n\nsome prose but no code fence.";

    const out = await linkifyReview(review, diff, "hatutah", "literate-reviews", 7);

    expect(out).toContain(
      `From [\`src/consumer.ts\`](https://github.com/hatutah/literate-reviews/pull/7/files#diff-${consumerHash}):`,
    );
  });

  it("leaves review text untouched when no `From` heading is present", async () => {
    const review = "Just a plain LLM comment with no citation headers.";
    const out = await linkifyReview(review, "", "hatutah", "literate-reviews", 7);
    expect(out).toBe(review);
  });
});
