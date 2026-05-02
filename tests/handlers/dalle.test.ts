import { describe, it, expect } from "vitest";
import { DalleHandler } from "../../handlers/dalle";

describe("DalleHandler", () => {
  describe("promptHttpInput", () => {
    it("extracts prompt from FormData", () => {
      const handler = new DalleHandler("dalle", "block");
      const formData = new FormData();
      formData.append("prompt", "A cat in space");
      const result = handler.promptHttpInput(formData);
      expect(result).toEqual(["A cat in space"]);
    });

    it("returns empty array when prompt field is missing", () => {
      const handler = new DalleHandler("dalle", "block");
      const formData = new FormData();
      formData.append("other", "value");
      expect(handler.promptHttpInput(formData)).toEqual([]);
    });

    it("returns empty array for null input", () => {
      const handler = new DalleHandler("dalle", "block");
      expect(handler.promptHttpInput(null)).toEqual([]);
    });

    it("sets default model metadata", () => {
      const handler = new DalleHandler("dalle", "block");
      expect(handler.modelName).toBe("Replicate Ai");
      expect(handler.modelVersion).toBe("Replicate Ai");
    });
  });
});
