# Literate Reviews

A GitHub App that teaches readers about a pull request through a short comment
covering 1–3 concepts, techniques, patterns, or libraries in the changes.

Two Cloudflare Workers connected by a queue separate authenticated webhook
receipt from GitHub API calls and a LangGraph teaching pass using Anthropic.

## Tools

```sh
asdf install
pnpm install --frozen-lockfile
pnpm typecheck
```

Node and pnpm are pinned in `.tool-versions`. Use pnpm and keep `pnpm-lock.yaml`.
Dependencies and the teaching behavior are recreated from Abstractloom snapshot
`d09f89f4d5bb02b076288cbdcbb686f117db3a4e`, with fresh Git history.

This repository does not deploy automatically. Setup instructions will accompany
the Worker configuration; credentials and local secret files must stay outside Git.
