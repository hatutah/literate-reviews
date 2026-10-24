// Rewrites the teacher's `From `{path}`:` headings into Markdown links
// to the PR's Files-changed tab. When a fenced code block follows the
// heading and the snippet inside can be located in the diff, the link
// targets that exact line; otherwise it falls back to the file-level
// anchor. GitHub's `#diff-<hash>` anchor is SHA-256(path), so the URL
// is computable without any API call.

import { parseDiff, findSnippetLocation } from "./diff";

export async function linkifyReview(
  review: string,
  diff: string,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<string> {
  const headingPattern = /^From `([^`]+)`:\s*$/gm;
  const paths = new Set<string>();
  for (const m of review.matchAll(headingPattern)) paths.add(m[1]);
  if (paths.size === 0) return review;

  const hashes = new Map<string, string>();
  for (const path of paths) {
    const buf = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(path),
    );
    hashes.set(
      path,
      [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join(""),
    );
  }

  const parsed = parseDiff(diff);
  const prBase = `https://github.com/${owner}/${repo}/pull/${pullNumber}/files`;

  // Pass 1 — heading + fenced code block: resolve the snippet to a
  // line and emit a line-level link. Preserves the code block unchanged.
  const withBlock = /^(From `([^`]+)`:)(\s*\n\s*)(```[^\n]*\n([\s\S]*?)\n```)/gm;
  let out = review.replace(withBlock, (all, _heading, path: string, ws: string, block: string, snippet: string) => {
    const loc = findSnippetLocation(parsed, path, snippet);
    if (!loc) return all;
    const url = `${prBase}#diff-${hashes.get(path)}${loc.side}${loc.line}`;
    return `From [\`${path}\`](${url}):${ws}${block}`;
  });

  // Pass 2 — any heading still in its plain form (no fenced block, or
  // snippet not found) falls back to the file-level anchor.
  out = out.replace(headingPattern, (_all, path: string) => {
    const url = `${prBase}#diff-${hashes.get(path)}`;
    return `From [\`${path}\`](${url}):`;
  });

  return out;
}
