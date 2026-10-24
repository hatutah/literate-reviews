# Literate Reviews

A GitHub App that posts a short teaching comment on opened and synchronized
pull requests. It explains 1–3 concepts, techniques, patterns, or libraries,
grounding the lesson in the PR description, commit subjects, and diff.
The current prompt requires short verbatim snippets; their headings link to
precise diff lines when matched, with file-level fallbacks.

Two Cloudflare Workers communicate through the `literate-reviews` queue:

- `literate-reviews-webhook` (`src/receiver/index.ts`) verifies the webhook HMAC,
  filters events, and enqueues a shared `ReviewJob`. Its only secret is the webhook secret.
- `literate-reviews-worker` (`src/consumer/index.ts`) uses GitHub App installation
  authentication, fetches the diff and up to 100 commit subjects, invokes a
  single-node LangGraph with `claude-sonnet-4-5`, and posts a comment. Failed
  messages retry through the queue (3 retries, batch size 10, concurrency 4).
  It has no public HTTP endpoint.

Recreated from private `hatutah/abstractloom` snapshot
`d09f89f4d5bb02b076288cbdcbb686f117db3a4e`, using fresh history.
Runtime behavior, teaching prompt, dependencies, and tool pins are preserved.
Project/Worker/queue/tracing names are changed; personal setup values are
placeholders, and personal secret-manager automation is replaced by the manual
setup below. CI validates only and never deploys infrastructure.

## Install and validate

```sh
asdf install
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

Node `24.20.0` and pnpm `11.24.0` are pinned in `.tool-versions`.
Use pnpm and commit `pnpm-lock.yaml`. `pnpm build` runs both Workers through
Wrangler with `--dry-run`; it does not upload or provision anything.
Tests inject a fake model and GitHub client and require no credentials.

## Register and install your GitHub App

The following are manual setup instructions for a future deployment. Replaying
this repository's PRs or pushing to `main` does not perform these steps.

At https://github.com/settings/apps/new, register an App:

- Name: `literate-reviews` (or an available variant).
- Homepage URL: your project URL.
- Webhook URL: a placeholder until you have deployed the receiver.
- Webhook secret: generate your own random value; keep it outside Git.
- Permissions: **Pull requests: Read & write**, **Contents: Read-only**,
  **Metadata: Read-only**.
- Subscribe to **Pull request** events.

Generate and download the App private key. Install the App on your selected
repository. Replace `YOUR_GITHUB_APP_ID` in `wrangler.consumer.toml` with the
App ID from its settings; this is public configuration, not a credential.

## Prepare the private key

Workers uses WebCrypto and requires PKCS#8 (`BEGIN PRIVATE KEY`). Convert the
GitHub PKCS#1 download (`BEGIN RSA PRIVATE KEY`) before configuring the secret.
Replace `YOUR_APP_PRIVATE_KEY.pem` with your local downloaded key path:

```sh
openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt \
  -in /path/to/YOUR_APP_PRIVATE_KEY.pem \
  -out /tmp/literate-reviews-pkcs8.pem
head -1 /tmp/literate-reviews-pkcs8.pem
```

Keep both key files outside the repository. Preserve real PEM line breaks;
literal backslash-n sequences or a single pasted line will fail signing.

## Configure Cloudflare manually

Authenticate Wrangler to your intended Cloudflare account before running these
commands. They create remote resources or set Worker secrets; CI never runs them.
Create the queue once:

```sh
pnpm wrangler queues create literate-reviews
```

Enter your own credentials interactively and pipe the converted PEM via stdin:

```sh
pnpm wrangler secret put GITHUB_WEBHOOK_SECRET -c wrangler.receiver.toml
pnpm wrangler secret put GITHUB_PRIVATE_KEY -c wrangler.consumer.toml < /tmp/literate-reviews-pkcs8.pem
pnpm wrangler secret put ANTHROPIC_API_KEY -c wrangler.consumer.toml
pnpm wrangler secret put LANGSMITH_API_KEY -c wrangler.consumer.toml
rm /tmp/literate-reviews-pkcs8.pem
```

Secrets are scoped per Worker. Do not commit keys, API tokens, `.dev.vars`,
or other local secret files. No credentials or personal secret-manager paths
are supplied by this repository.

LangSmith configuration lives in `wrangler.consumer.toml`: project
`literate-reviews`, tracing enabled, and endpoint `https://api.smith.langchain.com`.
Set your own `LANGSMITH_API_KEY` before deploying with tracing enabled.
`LANGCHAIN_CALLBACKS_BACKGROUND=false` lets traces flush inline before the
Worker invocation ends. Trace runs and failure logs identify `owner/repo#PR`;
trace metadata includes the owner, repository, and pull request number.

## Deploy manually when ready

After the App ID, queue, and secrets are configured, a human can deploy:

```sh
pnpm run deploy
```

Use `pnpm run deploy`, since `pnpm deploy` is pnpm's unrelated built-in command.
Individual scripts are `pnpm run deploy:receiver` and `pnpm run deploy:consumer`.
Set the App webhook URL to the resulting
`literate-reviews-webhook.<YOUR_SUBDOMAIN>.workers.dev` URL.

For local development, use `pnpm dev:receiver` and `pnpm dev:consumer`, with
local bindings/secrets configured for the intended test environment.

## CI and end-to-end validation

`.github/workflows/ci.yml` runs on PRs and pushes to `main`: frozen-lockfile
install, typecheck, tests, and both dry-run builds. It has only read permission
and no deploy job, infrastructure commands, or Cloudflare secrets.

After a future manual deployment, open a PR on a repository where your App is
installed. Expect a teaching comment; pushing another commit should produce
another comment from the `synchronize` event. This live check requires your
App, queue, model credentials, and deployed Workers; unit tests and dry runs
do not establish that the external integrations work.

```sh
pnpm wrangler tail literate-reviews-webhook
pnpm wrangler tail literate-reviews-worker
```
