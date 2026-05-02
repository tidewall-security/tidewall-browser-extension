import { describe, it, expect } from "vitest";
import { YouHandler } from "../../handlers/you";

describe("YouHandler", () => {
  describe("promptHttpInput", () => {
    it("extracts query from request body", () => {
      const handler = new YouHandler("you", "block");
      const body = JSON.stringify({ query: "Best programming languages" });
      const result = handler.promptHttpInput(body);
      expect(result).toEqual(["Best programming languages"]);
    });

    it("returns empty array for missing query", () => {
      const handler = new YouHandler("you", "block");
      const body = JSON.stringify({ other: "value" });
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("returns empty array for empty query", () => {
      const handler = new YouHandler("you", "block");
      const body = JSON.stringify({ query: "" });
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("sets default model metadata", () => {
      const handler = new YouHandler("you", "block");
      expect(handler.modelName).toBe("GPT-4");
      expect(handler.modelVersion).toBe("GPT-4o");
    });
  });
});
