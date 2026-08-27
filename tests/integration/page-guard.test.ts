import { describe, it, expect, vi } from "vitest";
import { PageGuard, type GuardBridge } from "../../lib/page-guard";
import { getHandler } from "../../handlers/index";
import type { PromptScanResult } from "../../lib/types";

const CLEAN: PromptScanResult = { blocked: false, transformed: false, summary: "" };

function bridge(result: PromptScanResult = CLEAN) {
  const asked: unknown[][] = [];
  const notices: string[] = [];
  const impl: GuardBridge = {
    ask: async (prompts) => { asked.push(prompts); return result; },
    report: vi.fn(),
    notify: (_kind, summary) => { notices.push(summary); },
  };
  return { impl, asked, notices };
}

function guardFor(alias: string, result: PromptScanResult = CLEAN) {
  const b = bridge(result);
  const handler = getHandler(alias, "block")!;
  return { guard: new PageGuard(handler, "block", b.impl), ...b };
}

/**
 * The whole point of running here: the page world still holds the real
 * request object. The content script only ever saw `String(body)`, so a
 * FormData arrived as "[object FormData]" and no adapter could read — let
 * alone rewrite — it.
 */
describe("the real body reaches the handler", () => {
  it("passes a string body through unflattened", async () => {
    const { guard, asked } = guardFor("grok");
    await guard.inspectHttp("https://grok.com/rest/app-chat/conversations/new",
                            "POST", JSON.stringify({ message: "hello" }));
    expect(asked[0]).toEqual(["hello"]);
  });

  it.each([
    ["FormData", () => { const f = new FormData(); f.append("prompt", "hi"); return f; }],
    ["URLSearchParams", () => new URLSearchParams({ prompt: "hi" })],
    ["Uint8Array", () => new TextEncoder().encode("hi")],
    ["Blob", () => new Blob(["hi"])],
  ])("hands a %s to the handler as itself, not as a string", async (_name, make) => {
    const body = make();
    const seen: unknown[] = [];
    const handler = getHandler("grok", "block")!;
    handler.promptHttpInput = (b: unknown) => { seen.push(b); return []; };
    const b = bridge();
    const guard = new PageGuard(handler, "block", b.impl);

    await guard.inspectHttp("https://grok.com/rest/app-chat/conversations/new", "POST", body);

    expect(seen[0]).toBe(body);
    expect(typeof seen[0]).not.toBe("string");
  });
});

describe("verdicts", () => {
  it("passes a clean verdict", async () => {
    const { guard } = guardFor("grok", CLEAN);
    const v = await guard.inspectHttp("https://grok.com/rest/app-chat/conversations/new",
                                      "POST", JSON.stringify({ message: "hi" }));
    expect(v.action).toBe("pass");
  });

  it("blocks a blocked verdict and runs the site's cleanup", async () => {
    const handler = getHandler("grok", "block")!;
    const ran = vi.fn();
    handler.runOnBlock = ran;
    const b = bridge({ ...CLEAN, blocked: true, summary: "pii" });
    const guard = new PageGuard(handler, "block", b.impl);

    const v = await guard.inspectHttp("https://grok.com/rest/app-chat/conversations/new",
                                      "POST", JSON.stringify({ message: "hi" }));
    expect(v.action).toBe("blocked");
    expect(ran).toHaveBeenCalled();
    expect(b.notices[0]).toBe("pii");
  });

  it("BLOCKS a transform verdict — nothing here can prove a rewrite yet", async () => {
    const { guard } = guardFor("grok", { ...CLEAN, transformed: true, transformedMessages: ["x"] });
    const v = await guard.inspectHttp("https://grok.com/rest/app-chat/conversations/new",
                                      "POST", JSON.stringify({ message: "secret" }));
    expect(v.action).toBe("blocked");
  });

  it("never asks the guard about a non-matching URL", async () => {
    const { guard, asked } = guardFor("grok");
    const v = await guard.inspectHttp("https://grok.com/static/app.js", "GET", null);
    expect(v.action).toBe("pass");
    expect(asked).toHaveLength(0);
  });

  it("never asks the guard about ordinary traffic on a matching URL", async () => {
    const { guard, asked } = guardFor("grok");
    const v = await guard.inspectHttp("https://grok.com/rest/app-chat/conversations/new",
                                      "POST", JSON.stringify({ unrelated: true }));
    expect(v.action).toBe("pass");
    expect(asked).toHaveLength(0);
  });
});

describe("response observation stays here, in the page world", () => {
  it("forwards a scraped answer through the bridge", () => {
    const handler = getHandler("grok", "block")!;
    const b = bridge();
    const guard = new PageGuard(handler, "block", b.impl);
    guard.reportAnswer("the answer");
    expect(b.impl.report).toHaveBeenCalledWith("the answer", expect.anything());
  });
});
