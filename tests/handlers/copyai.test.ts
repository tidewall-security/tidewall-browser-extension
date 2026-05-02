import { describe, it, expect, beforeEach } from "vitest";
import { CopyAIHandler } from "../../handlers/copyai";

beforeEach(() => {
  (globalThis as any).document = {
    querySelector: () => null,
    querySelectorAll: () => [],
  };
});

describe("CopyAIHandler", () => {
  describe("promptHttpInput", () => {
    it("extracts text from request body", () => {
      const handler = new CopyAIHandler("copyai", "block");
      const body = JSON.stringify({ text: "Write a poem" });
      const result = handler.promptHttpInput(body);
      expect(result).toEqual(["Write a poem"]);
    });

    it("returns empty array for missing text", () => {
      const handler = new CopyAIHandler("copyai", "block");
      const body = JSON.stringify({ other: "value" });
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("returns empty array for empty text", () => {
      const handler = new CopyAIHandler("copyai", "block");
      const body = JSON.stringify({ text: "" });
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("sets default model metadata", () => {
      const handler = new CopyAIHandler("copyai", "block");
      expect(handler.modelName).toBe("GPT");
      expect(handler.modelVersion).toBe("GPT-3.5");
    });
  });
});
