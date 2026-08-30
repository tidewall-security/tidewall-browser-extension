import { describe, it, expect } from "vitest";
import { ChatGPTHandler } from "../../handlers/chatgpt";

describe("ChatGPTHandler", () => {
  describe("promptHttpInput", () => {
    it("extracts prompt from ChatGPT message format", () => {
      const handler = new ChatGPTHandler("chatgpt", "block");
      const body = JSON.stringify({
        model: "gpt-4o",
        messages: [{ content: { parts: ["What is the capital of France?"] } }],
      });
      const result = handler.promptHttpInput(body);
      expect(result).toEqual(["What is the capital of France?"]);
    });

    it("extracts model metadata", () => {
      const handler = new ChatGPTHandler("chatgpt", "block");
      const body = JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ content: { parts: ["test"] } }],
      });
      handler.promptHttpInput(body);
      expect(handler.modelVersion).toBe("GPT-4o-mini");
      expect(handler.modelName).toBe("GPT-4o-mini");
    });

    it("handles auto model selection", () => {
      const handler = new ChatGPTHandler("chatgpt", "block");
      const body = JSON.stringify({
        model: "auto",
        messages: [{ content: { parts: ["test"] } }],
      });
      handler.promptHttpInput(body);
      expect(handler.modelVersion).toBe("GPT-5-2");
    });

    it("returns empty array for missing messages", () => {
      const handler = new ChatGPTHandler("chatgpt", "block");
      const body = JSON.stringify({ model: "gpt-4o" });
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("returns empty array for empty parts", () => {
      const handler = new ChatGPTHandler("chatgpt", "block");
      const body = JSON.stringify({
        messages: [{ content: { parts: [] } }],
      });
      expect(handler.promptHttpInput(body)).toEqual([]);
    });
  });
});

describe("a prompt that mixes text with attachment references", () => {
  // `parts` is an array, and reading only element zero was a leak: a message
  // whose first part was an attachment returned that OBJECT as the prompt, so
  // the guard scanned `{asset_pointer: ...}` while the user's real text --
  // sitting at index 1 -- was never inspected at all.
  const asset = { asset_pointer: "file-service://photo", size_bytes: 1 };

  const bodyWith = (parts: unknown[]) =>
    JSON.stringify({ model: "gpt-4o", messages: [{ content: { parts } }] });

  it("reads the text even when an attachment comes first", () => {
    const h = new ChatGPTHandler("chatgpt", "block");
    expect(h.promptHttpInput(bodyWith([asset, "identify this person"]))).toEqual([
      "identify this person",
    ]);
  });

  it("reads every text part, not just the first", () => {
    const h = new ChatGPTHandler("chatgpt", "block");
    expect(h.promptHttpInput(bodyWith(["my ssn is 078-05-1120", asset, "and my email"]))).toEqual([
      "my ssn is 078-05-1120",
      "and my email",
    ]);
  });

  it("never hands the guard a non-string", () => {
    // The precise old failure. `[asset]` returned `[{asset_pointer: ...}]`.
    const h = new ChatGPTHandler("chatgpt", "block");
    for (const p of h.promptHttpInput(bodyWith([asset, "text"]))) {
      expect(typeof p).toBe("string");
    }
  });

  it("rewrites each text part in place and keeps the attachment", () => {
    const h = new ChatGPTHandler("chatgpt", "block");
    const out = h.promptHttpOutput(bodyWith(["ssn 078-05-1120", asset, "and more"]), [
      "ssn [REDACTED]",
      "and more",
    ]);
    // The attachment survives at its own index; previously the whole array was
    // replaced with `[redacted[0]]`, discarding it and any later text.
    expect(JSON.parse(out as string).messages[0].content.parts).toEqual([
      "ssn [REDACTED]",
      asset,
      "and more",
    ]);
  });

  it("round-trips: what it rewrote is what it re-extracts", () => {
    // The proof `PageGuard.prove` performs. Correspondence has to survive the
    // filter, or replacements land on the wrong part.
    const h = new ChatGPTHandler("chatgpt", "block");
    const body = bodyWith(["one", asset, "two"]);
    const redacted = ["ONE", "TWO"];
    expect(h.promptHttpInput(h.promptHttpOutput(body, redacted))).toEqual(redacted);
  });

  it("an attachment with no text at all extracts nothing", () => {
    // Unchanged behaviour, and deliberately so: whether that should block is
    // the open question in issue #17, not something to settle here.
    const h = new ChatGPTHandler("chatgpt", "block");
    expect(h.promptHttpInput(bodyWith([asset]))).toEqual([]);
  });
});

describe("a redaction that empties a part still round-trips", () => {
  it("survives the proof PageGuard performs", () => {
    const h = new ChatGPTHandler("chatgpt", "block");
    const asset = { asset_pointer: "file-service://photo" };
    const body = JSON.stringify({
      messages: [{ content: { parts: ["delete me", asset, "keep"] } }],
    });
    const redacted = ["", "keep"];
    expect(h.promptHttpInput(h.promptHttpOutput(body, redacted))).toEqual(redacted);
  });
});
