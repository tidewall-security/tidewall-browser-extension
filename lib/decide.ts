/**
 * What to do with a request, given the guard's verdict.
 *
 * Pure and separate from the message plumbing, because this is the decision
 * worth testing and it was previously spread across three near-identical
 * branches of an event handler — where fetch handled `transformed` and XHR and
 * WebSocket silently did not.
 */

import type { PromptScanResult, ExtractionOutcome, SiteMode } from "./types";

/** Shown when the guard redacted something the extension cannot write back. */
export const CANNOT_REWRITE =
  "Blocked: this prompt contained content that had to be removed, and this site's " +
  "request format cannot be safely rewritten.";

export type RequestVerdict =
  | { action: "pass" }
  | { action: "blocked"; summary: string }
  /** The guard redacted something. Attempt the rewrite, then PROVE it. */
  | { action: "rewrite"; redacted: string[] }
  /** A rewrite that was applied and verified. `body` is what to send. */
  | { action: "transformed"; body: unknown };

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
    // Not "apply this" — "try to apply this, and block unless it can be
    // shown to have worked". The proof lives in PageGuard, because it needs
    // the real body.
    return { action: "rewrite", redacted: result.transformedMessages ?? [] };
  }
  return { action: "pass" };
}

export type ExtractionPlan =
  | { act: "pass" }
  | { act: "guard"; prompts: string[] }
  | { act: "block"; summary: string };

/** Shown when a request is known to be a prompt but none could be read. */
export const CANNOT_INSPECT =
  "Blocked: this looks like a prompt submission, but its contents could not be " +
  "read, so it could not be checked.";

/**
 * What to do with an extraction outcome, before the guard is involved.
 *
 * The mode gate comes first and wins over everything, including
 * `uninspectablePrompt`: `discover`, `log` and `disabled` promise not to
 * affect the user, and that promise is not conditional on what was extracted.
 */
export function planExtraction(outcome: ExtractionOutcome, mode: SiteMode): ExtractionPlan {
  if (mode !== "block") return { act: "pass" };

  switch (outcome.kind) {
    case "notPrompt":
      return { act: "pass" };
    case "prompt":
    case "unsupportedPrompt":
      // Both are guarded. They diverge only once a rewrite can be proven
      // applied: today every transform blocks either way.
      return { act: "guard", prompts: outcome.prompts };
    case "uninspectablePrompt":
      return { act: "block", summary: CANNOT_INSPECT };
  }
}
