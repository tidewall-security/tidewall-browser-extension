import { describe, it, expect } from "vitest";
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
