import { describe, it, expect } from "vitest";
import { GleanHandler } from "../../handlers/glean";

describe("GleanHandler", () => {
  describe("promptHttpInput", () => {
    it("extracts text from messages fragments", () => {
      const handler = new GleanHandler("glean", "block");
      const body = JSON.stringify({
        messages: [{ fragments: [{ text: "Search for docs" }] }],
      });
      const result = handler.promptHttpInput(body);
      expect(result).toEqual(["Search for docs"]);
    });

    it("returns empty array for missing messages", () => {
      const handler = new GleanHandler("glean", "block");
      const body = JSON.stringify({});
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("returns empty array for empty fragments", () => {
      const handler = new GleanHandler("glean", "block");
      const body = JSON.stringify({ messages: [{ fragments: [{}] }] });
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("returns empty array for empty text", () => {
      const handler = new GleanHandler("glean", "block");
      const body = JSON.stringify({
        messages: [{ fragments: [{ text: "" }] }],
      });
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("sets default model metadata", () => {
      const handler = new GleanHandler("glean", "block");
      expect(handler.modelName).toBe("Glean");
      expect(handler.modelVersion).toBe("Glean");
    });
  });

  describe("metaHttpInput", () => {
    it("handles null body gracefully", () => {
      const handler = new GleanHandler("glean", "block");
      expect(() => handler.metaHttpInput(null)).not.toThrow();
    });

    it("handles body with user metadata", () => {
      const handler = new GleanHandler("glean", "block");
      expect(() =>
        handler.metaHttpInput({
          user: { name: "Test User", metadata: { email: "test@example.com" } },
        })
      ).not.toThrow();
    });
  });
});
