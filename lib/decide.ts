/**
 * What to do with a request, given the guard's verdict.
 *
 * Pure and separate from the message plumbing, because this is the decision
 * worth testing and it was previously spread across three near-identical
 * branches of an event handler — where fetch handled `transformed` and XHR and
 * WebSocket silently did not.
 */

import type { PromptScanResult } from "./types";

/** Shown when the guard redacted something the extension cannot write back. */
export const CANNOT_REWRITE =
  "Blocked: this prompt contained content that had to be removed, and this site's " +
  "request format cannot be safely rewritten.";

/**
 * Whether an extraction result is worth asking the guard about.
 *
 * Empty extraction used to fall back to guarding the RAW BODY. Poe and AI
 * Studio intercept nearly every request by design, so an ordinary unrelated
 * call could draw a transform verdict and — once transforms block — be
 * blocked for it. Empty means "not a prompt request" here; telling that apart
 * from "a prompt request I cannot read" needs request identity, which is what
 * the typed outcomes add next.
 */
export function shouldGuard(prompts: string[]): boolean {
  return prompts.length > 0;
}

export type RequestVerdict =
  | { action: "pass" }
  | { action: "blocked"; summary: string };

/**
 * A `transformed` verdict BLOCKS.
 *
 * The guard found sensitive content and returned a redacted version, and
 * nothing here can apply one: the per-site write-backs are never called, and
 * the generic rebuild only handled a top-level `messages` array of string
 * `content` — a shape no supported site actually sends. Ten of the twelve
 * sites with a write-back have no `messages` key at all; the two that do hold
 * `{parts:[]}` and `fragments[]`, which the generic map corrupted.
 *
 * Passing the original while telling the user it was redacted is worse than
 * blocking, so until a rewrite can be PROVEN to have been applied, this
 * declines. Restoring the capability is the rest of the plan.
 */
export function decideRequest(result: PromptScanResult): RequestVerdict {
  if (result.blocked) {
    return { action: "blocked", summary: result.summary };
  }
  if (result.transformed) {
    return { action: "blocked", summary: CANNOT_REWRITE };
  }
  return { action: "pass" };
}
