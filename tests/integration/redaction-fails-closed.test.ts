import { describe, it, expect } from "vitest";
import { decideRequest, shouldGuard, CANNOT_REWRITE } from "../../lib/decide";
import type { PromptScanResult } from "../../lib/types";

/**
 * A transform verdict means the guard found sensitive content and returned a
 * redacted version. Nothing in this extension can currently apply one: the
 * per-site write-backs are never called, and the generic rebuild only handled
 * bodies shaped like OpenAI chat completions — which is no site.
 *
 * So the honest answer is to block, on every transport. Passing the original
 * while telling the user it was redacted is the defect this closes.
 */
const clean: PromptScanResult = { blocked: false, transformed: false, summary: "" };

describe("a transform verdict that cannot be applied", () => {
  it("blocks rather than sending the original", () => {
    const verdict = decideRequest({
      ...clean,
      transformed: true,
      transformedMessages: ["[redacted]"],
    });
    expect(verdict.action).toBe("blocked");
  });

  it("says why, so the user is not told a redaction happened", () => {
    const verdict = decideRequest({ ...clean, transformed: true, transformedMessages: ["x"] });
    expect(verdict.action === "blocked" && verdict.summary).toBe(CANNOT_REWRITE);
  });

  it("blocks even when the guard returns no replacement text at all", () => {
    // `transformed` with an empty vector previously fell through to `pass`,
    // because the old branch required `transformedMessages?.length`.
    expect(decideRequest({ ...clean, transformed: true }).action).toBe("blocked");
    expect(decideRequest({ ...clean, transformed: true, transformedMessages: [] }).action)
      .toBe("blocked");
  });
});

describe("the other verdicts are unchanged", () => {
  it("blocks a blocked verdict, carrying the guard's own summary", () => {
    const verdict = decideRequest({ ...clean, blocked: true, summary: "pii: ssn" });
    expect(verdict.action).toBe("blocked");
    expect(verdict.action === "blocked" && verdict.summary).toBe("pii: ssn");
  });

  it("passes a clean verdict", () => {
    expect(decideRequest(clean).action).toBe("pass");
  });

  it("prefers blocked over transformed when the guard says both", () => {
    const verdict = decideRequest({ ...clean, blocked: true, transformed: true, summary: "b" });
    expect(verdict.action === "blocked" && verdict.summary).toBe("b");
  });
});

describe("empty extraction is not a prompt request", () => {
  it("does not send the raw body to the guard", () => {
    // The fallback guarded the raw body, so a broad-filter site's ordinary
    // traffic could draw a transform verdict and be blocked for it.
    expect(shouldGuard([])).toBe(false);
  });

  it("still guards anything actually extracted", () => {
    expect(shouldGuard(["hello"])).toBe(true);
    expect(shouldGuard(["", "x"])).toBe(true);
  });
});
