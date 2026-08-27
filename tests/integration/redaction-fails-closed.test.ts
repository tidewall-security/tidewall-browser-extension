import { describe, it, expect } from "vitest";
import { decideRequest, CANNOT_REWRITE } from "../../lib/decide";
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

describe("a transform verdict", () => {
  it("asks for a rewrite rather than being applied on trust", () => {
    // Until proof existed this blocked outright. It now carries the guard's
    // text to PageGuard, which applies it and must PROVE it worked before
    // anything is sent — see proof-of-redaction.test.ts. A transform that
    // cannot be proven still blocks; the guarantee moved, it did not weaken.
    const verdict = decideRequest({
      ...clean,
      transformed: true,
      transformedMessages: ["[redacted]"],
    });
    expect(verdict.action).toBe("rewrite");
    expect(verdict.action === "rewrite" && verdict.redacted).toEqual(["[redacted]"]);
  });

  it("carries an empty vector rather than inventing one", () => {
    // Cardinality is checked against what was extracted, so an empty vector
    // must survive to be compared and rejected — not be padded here.
    const verdict = decideRequest({ ...clean, transformed: true });
    expect(verdict.action === "rewrite" && verdict.redacted).toEqual([]);
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
