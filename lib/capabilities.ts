/**
 * What each site can actually do about a redaction verdict.
 *
 * This is DOCUMENTATION, not enforcement. Enforcement is the proof in
 * `PageGuard`: a site with no working write-back fails it and blocks, whether
 * or not it is listed here. The list exists so an operator can be told which
 * sites can be redacted rather than having to discover it by being blocked.
 *
 * Documentation that can drift is exactly the defect this whole change is
 * about, so `tests/contract/capability.test.ts` PROVES every entry by running
 * a redaction round trip. `redact` must pass it; `block-only` must fail it.
 */
export type Capability =
  /** A verified write-back exists: a redaction verdict can be applied. */
  | "redact"
  /** Readable but not rewritable — a redaction verdict blocks the call. */
  | "block-only";

/**
 * Sites able to apply a redaction. Everything else in the registry is
 * `block-only`, which is the honest default: the base write-back returns
 * nothing, so the proof fails.
 *
 * Empty on purpose right now — migration is per site, and a site joins this
 * list in the same commit that gives it a real write-back and a round-trip
 * test.
 */
export const REDACTING_SITES: ReadonlySet<string> = new Set<string>([
  "grok",
  "claude",
  "deepseek",
  "poe",
  "you",
  "perplexity",
  "chatgpt",
  "gemini",
  "glean",
  "meta",
  "aistudio",
]);

/**
 * Deliberately absent, and why.
 *
 * `mistral` can rewrite two of its three request shapes, but its
 * `mode: "start"` path reads the prompt from `window.location.search` — which
 * no request rewrite can change, and which the browser has already sent. A
 * site-level declaration cannot say "these two paths but not that one", so it
 * stays `block-only`: the runtime proof still lets its rewritable paths
 * through per call, and the documentation under-reports rather than over-
 * reports. Under-reporting is the safe direction for a claim about security.
 */

export function capabilityOf(alias: string): Capability {
  return REDACTING_SITES.has(alias) ? "redact" : "block-only";
}
