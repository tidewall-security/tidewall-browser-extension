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
