import { describe, it, expect, vi } from "vitest";
import { PageGuard, CARDINALITY, type GuardBridge } from "../../lib/page-guard";
import { SiteHandler } from "../../handlers/base";
import type { PromptScanResult } from "../../lib/types";

/**
 * "The adapter returned a body" is not evidence that a redaction happened.
 * The proof is: re-extract from the rewritten body and require the result to
 * EQUAL the replacement the guard asked for. Absence of the original is not
 * enough — an adapter that writes "" makes the original absent and the
 * prompt gone.
 */
const REDACTED = ["[redacted]"];
const transform = (messages = REDACTED): PromptScanResult =>
  ({ blocked: false, transformed: true, summary: "pii", transformedMessages: messages });

/** A site whose write-back behaviour the test controls. */
class Fake extends SiteHandler {
  constructor(private write: (body: unknown, redacted: string[]) => unknown) {
    super("fake", "block", { fetch: true, disableFilter: true });
  }
  override promptHttpInput(body: unknown): string[] {
    try {
      const v = JSON.parse(body as string)?.prompt;
      return v ? [v] : [];
    } catch { return []; }
  }
  override promptHttpOutput(body: unknown, redacted: string[]): unknown {
    return this.write(body, redacted);
  }
}

function guardFor(write: (body: unknown, redacted: string[]) => unknown,
                  result: PromptScanResult = transform()) {
  const notices: string[] = [];
  const impl: GuardBridge = {
    ask: async () => result,
    report: vi.fn(),
    notify: (_k, s) => { notices.push(s); },
  };
  return { guard: new PageGuard(new Fake(write), "block", impl), notices };
}

const body = JSON.stringify({ prompt: "my ssn is 123-45-6789", keep: "me" });
const inspect = (g: PageGuard) => g.inspectHttp("fetch", "https://x/api", "POST", body);

describe("a faithful rewrite is applied", () => {
  it("sends the rewritten body, not the original", async () => {
    const { guard } = guardFor((b, r) =>
      JSON.stringify({ ...JSON.parse(b as string), prompt: r[0] }));
    const v = await inspect(guard);
    expect(v.action).toBe("transformed");
    expect(v.action === "transformed" && v.body).toContain("[redacted]");
    expect(JSON.stringify(v)).not.toContain("123-45-6789");
  });

  it("leaves unrelated fields alone", async () => {
    const { guard } = guardFor((b, r) =>
      JSON.stringify({ ...JSON.parse(b as string), prompt: r[0] }));
    const v = await inspect(guard);
    expect(v.action === "transformed" && v.body).toContain('"keep":"me"');
  });
});

describe("a rewrite that cannot be proven blocks", () => {
  it("blocks when the adapter writes an empty string", async () => {
    // The DeepSeek shape: `prompt = ""`. Re-extraction returns [] because it
    // filters falsy, so 'the original is absent' is TRUE — and the prompt is
    // gone rather than redacted. Absence alone would have passed this.
    const { guard } = guardFor((b) =>
      JSON.stringify({ ...JSON.parse(b as string), prompt: "" }));
    expect((await inspect(guard)).action).toBe("blocked");
  });

  it("blocks when the adapter returns the body untouched", async () => {
    const { guard } = guardFor((b) => b);
    expect((await inspect(guard)).action).toBe("blocked");
  });

  it("blocks when the adapter writes something other than the guard's text", async () => {
    const { guard } = guardFor((b) =>
      JSON.stringify({ ...JSON.parse(b as string), prompt: "something else" }));
    expect((await inspect(guard)).action).toBe("blocked");
  });

  it("blocks when the adapter returns nothing at all", async () => {
    const { guard } = guardFor(() => undefined);
    expect((await inspect(guard)).action).toBe("blocked");
  });

  it("blocks when the adapter throws", async () => {
    const { guard } = guardFor(() => { throw new Error("no"); });
    expect((await inspect(guard)).action).toBe("blocked");
  });

  it("awaits an adapter that rewrites asynchronously", async () => {
    // Poe's write-back is deliberately async.
    const { guard } = guardFor(async (b, r) =>
      JSON.stringify({ ...JSON.parse(b as string), prompt: r[0] }));
    expect((await inspect(guard)).action).toBe("transformed");
  });
});

describe("cardinality", () => {
  // Asserted on the REASON, not just the outcome. The equality check would
  // block these anyway, so testing only `blocked` cannot tell whether the
  // cardinality check exists — a mutation removing it survived exactly that.
  const write = (b: unknown, r: string[]) =>
    JSON.stringify({ ...JSON.parse(b as string), prompt: r[0] });

  it("rejects a mismatched count before touching the adapter", async () => {
    const touched = vi.fn(write);
    const { guard, notices } = guardFor(touched, transform(["a", "b"]));
    const v = await inspect(guard);
    expect(v.action).toBe("blocked");
    expect(notices[0]).toBe(CARDINALITY);
    expect(touched).not.toHaveBeenCalled();
  });

  it("rejects an empty replacement vector the same way", async () => {
    const touched = vi.fn(write);
    const { guard, notices } = guardFor(touched, transform([]));
    expect((await inspect(guard)).action).toBe("blocked");
    expect(notices[0]).toBe(CARDINALITY);
    expect(touched).not.toHaveBeenCalled();
  });
});

describe("the claim follows the act", () => {
  it("announces a redaction only once it is proven applied", async () => {
    const seen: string[] = [];
    const guard = new PageGuard(
      new Fake((b, r) => JSON.stringify({ ...JSON.parse(b as string), prompt: r[0] })),
      "block",
      { ask: async () => transform(), report: vi.fn(),
        notify: (kind) => { seen.push(kind); } },
    );
    await inspect(guard);
    expect(seen).toEqual(["transformed"]);
  });

  it("never announces a redaction that failed its proof", async () => {
    const seen: string[] = [];
    const guard = new PageGuard(
      new Fake((b) => b),               // returns the body untouched
      "block",
      { ask: async () => transform(), report: vi.fn(),
        notify: (kind) => { seen.push(kind); } },
    );
    await inspect(guard);
    expect(seen).toEqual(["blocked"]);
    expect(seen).not.toContain("transformed");
  });
});
