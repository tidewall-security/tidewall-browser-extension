import { describe, it, expect, beforeEach } from "vitest";
import { AskanAIHandler } from "../../handlers/askanai";

beforeEach(() => {
  (globalThis as any).document = {
    querySelector: () => null,
    querySelectorAll: () => [],
  };
});

describe("AskanAIHandler", () => {
  describe("promptHttpInput", () => {
    it("returns empty array when DOM input not found", () => {
      const handler = new AskanAIHandler("askanai", "block");
      expect(handler.promptHttpInput("anything")).toEqual([]);
    });

    it("extracts value when DOM input exists", () => {
      (globalThis as any).document = {
        querySelector: (sel: string) => {
          if (sel === "#sppb-form-builder-field-0") {
            return { value: "User question" };
          }
          return null;
        },
        querySelectorAll: () => [],
      };
      const handler = new AskanAIHandler("askanai", "block");
      expect(handler.promptHttpInput("anything")).toEqual(["User question"]);
    });

    it("sets default model metadata", () => {
      const handler = new AskanAIHandler("askanai", "block");
      expect(handler.modelName).toBe("GPT-3");
      expect(handler.modelVersion).toBe("GPT-3.5");
    });
  });
});
