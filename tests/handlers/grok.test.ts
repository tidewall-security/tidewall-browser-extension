import { describe, it, expect } from "vitest";
import { GrokHandler } from "../../handlers/grok";

describe("GrokHandler", () => {
  describe("promptHttpInput", () => {
    it("extracts message from request body", () => {
      const handler = new GrokHandler("grok", "block");
      const body = JSON.stringify({ message: "What is xAI?" });
      const result = handler.promptHttpInput(body);
      expect(result).toEqual(["What is xAI?"]);
    });

    it("returns empty array for missing message", () => {
      const handler = new GrokHandler("grok", "block");
      const body = JSON.stringify({ other: "value" });
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("returns empty array for empty message", () => {
      const handler = new GrokHandler("grok", "block");
      const body = JSON.stringify({ message: "" });
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("sets default model metadata", () => {
      const handler = new GrokHandler("grok", "block");
      expect(handler.modelName).toBe("Grok");
      expect(handler.modelVersion).toBe("Grok-1");
    });
  });
});
