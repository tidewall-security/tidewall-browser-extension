import { describe, it, expect, vi } from "vitest";
import { MistralHandler } from "../../handlers/mistral";

describe("MistralHandler", () => {
  describe("promptHttpInput", () => {
    it("extracts prompt from messageInput format", () => {
      const handler = new MistralHandler("mistral", "block");
      const body = JSON.stringify({
        messageInput: [{ type: "text", text: "Explain neural nets" }],
      });
      const result = handler.promptHttpInput(body);
      expect(result).toEqual(["Explain neural nets"]);
    });

    it("extracts prompt from trpc newChat format", () => {
      const handler = new MistralHandler("mistral", "block");
      const body = JSON.stringify([
        { json: { content: [{ type: "text", text: "New chat message" }] } },
      ]);
      const result = handler.promptHttpInput(body);
      expect(result).toEqual(["New chat message"]);
    });

    it("returns empty array for missing messageInput", () => {
      const handler = new MistralHandler("mistral", "block");
      const body = JSON.stringify({ other: "value" });
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("returns empty array for empty messageInput", () => {
      const handler = new MistralHandler("mistral", "block");
      const body = JSON.stringify({ messageInput: [] });
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("returns empty array for non-text type", () => {
      const handler = new MistralHandler("mistral", "block");
      const body = JSON.stringify({
        messageInput: [{ type: "image", url: "http://img.png" }],
      });
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("sets default model metadata", () => {
      const handler = new MistralHandler("mistral", "block");
      expect(handler.modelName).toBe("Mistral");
      expect(handler.modelVersion).toBe("Mistral 7B");
    });
  });
});

describe("a prompt that mixes text with images", () => {
  // Both shapes are arrays that can mix text with images and attachments.
  // Requiring `[0].type === "text"` meant a message whose first entry was an
  // image failed the branch entirely, fell through, and returned nothing --
  // so the user's text at index 1 reached Mistral unguarded.
  const image = { type: "image", url: "https://uploaded/asset" };

  it("reads the text even when an image comes first", () => {
    const h = new MistralHandler("mistral", "block");
    const body = JSON.stringify({
      messageInput: [image, { type: "text", text: "describe this" }],
    });
    expect(h.promptHttpInput(body)).toEqual(["describe this"]);
  });

  it("reads every text entry, not just the first", () => {
    const h = new MistralHandler("mistral", "block");
    const body = JSON.stringify({
      messageInput: [
        { type: "text", text: "my ssn is 078-05-1120" },
        image,
        { type: "text", text: "and my email" },
      ],
    });
    expect(h.promptHttpInput(body)).toEqual(["my ssn is 078-05-1120", "and my email"]);
  });

  it("does the same for the tRPC content shape", () => {
    const h = new MistralHandler("mistral", "block");
    const body = JSON.stringify([
      { json: { content: [image, { type: "text", text: "hidden behind an image" }] } },
    ]);
    expect(h.promptHttpInput(body)).toEqual(["hidden behind an image"]);
  });

  it("rewrites each text entry in place and leaves the image alone", () => {
    const h = new MistralHandler("mistral", "block");
    const body = JSON.stringify({
      messageInput: [
        { type: "text", text: "ssn 078-05-1120" },
        image,
        { type: "text", text: "and more" },
      ],
    });
    const out = JSON.parse(h.promptHttpOutput(body, ["ssn [REDACTED]", "and more"]) as string);
    expect(out.messageInput).toEqual([
      { type: "text", text: "ssn [REDACTED]" },
      image,
      { type: "text", text: "and more" },
    ]);
  });

  it("round-trips: what it rewrote is what it re-extracts", () => {
    const h = new MistralHandler("mistral", "block");
    const body = JSON.stringify({
      messageInput: [{ type: "text", text: "one" }, image, { type: "text", text: "two" }],
    });
    const redacted = ["ONE", "TWO"];
    expect(h.promptHttpInput(h.promptHttpOutput(body, redacted))).toEqual(redacted);
  });
});

describe("start mode still reachable behind an array", () => {
  // A regression introduced while fixing the zero-index leak and caught in
  // review: returning early on merely HAVING `messageInput` meant
  // `{mode: "start", messageInput: []}` no longer reached the `q` branch, so a
  // prompt in the query string went to Mistral unguarded.
  // The handler reads `window.location.search`, and there is no window in the
  // node environment these tests run in.
  const withQuery = (q: string, fn: () => void) => {
    vi.stubGlobal("window", { location: { search: `?q=${encodeURIComponent(q)}` } });
    try {
      fn();
    } finally {
      vi.unstubAllGlobals();
    }
  };

  it("an EMPTY messageInput does not shadow the query string", () => {
    withQuery("my ssn is 078-05-1120", () => {
      const h = new MistralHandler("mistral", "block");
      const body = JSON.stringify({ mode: "start", messageInput: [] });
      expect(h.promptHttpInput(body)).toEqual(["my ssn is 078-05-1120"]);
    });
  });

  it("an image-only messageInput does not shadow it either", () => {
    withQuery("my ssn is 078-05-1120", () => {
      const h = new MistralHandler("mistral", "block");
      const body = JSON.stringify({
        mode: "start",
        messageInput: [{ type: "image", url: "https://uploaded/asset" }],
      });
      expect(h.promptHttpInput(body)).toEqual(["my ssn is 078-05-1120"]);
    });
  });

  it("an empty tRPC content array does not shadow it", () => {
    withQuery("secret", () => {
      const h = new MistralHandler("mistral", "block");
      const body = JSON.stringify([{ json: { content: [] } }]);
      // No `mode`, so nothing to fall through TO -- but it must not claim a
      // prompt it does not have either.
      expect(h.promptHttpInput(body)).toEqual([]);
    });
  });
});

describe("a redaction that empties an entry still round-trips", () => {
  // `PageGuard.prove` re-extracts from the rewritten body. If the predicate
  // excluded empty strings, emptying an entry would come back one short and a
  // legitimate rewrite would be refused as unproven.
  it("survives the proof", () => {
    const h = new MistralHandler("mistral", "block");
    const body = JSON.stringify({
      messageInput: [
        { type: "text", text: "delete me" },
        { type: "image", url: "https://uploaded/asset" },
        { type: "text", text: "keep" },
      ],
    });
    const redacted = ["", "keep"];
    expect(h.promptHttpInput(h.promptHttpOutput(body, redacted))).toEqual(redacted);
  });
});
