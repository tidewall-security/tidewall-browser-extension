import { describe, it, expect } from "vitest";
import { SigmaHandler } from "../../handlers/sigma";

describe("SigmaHandler", () => {
  describe("promptWsInput", () => {
    it("extracts query from search command", () => {
      const handler = new SigmaHandler("sigma", "block");
      const inner = JSON.stringify({ query: "What is machine learning?" });
      const data = '42["search",' + JSON.stringify(inner) + "]";
      const result = handler.promptWsInput(data);
      expect(result).toEqual(["What is machine learning?"]);
    });

    it("extracts query from followup command", () => {
      const handler = new SigmaHandler("sigma", "block");
      const inner = JSON.stringify({ query: "Tell me more" });
      const data = '42["followup",' + JSON.stringify(inner) + "]";
      const result = handler.promptWsInput(data);
      expect(result).toEqual(["Tell me more"]);
    });

    it("returns empty array for other commands", () => {
      const handler = new SigmaHandler("sigma", "block");
      const inner = JSON.stringify({ query: "test" });
      const data = '42["other",' + JSON.stringify(inner) + "]";
      expect(handler.promptWsInput(data)).toEqual([]);
    });

    it("returns empty array for messages without numeric prefix", () => {
      const handler = new SigmaHandler("sigma", "block");
      expect(handler.promptWsInput("no-prefix")).toEqual([]);
    });

    it("returns empty array for numeric-only messages", () => {
      const handler = new SigmaHandler("sigma", "block");
      expect(handler.promptWsInput("42")).toEqual([]);
    });

    it("sets default model metadata", () => {
      const handler = new SigmaHandler("sigma", "block");
      expect(handler.modelName).toBe("Gemma");
      expect(handler.modelVersion).toBe("Gemma");
    });
  });
});
