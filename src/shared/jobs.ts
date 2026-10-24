// The shared contract between the receiver (which enqueues) and the
// consumer (which processes). Lives here — not on either entrypoint —
// so neither Worker's bundle transitively imports the other's file.

export type ReviewJob = {
  installationId: number;
  owner: string;
  repo: string;
  pull_number: number;
  title: string;
  // PR description from the webhook payload, truncated by the receiver
  // to keep the queue message small. Empty string when the author
  // wrote none.
  body: string;
};
