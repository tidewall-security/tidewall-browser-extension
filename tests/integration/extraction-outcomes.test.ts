import { describe, it, expect } from "vitest";
import { planExtraction } from "../../lib/decide";
import { ChatGPTHandler } from "../../handlers/chatgpt";
import { GrokHandler } from "../../handlers/grok";

/**
 * `string[]` conflated two different answers. An empty array meant either
 * "this is ordinary site traffic" or "this is a prompt request I cannot
 * read", and those need opposite handling: the first must pass, the second
 * must block. Blanket-blocking on empty bricks broad-filter sites; blanket
 * passing is the leak.
 */
describe("planExtraction", () => {
  it("passes ordinary site traffic without calling the guard", () => {
    expect(planExtraction({ kind: "notPrompt" }, "block")).toEqual({ act: "pass" });
  });

  it("guards an extracted prompt", () => {
    const plan = planExtraction({ kind: "prompt", prompts: ["hi"] }, "block");
    expect(plan).toEqual({ act: "guard", prompts: ["hi"] });
  });

  it("still guards a prompt it cannot rewrite, so a clean verdict passes", () => {
    // Salesforce extracts but has no write-back. Inspecting it is worth
    // doing; only a transform verdict it cannot apply should stop the call.
    const plan = planExtraction(
      { kind: "unsupportedPrompt", prompts: ["hi"], reason: "no write-back" }, "block");
    expect(plan).toEqual({ act: "guard", prompts: ["hi"] });
  });

  it("blocks an uninspectable prompt WITHOUT calling the guard", () => {
    // There is no text to obtain a verdict from, so waiting for a transform
    // verdict would never block. This is the state v2 of the design lacked.
    const plan = planExtraction({ kind: "uninspectablePrompt", reason: "selector gone" }, "block");
    expect(plan.act).toBe("block");
  });

  it("lets the mode gate win, including over uninspectable prompts", () => {
    for (const mode of ["discover", "log", "disabled"] as const) {
      expect(planExtraction({ kind: "uninspectablePrompt", reason: "x" }, mode))
        .toEqual({ act: "pass" });
      expect(planExtraction({ kind: "prompt", prompts: ["hi"] }, mode))
        .toEqual({ act: "pass" });
    }
  });
});

/**
 * The shim is what lets 37 handlers stay untouched while the contract
 * changes. It must not alter what any of them currently extract.
 */
describe("the legacy shim preserves existing behaviour", () => {
  it("wraps extracted prompts as `prompt`", () => {
    const handler = new ChatGPTHandler("chatgpt", "block");
    const body = JSON.stringify({ messages: [{ content: { parts: ["Hello world"] } }] });
    expect(handler.classifyHttp(body)).toEqual({ kind: "prompt", prompts: ["Hello world"] });
  });

  it("wraps an empty extraction as `notPrompt`, never as a blockable state", () => {
    const handler = new ChatGPTHandler("chatgpt", "block");
    expect(handler.classifyHttp(JSON.stringify({ action: "get_models" })))
      .toEqual({ kind: "notPrompt" });
  });

  it("survives a body the handler cannot parse", () => {
    // Several extractors throw on malformed JSON; a throw must not become an
    // uncaught error in the classifier.
    const handler = new GrokHandler("grok", "block");
    expect(handler.classifyHttp("not json at all").kind).toBe("notPrompt");
  });

  it("classifies WebSocket frames too", () => {
    // WS redaction is out of scope, but a WS prompt still needs to be
    // guarded rather than inheriting the `[]` ambiguity.
    const handler = new ChatGPTHandler("chatgpt", "block");
    expect(handler.classifyWs("not a frame").kind).toBe("notPrompt");
  });
});
