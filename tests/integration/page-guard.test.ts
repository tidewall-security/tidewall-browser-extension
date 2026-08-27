import { describe, it, expect, vi } from "vitest";
import { PageGuard, requestParts, type GuardBridge } from "../../lib/page-guard";
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
    await guard.inspectHttp("fetch", "https://grok.com/rest/app-chat/conversations/new",
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

    await guard.inspectHttp("fetch", "https://grok.com/rest/app-chat/conversations/new", "POST", body);

    expect(seen[0]).toBe(body);
    expect(typeof seen[0]).not.toBe("string");
  });
});

describe("verdicts", () => {
  it("passes a clean verdict", async () => {
    const { guard } = guardFor("grok", CLEAN);
    const v = await guard.inspectHttp("fetch", "https://grok.com/rest/app-chat/conversations/new",
                                      "POST", JSON.stringify({ message: "hi" }));
    expect(v.action).toBe("pass");
  });

  it("blocks a blocked verdict and runs the site's cleanup", async () => {
    const handler = getHandler("grok", "block")!;
    const ran = vi.fn();
    handler.runOnBlock = ran;
    const b = bridge({ ...CLEAN, blocked: true, summary: "pii" });
    const guard = new PageGuard(handler, "block", b.impl);

    const v = await guard.inspectHttp("fetch", "https://grok.com/rest/app-chat/conversations/new",
                                      "POST", JSON.stringify({ message: "hi" }));
    expect(v.action).toBe("blocked");
    expect(ran).toHaveBeenCalled();
    expect(b.notices[0]).toBe("pii");
  });

  it("applies a transform on a site that can prove the rewrite", async () => {
    const { guard } = guardFor("grok",
      { ...CLEAN, transformed: true, transformedMessages: ["[redacted]"] });
    const v = await guard.inspectHttp("fetch", "https://grok.com/rest/app-chat/conversations/new",
                                      "POST", JSON.stringify({ message: "secret" }));
    expect(v.action).toBe("transformed");
    expect(JSON.stringify(v)).not.toContain("secret");
  });

  it("BLOCKS a transform on a site that cannot", async () => {
    // notion has no write-back, so the proof fails and the call stops —
    // without the site needing to declare anything.
    const { guard } = guardFor("notion",
      { ...CLEAN, transformed: true, transformedMessages: ["[redacted]"] });
    const v = await guard.inspectHttp("fetch", "https://www.notion.so/api/v3/getAssistantReply",
                                      "POST", JSON.stringify({ prompt: "secret" }));
    expect(v.action).not.toBe("transformed");
  });

  it("never asks the guard about a non-matching URL", async () => {
    const { guard, asked } = guardFor("grok");
    const v = await guard.inspectHttp("fetch", "https://grok.com/static/app.js", "GET", null);
    expect(v.action).toBe("pass");
    expect(asked).toHaveLength(0);
  });

  it("never asks the guard about ordinary traffic on a matching URL", async () => {
    const { guard, asked } = guardFor("grok");
    const v = await guard.inspectHttp("fetch", "https://grok.com/rest/app-chat/conversations/new",
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

/**
 * Findings from the code review of tasks 1-3. Each of these shipped a leak
 * or a behaviour change, and each is now held by a test.
 */
describe("the guard call fails closed", () => {
  const badReplies: [string, PromptScanResult | undefined | object][] = [
    ["a relay timeout, which resolves as a bare pass", undefined],
    ["a reply with no verdict at all", {} as PromptScanResult],
    ["a malformed verdict", { blocked: "no" } as unknown as PromptScanResult],
    ["a null verdict", null as unknown as PromptScanResult],
  ];

  it.each(badReplies)("blocks on %s", async (_name, reply) => {
    const handler = getHandler("grok", "block")!;
    const guard = new PageGuard(handler, "block", {
      ask: async () => reply as PromptScanResult,
      report: vi.fn(),
      notify: vi.fn(),
    });
    const v = await guard.inspectHttp("fetch", "https://grok.com/rest/app-chat/conversations/new",
                                      "POST", JSON.stringify({ message: "secret" }));
    expect(v.action).toBe("blocked");
  });

  it("blocks when the bridge itself throws", async () => {
    const handler = getHandler("grok", "block")!;
    const guard = new PageGuard(handler, "block", {
      ask: async () => { throw new Error("relay gone"); },
      report: vi.fn(),
      notify: vi.fn(),
    });
    const v = await guard.inspectHttp("fetch", "https://grok.com/rest/app-chat/conversations/new",
                                      "POST", JSON.stringify({ message: "secret" }));
    expect(v.action).toBe("blocked");
  });
});

describe("capture flags stay per-transport", () => {
  it("does not let a fetch-only handler start guarding XHR", async () => {
    const handler = getHandler("grok", "block")!;   // fetch: true, xmlhttp: false
    expect(handler.captureFetch).toBe(true);
    expect(handler.captureXmlHttp).toBe(false);
    const b = bridge();
    const guard = new PageGuard(handler, "block", b.impl);

    const v = await guard.inspectHttp("xhr", "https://grok.com/rest/app-chat/conversations/new",
                                      "POST", JSON.stringify({ message: "hi" }));
    expect(v.action).toBe("pass");
    expect(b.asked).toHaveLength(0);
  });

  it("still guards the transport the handler actually declares", async () => {
    const { guard, asked } = guardFor("grok");
    await guard.inspectHttp("fetch", "https://grok.com/rest/app-chat/conversations/new",
                            "POST", JSON.stringify({ message: "hi" }));
    expect(asked).toHaveLength(1);
  });
});

describe("fetch(Request) is inspected like any other call", () => {
  it("reads the method and body off the Request, not just init", async () => {
    const req = new Request("https://grok.com/rest/app-chat/conversations/new", {
      method: "POST",
      body: JSON.stringify({ message: "my ssn is 123-45-6789" }),
    });
    const parts = await requestParts(req);
    expect(parts.method).toBe("POST");
    expect(parts.body).toContain("123-45-6789");
  });

  it("still prefers an explicit init over the Request's own values", async () => {
    const req = new Request("https://x/api", { method: "POST", body: "from-request" });
    const parts = await requestParts(req, { method: "GET", body: "from-init" });
    expect(parts.method).toBe("GET");
    expect(parts.body).toBe("from-init");
  });

  it("handles a plain URL string with no body", async () => {
    const parts = await requestParts("https://x/api");
    expect(parts).toEqual({ url: "https://x/api", method: "GET", body: undefined });
  });
});
