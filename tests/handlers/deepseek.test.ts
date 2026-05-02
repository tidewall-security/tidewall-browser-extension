import { describe, it, expect } from "vitest";
import { DeepSeekHandler } from "../../handlers/deepseek";

describe("DeepSeekHandler", () => {
  describe("promptHttpInput", () => {
    it("extracts prompt from request body", () => {
      const handler = new DeepSeekHandler("deepseek", "block");
      const body = JSON.stringify({ prompt: "Explain transformers" });
      const result = handler.promptHttpInput(body);
      expect(result).toEqual(["Explain transformers"]);
    });

    it("returns empty array for missing prompt", () => {
      const handler = new DeepSeekHandler("deepseek", "block");
      const body = JSON.stringify({ other: "value" });
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("returns empty array for empty prompt", () => {
      const handler = new DeepSeekHandler("deepseek", "block");
      const body = JSON.stringify({ prompt: "" });
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("sets default model metadata", () => {
      const handler = new DeepSeekHandler("deepseek", "block");
      expect(handler.modelName).toBe("DeepSeek");
      expect(handler.modelVersion).toBe("DeepSeek-V3");
    });
  });

  describe("processEvent", () => {
    it("extracts model from SSE data line", () => {
      const handler = new DeepSeekHandler("deepseek", "block");
      const event = 'data: {"v":{"response":{"model":"DeepSeek-R1"}}}';
      handler.processEvent(event);
      expect(handler.modelVersion).toBe("DeepSeek-R1");
    });

    it("keeps default model when event has no model", () => {
      const handler = new DeepSeekHandler("deepseek", "block");
      handler.processEvent("data: {}");
      expect(handler.modelVersion).toBe("DeepSeek-V3");
    });

    it("handles non-JSON data lines gracefully", () => {
      const handler = new DeepSeekHandler("deepseek", "block");
      handler.processEvent("data: [DONE]");
      expect(handler.modelVersion).toBe("DeepSeek-V3");
    });
  });
});
