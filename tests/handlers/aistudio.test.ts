import { describe, it, expect, beforeEach } from "vitest";
import { AIStudioHandler } from "../../handlers/aistudio";

// Minimal DOM stub for handlers that touch document.querySelector
beforeEach(() => {
  (globalThis as any).document = {
    querySelector: () => null,
    querySelectorAll: () => [],
  };
});

describe("AIStudioHandler", () => {
  describe("promptHttpInput", () => {
    it("extracts prompt from nested array structure", () => {
      const handler = new AIStudioHandler("aistudio", "block");
      const body = JSON.stringify([
        null,
        [
          [[[null, "What is quantum computing?"]]],
        ],
      ]);
      const result = handler.promptHttpInput(body);
      expect(result).toEqual(["What is quantum computing?"]);
    });

    it("extracts last entry from array", () => {
      const handler = new AIStudioHandler("aistudio", "block");
      const body = JSON.stringify([
        null,
        [
          [[[null, "first prompt"]]],
          [[[null, "second prompt"]]],
        ],
      ]);
      const result = handler.promptHttpInput(body);
      expect(result).toEqual(["second prompt"]);
    });

    it("returns empty array for structure mismatch", () => {
      const handler = new AIStudioHandler("aistudio", "block");
      const body = JSON.stringify([null, [[]]]);
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("returns empty array for missing nested structure", () => {
      const handler = new AIStudioHandler("aistudio", "block");
      const body = JSON.stringify([null, []]);
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("sets default model metadata", () => {
      const handler = new AIStudioHandler("aistudio", "block");
      expect(handler.modelName).toBe("Gemini");
      expect(handler.modelVersion).toBe("gemini-2.5-pro");
    });
  });
});
