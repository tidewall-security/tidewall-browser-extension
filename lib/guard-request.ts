import type { GuardMessage } from "./types";

/**
 * One guard message per extracted prompt.
 *
 * The content script used to send `prompts.join("\n")` and this used to wrap
 * that single string in one message. `PageGuard.prove` requires one
 * replacement per EXTRACTED prompt, so any handler returning two was refused
 * for cardinality and blocked — every time, permanently, with no way for the
 * user to get a redaction instead.
 *
 * That stayed invisible because no handler returned more than one prompt until
 * the ChatGPT and Mistral extractors were fixed to read every text part rather
 * than element zero.
 *
 * MEASURED, not assumed. Against a real server:
 *
 *   - N messages come back as N, each redacted independently, with distinct
 *     placeholder numbering across them (`LOCATION_1`, `LOCATION_2`)
 *   - detection does not weaken: an injection cut at every word boundary
 *     blocked whether sent joined or as two messages, because the guard
 *     evaluates all of them
 *
 * Order is load-bearing all the way down: replacement `i` is written back to
 * the part that produced prompt `i`.
 */
export function buildGuardMessages(prompts: string[]): GuardMessage[] {
  return prompts.map((content) => ({ role: "user", content }));
}
