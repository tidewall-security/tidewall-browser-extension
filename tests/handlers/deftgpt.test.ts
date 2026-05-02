import { describe, it, expect } from "vitest";
import { DeftGPTHandler } from "../../handlers/deftgpt";

describe("DeftGPTHandler", () => {
  describe("promptHttpInput", () => {
    it("extracts message from request body", () => {
      const handler = new DeftGPTHandler("deftgpt", "block");
      const body = JSON.stringify({ message: "Summarize this" });
      const result = handler.promptHttpInput(body);
      expect(result).toEqual(["Summarize this"]);
    });

    it("extracts and normalizes model name", () => {
      const handler = new DeftGPTHandler("deftgpt", "block");
      const body = JSON.stringify({ model: "gpt-4", message: "test" });
      handler.promptHttpInput(body);
      expect(handler.modelName).toBe("GPT-4");
      expect(handler.modelVersion).toBe("GPT-4");
    });

    it("returns empty array for missing message", () => {
      const handler = new DeftGPTHandler("deftgpt", "block");
      const body = JSON.stringify({ model: "gpt-4" });
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("returns empty array for empty message", () => {
      const handler = new DeftGPTHandler("deftgpt", "block");
      const body = JSON.stringify({ message: "" });
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("sets default model metadata", () => {
      const handler = new DeftGPTHandler("deftgpt", "block");
      expect(handler.modelName).toBe("GPT");
      expect(handler.modelVersion).toBe("GPT-4.1");
    });
  });
});
