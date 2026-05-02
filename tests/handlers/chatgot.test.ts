import { describe, it, expect, beforeEach } from "vitest";
import { ChatGOTHandler } from "../../handlers/chatgot";

beforeEach(() => {
  (globalThis as any).document = {
    querySelector: () => null,
    querySelectorAll: () => [],
  };
});

describe("ChatGOTHandler", () => {
  describe("promptHttpInput", () => {
    it("extracts prompt from data", () => {
      const handler = new ChatGOTHandler("chatgot", "block");
      const body = JSON.stringify({ prompt: "Explain gravity" });
      const result = handler.promptHttpInput(body);
      expect(result).toEqual(["Explain gravity"]);
    });

    it("returns empty array for missing prompt", () => {
      const handler = new ChatGOTHandler("chatgot", "block");
      const body = JSON.stringify({ other: "value" });
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("returns empty array for empty prompt", () => {
      const handler = new ChatGOTHandler("chatgot", "block");
      const body = JSON.stringify({ prompt: "" });
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("sets default model metadata", () => {
      const handler = new ChatGOTHandler("chatgot", "block");
      expect(handler.modelName).toBe("Inflection");
      expect(handler.modelVersion).toBe("Inflection-2.5");
    });
  });
});
