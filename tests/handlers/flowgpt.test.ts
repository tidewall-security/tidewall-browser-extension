import { describe, it, expect } from "vitest";
import { FlowGPTHandler } from "../../handlers/flowgpt";

describe("FlowGPTHandler", () => {
  describe("promptHttpInput", () => {
    it("extracts question from request body", () => {
      const handler = new FlowGPTHandler("flowgpt", "block");
      const body = JSON.stringify({ question: "How do computers work?" });
      const result = handler.promptHttpInput(body);
      expect(result).toEqual(["How do computers work?"]);
    });

    it("extracts model metadata when present", () => {
      const handler = new FlowGPTHandler("flowgpt", "block");
      const body = JSON.stringify({ model: "llama-2-70b", question: "test" });
      handler.promptHttpInput(body);
      expect(handler.modelName).toBe("llama-2-70b");
      expect(handler.modelVersion).toBe("llama-2-70b");
    });

    it("returns empty array for missing question", () => {
      const handler = new FlowGPTHandler("flowgpt", "block");
      const body = JSON.stringify({ model: "test" });
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("returns empty array for empty question", () => {
      const handler = new FlowGPTHandler("flowgpt", "block");
      const body = JSON.stringify({ question: "" });
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("sets default model metadata", () => {
      const handler = new FlowGPTHandler("flowgpt", "block");
      expect(handler.modelName).toBe("FlowGPT");
      expect(handler.modelVersion).toBe("FlowGPT");
    });
  });
});
