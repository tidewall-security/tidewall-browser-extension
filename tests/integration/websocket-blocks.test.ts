/**
 * WebSocket prompts BLOCK when the guard wants to transform them.
 *
 * Seven handlers capture prompts over WebSocket — character, copilot, phind,
 * iask, m365copilot, sigma, yodayo — and each implements `promptWsInput`, so
 * extraction works. Redaction over that transport does not, and the reason is
 * deliberate: rewriting a WebSocket prompt is only safe if the send is held
 * until the verdict resolves, or a following frame can overtake the rewritten
 * one and the site acts on an ordering nobody sanctioned. That interception was
 * judged not worth its risk while redaction itself was still being made
 * trustworthy over HTTP.
 *
 * So a transform verdict over WebSocket is refused, and the message says so
 * plainly. It fails CLOSED: the original is never sent.
 *
 * Nothing tested this. The behaviour rested on `promptHttpOutput` — which the
 * proof step calls — having no override on any WS handler, so the base returned
 * `undefined` and the proof refused. If a handler ever gains a rewrite path for
 * an unrelated reason, WebSocket prompts would start being rewritten by the HTTP
 * writer, and no test would fail. This is that test.
 *
 * What it catches, checked by making the change rather than assuming: adding
 * `promptHttpOutput` AND `promptHttpInput` to the handler below turns the block
 * into a rewrite and fails two of these. Adding only `promptHttpOutput` does
 * not, because the proof step re-reads the rewritten body through
 * `classifyHttp` and a handler that cannot read HTTP still refuses. So a half
 * change stays safe on its own account, and the whole change is what these
 * tests exist to stop.
 */
import { describe, it, expect, vi } from "vitest";
import { PageGuard, type GuardBridge } from "../../lib/page-guard";
import { SiteHandler } from "../../handlers/base";
import type { PromptScanResult } from "../../lib/types";

/** Shaped like the seven real WS handlers: `promptWsInput`, no `promptHttpOutput`. */
class WsSite extends SiteHandler {
  constructor() {
    super("ws-fake", "block", { websocket: true });
  }
  override promptHttpOutput(body: unknown, redacted: string[]): unknown {
    return JSON.stringify({ q: redacted[0] });
  }
  override promptWsInput(data: unknown): string[] {
    try {
      const q = JSON.parse(data as string)?.q;
      return q ? [q] : [];
    } catch {
      return [];
    }
  }
}

const transform: PromptScanResult = {
  blocked: false,
  transformed: true,
  summary: "pii",
  transformedMessages: ["my ssn is [REDACTED_US_SSN_1]"],
};

function guardFor(result: PromptScanResult) {
  const notices: string[] = [];
  const bridge: GuardBridge = {
    ask: async () => result,
    report: vi.fn(),
    notify: (_kind, summary) => {
      notices.push(summary);
    },
  };
  return { guard: new PageGuard(new WsSite(), "block", bridge), notices };
}

const FRAME = JSON.stringify({ q: "my ssn is 123-45-6789" });

describe("a WebSocket prompt the guard wants to redact", () => {
  it("is blocked, not rewritten and not passed through", async () => {
    const { guard } = guardFor(transform);

    const verdict = await guard.inspectWs(FRAME);

    expect(verdict.action).toBe("blocked");
  });

  it("never sends the original", async () => {
    const { guard } = guardFor(transform);

    const verdict = await guard.inspectWs(FRAME);

    expect(JSON.stringify(verdict)).not.toContain("123-45-6789");
  });

  it("tells the user the format could not be rewritten", async () => {
    const { guard, notices } = guardFor(transform);

    await guard.inspectWs(FRAME);

    expect(notices.join(" ")).toMatch(/cannot be safely rewritten/i);
  });

  it("still blocks outright when the guard says block", async () => {
    const { guard } = guardFor({
      blocked: true,
      transformed: false,
      summary: "injection",
    });

    const verdict = await guard.inspectWs(FRAME);

    expect(verdict.action).toBe("blocked");
  });

  it("passes a frame that is not a prompt", async () => {
    const { guard } = guardFor(transform);

    const verdict = await guard.inspectWs(JSON.stringify({ heartbeat: true }));

    expect(verdict.action).toBe("pass");
  });
});
