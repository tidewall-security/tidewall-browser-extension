import { getHandler } from "../../handlers/index";

export interface RoundTrip {
  /** A body of the type this site's transport actually delivers. */
  body: unknown;
  /** What the guard would return for it. */
  redacted: string[];
}

export interface RoundTripResult {
  ok: boolean;
  why: string;
}

/**
 * Extract, rewrite, re-extract — the same check `PageGuard` performs before
 * sending, run against a realistic body.
 *
 * Deliberately NOT `typeof handler.promptHttpOutput === "function"`: the base
 * supplies one, so that check passes for every site and proves nothing.
 */
export async function roundTrip(alias: string, fixture: RoundTrip): Promise<RoundTripResult> {
  const handler = getHandler(alias, "block");
  if (!handler) return { ok: false, why: `no handler registered for ${alias}` };

  const before = handler.classifyHttp(fixture.body);
  if (before.kind !== "prompt" && before.kind !== "unsupportedPrompt") {
    return { ok: false, why: `fixture did not extract a prompt (${before.kind})` };
  }
  if (before.prompts.length !== fixture.redacted.length) {
    return { ok: false, why: "fixture replacement count does not match extraction" };
  }

  let rewritten: unknown;
  try {
    rewritten = await handler.promptHttpOutput(fixture.body, fixture.redacted);
  } catch (err) {
    return { ok: false, why: `write-back threw: ${String(err)}` };
  }
  if (rewritten === undefined || rewritten === null) {
    return { ok: false, why: "write-back returned nothing" };
  }

  const after = handler.classifyHttp(rewritten);
  if (after.kind !== "prompt" && after.kind !== "unsupportedPrompt") {
    return { ok: false, why: `rewritten body no longer extracts (${after.kind})` };
  }
  const found = after.prompts;
  if (found.length !== fixture.redacted.length
      || found.some((v, i) => v !== fixture.redacted[i])) {
    return { ok: false, why: `rewritten body extracts ${JSON.stringify(found)}, ` +
                            `expected ${JSON.stringify(fixture.redacted)}` };
  }

  // The original must be gone from the serialised request, not merely absent
  // from what extraction happens to look at.
  const serialised = typeof rewritten === "string" ? rewritten : JSON.stringify(rewritten);
  for (const original of before.prompts) {
    if (original && serialised.includes(original)) {
      return { ok: false, why: `the original text survived in the rewritten body` };
    }
  }
  return { ok: true, why: "" };
}
