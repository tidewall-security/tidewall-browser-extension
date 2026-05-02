import { describe, it, expect } from "vitest";
import { MetaHandler } from "../../handlers/meta";

describe("MetaHandler", () => {
  describe("promptHttpInput", () => {
    it("extracts message from FormData variables", () => {
      const handler = new MetaHandler("meta", "block");
      const formData = new FormData();
      formData.append(
        "variables",
        JSON.stringify({
          message: { sensitive_string_value: "What is Meta AI?" },
        })
      );
      const result = handler.promptHttpInput(formData);
      expect(result).toEqual(["What is Meta AI?"]);
    });

    it("returns empty array when variables missing", () => {
      const handler = new MetaHandler("meta", "block");
      const formData = new FormData();
      formData.append("other", "value");
      expect(handler.promptHttpInput(formData)).toEqual([]);
    });

    it("returns empty array when message field missing", () => {
      const handler = new MetaHandler("meta", "block");
      const formData = new FormData();
      formData.append("variables", JSON.stringify({ other: "value" }));
      expect(handler.promptHttpInput(formData)).toEqual([]);
    });

    it("returns empty array for non-FormData input", () => {
      const handler = new MetaHandler("meta", "block");
      expect(handler.promptHttpInput("string body")).toEqual([]);
    });

    it("sets default model metadata", () => {
      const handler = new MetaHandler("meta", "block");
      expect(handler.modelName).toBe("Llama");
      expect(handler.modelVersion).toBe("Llama 4");
    });
  });
});
