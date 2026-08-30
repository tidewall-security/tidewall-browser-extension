/**
 * One guard message per prompt, and the cardinality that depends on it.
 *
 * Nothing tested the content-script-to-background relay, which is why the join
 * that broke every multi-prompt request went unnoticed. These pin the property
 * that matters — the guard is asked about as many things as were extracted —
 * plus a round trip through the real `PageGuard.prove`, which is where the
 * mismatch actually surfaced as a block.
 */
import { describe, it, expect } from "vitest";
import { buildGuardMessages } from "../../lib/guard-request";
import { PageGuard, CARDINALITY, type GuardBridge } from "../../lib/page-guard";
import { getHandler } from "../../handlers/index";

describe("buildGuardMessages", () => {
  it("asks about as many things as were extracted", () => {
    expect(buildGuardMessages(["one", "two", "three"])).toHaveLength(3);
  });

  it("keeps extraction order, because write-back is positional", () => {
    expect(buildGuardMessages(["first", "second"]).map((m) => m.content)).toEqual([
      "first",
      "second",
    ]);
  });

  it("does not join, which is the whole defect", () => {
    const built = buildGuardMessages(["my ssn is 078-05-1120", "and my email"]);
    expect(built).toHaveLength(2);
    for (const m of built) expect(m.content).not.toContain("\n");
  });

  it("every message is a user turn", () => {
    for (const m of buildGuardMessages(["a", "b"])) expect(m.role).toBe("user");
  });

  it("no prompts means no messages, not one empty one", () => {
    expect(buildGuardMessages([])).toEqual([]);
  });
});

describe("a two-part prompt can now be transformed rather than blocked", () => {
  const asset = { asset_pointer: "file-service://photo" };
  const body = JSON.stringify({
    messages: [{ content: { parts: ["my ssn is 078-05-1120", asset, "and my email"] } }],
  });

  /** A bridge that answers with one replacement per prompt, as the guard does. */
  const perPrompt = (transform: (s: string) => string): GuardBridge => ({
    ask: async (prompts: string[]) => ({
      blocked: false,
      transformed: true,
      summary: "redacted",
      transformedMessages: prompts.map(transform),
    }),
    report: () => {},
    notify: () => {},
  });

  it("transforms, where a single joined reply would be refused", async () => {
    const guard = new PageGuard(getHandler("chatgpt", "block")!, "block", perPrompt((s) =>
      s.replace("078-05-1120", "[REDACTED]"),
    ));
    const verdict = await guard.inspectHttp("fetch", "https://chatgpt.com/conversation", "POST", body);

    expect(verdict.action).toBe("transformed");
  });

  it("and a bridge that still joins is refused for cardinality", async () => {
    // The old pipeline, exactly: two prompts extracted, ONE replacement back.
    const notices: string[] = [];
    const joining: GuardBridge = {
      ask: async (prompts: string[]) => ({
        blocked: false,
        transformed: true,
        summary: "redacted",
        transformedMessages: [prompts.join("\n")],
      }),
      report: () => {},
      notify: (_kind, summary) => notices.push(summary),
    };
    const guard = new PageGuard(getHandler("chatgpt", "block")!, "block", joining);
    const verdict = await guard.inspectHttp("fetch", "https://chatgpt.com/conversation", "POST", body);

    expect(verdict.action).toBe("blocked");
    expect(notices[0]).toBe(CARDINALITY);
  });
});
