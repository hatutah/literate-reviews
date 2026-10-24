// Vitest wiring. The one non-default here is `md-as-text`: it inlines
// `.md` file contents as the module's default export, so
// `import prompt from "./prompts/analyze.md"` works the same way it
// does in the Worker bundle (where wrangler's `Text` module rule
// does the equivalent).
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    {
      name: "md-as-text",
      transform(code, id) {
        if (id.endsWith(".md")) {
          return {
            code: `export default ${JSON.stringify(code)};`,
            map: null,
          };
        }
        return null;
      },
    },
  ],
});
