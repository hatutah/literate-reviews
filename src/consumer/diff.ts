// Unified-diff walking. Pure utility — no LLM, no GitHub, no state.
//
// The teacher's linkifier is the only current consumer, but the shape
// is general enough that any future workflow that needs "given a
// snippet, where does it live in the diff" can use the same helpers.

// One line inside a diff hunk, with the new-file and old-file line
// numbers precomputed. `sign` is the leading `+`, `-`, or ` ` from
// the unified-diff format; `content` is the line body with that
// prefix stripped, so it can be compared directly to a code snippet.
export type DiffLine = {
  sign: " " | "+" | "-";
  content: string;
  newLine: number;
  oldLine: number;
  hunk: number;
};

// Walks a unified diff and returns each changed file's hunk lines
// keyed by the new-file path (the one an anchor addresses).
export function parseDiff(diff: string): Map<string, DiffLine[]> {
  const files = new Map<string, DiffLine[]>();
  let currentPath: string | null = null;
  let newLine = 0;
  let oldLine = 0;
  let hunk = 0;

  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ b/")) {
      currentPath = line.slice(6);
      files.set(currentPath, []);
      continue;
    }
    if (line.startsWith("+++ ") || line.startsWith("--- ")) continue;
    if (line.startsWith("@@")) {
      const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) {
        hunk++;
        oldLine = parseInt(m[1], 10);
        newLine = parseInt(m[2], 10);
      }
      continue;
    }
    if (!currentPath) continue;
    const bucket = files.get(currentPath)!;
    if (line.startsWith("+")) {
      bucket.push({ sign: "+", content: line.slice(1), newLine, oldLine: 0, hunk });
      newLine++;
    } else if (line.startsWith("-")) {
      bucket.push({ sign: "-", content: line.slice(1), newLine: 0, oldLine, hunk });
      oldLine++;
    } else if (line.startsWith(" ")) {
      bucket.push({ sign: " ", content: line.slice(1), newLine, oldLine, hunk });
      newLine++;
      oldLine++;
    }
  }

  return files;
}

// Finds the first place a snippet appears as a contiguous run of
// lines in the file's hunks. Returns the anchor side (`R` for the new
// file, `L` for the old) and the line number GitHub uses for that
// side.
export function findSnippetLocation(
  parsed: Map<string, DiffLine[]>,
  path: string,
  snippet: string,
): { side: "R" | "L"; line: number } | null {
  const fileLines = parsed.get(path);
  if (!fileLines) return null;

  const snippetLines = snippet.split("\n");
  while (snippetLines.length > 0 && snippetLines[snippetLines.length - 1] === "") {
    snippetLines.pop();
  }
  if (snippetLines.length === 0) return null;

  for (let i = 0; i <= fileLines.length - snippetLines.length; i++) {
    let match = true;
    for (let j = 0; j < snippetLines.length; j++) {
      if (
        fileLines[i + j].hunk !== fileLines[i].hunk ||
        fileLines[i + j].content !== snippetLines[j]
      ) {
        match = false;
        break;
      }
    }
    if (!match) continue;
    // Prefer the new-file line number of the first non-deletion line,
    // so the anchor lands on a `R<n>` addition/context line rather
    // than a `L<n>` deletion (deletions get their own anchor form).
    for (let k = 0; k < snippetLines.length; k++) {
      if (fileLines[i + k].sign !== "-") return { side: "R", line: fileLines[i + k].newLine };
    }
    return { side: "L", line: fileLines[i].oldLine };
  }
  return null;
}
