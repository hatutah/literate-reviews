// LangGraph wiring for the teacher pass. One `analyze` node feeds the
// PR title and diff into the LLM and returns the review body.
//
// Kept as a factory (`buildGraph`) so tests can inject a fake LLM
// implementing the same `invoke` surface as ChatAnthropic. The prompt
// lives in `./prompts/analyze.md` — imported as a string via the
// wrangler `Text` rule and the vitest `md-as-text` plugin.

import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import analyzePrompt from "./prompts/analyze.md";

export const ReviewState = Annotation.Root({
  diff:    Annotation<string>,
  title:   Annotation<string>,
  body:    Annotation<string>,
  commits: Annotation<string>,
  review:  Annotation<string>,
});

export function buildGraph(llm: {
  invoke: (msgs: Array<{ role: string; content: string }>) => Promise<{ content: unknown }>;
}) {
  const analyze = async (s: typeof ReviewState.State) => {
    const sections = [`PR: ${s.title}`];
    if (s.body) sections.push(`Description:\n${s.body}`);
    if (s.commits) sections.push(`Commit messages:\n${s.commits}`);
    sections.push(`Changes:\n${s.diff}`);
    const res = await llm.invoke([
      { role: "system", content: analyzePrompt },
      { role: "user", content: sections.join("\n\n") },
    ]);
    return { review: String(res.content) };
  };

  return new StateGraph(ReviewState)
    .addNode("analyze", analyze)
    .addEdge(START, "analyze")
    .addEdge("analyze", END)
    .compile();
}
