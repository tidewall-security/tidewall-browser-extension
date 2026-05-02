import { describe, it, expect } from "vitest";
import { GPTOnlineHandler } from "../../handlers/gptonline";

describe("GPTOnlineHandler", () => {
  describe("promptHttpInput", () => {
    it("extracts message from FormData", () => {
      const handler = new GPTOnlineHandler("gptonline", "block");
      const formData = new FormData();
      formData.append("message", "Hello GPT");
      const result = handler.promptHttpInput(formData);
      expect(result).toEqual(["Hello GPT"]);
    });

    it("extracts msg from FormData as fallback", () => {
      const handler = new GPTOnlineHandler("gptonline", "block");
      const formData = new FormData();
      formData.append("msg", "Hello via msg");
      const result = handler.promptHttpInput(formData);
      expect(result).toEqual(["Hello via msg"]);
    });

    it("returns empty array when neither message nor msg present", () => {
      const handler = new GPTOnlineHandler("gptonline", "block");
      const formData = new FormData();
      formData.append("other", "value");
      expect(handler.promptHttpInput(formData)).toEqual([]);
    });

    it("returns empty array for null input", () => {
      const handler = new GPTOnlineHandler("gptonline", "block");
      expect(handler.promptHttpInput(null)).toEqual([]);
    });

    it("sets default model metadata", () => {
      const handler = new GPTOnlineHandler("gptonline", "block");
      expect(handler.modelName).toBe("GPT-3");
      expect(handler.modelVersion).toBe("GPT-3");
    });
  });
});
