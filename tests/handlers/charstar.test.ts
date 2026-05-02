import { describe, it, expect } from "vitest";
import { CharstarHandler } from "../../handlers/charstar";

describe("CharstarHandler", () => {
  describe("promptHttpInput", () => {
    it("extracts message content from payload", () => {
      const handler = new CharstarHandler("charstar", "block");
      const body = JSON.stringify({
        message: { content: "Hello there" },
      });
      const result = handler.promptHttpInput(body);
      expect(result).toEqual(["Hello there"]);
    });

    it("extracts model metadata when present", () => {
      const handler = new CharstarHandler("charstar", "block");
      const body = JSON.stringify({
        model: "gpt-4-turbo",
        message: { content: "test" },
      });
      handler.promptHttpInput(body);
      expect(handler.modelName).toBe("gpt-4-turbo");
      expect(handler.modelVersion).toBe("gpt-4-turbo");
    });

    it("returns empty array for missing message", () => {
      const handler = new CharstarHandler("charstar", "block");
      const body = JSON.stringify({ model: "test" });
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("returns empty array for empty content", () => {
      const handler = new CharstarHandler("charstar", "block");
      const body = JSON.stringify({ message: { content: "" } });
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("sets default model metadata", () => {
      const handler = new CharstarHandler("charstar", "block");
      expect(handler.modelName).toBe("HAD");
      expect(handler.modelVersion).toBe("HAD");
    });
  });
});
