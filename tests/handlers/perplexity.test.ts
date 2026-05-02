import { describe, it, expect } from "vitest";
import { PerplexityHandler } from "../../handlers/perplexity";

describe("PerplexityHandler", () => {
  describe("promptHttpInput", () => {
    it("extracts query_str from request body", () => {
      const handler = new PerplexityHandler("perplexity", "block");
      const body = JSON.stringify({ query_str: "What is Perplexity?" });
      const result = handler.promptHttpInput(body);
      expect(result).toEqual(["What is Perplexity?"]);
    });

    it("returns empty array for missing query_str", () => {
      const handler = new PerplexityHandler("perplexity", "block");
      const body = JSON.stringify({ other: "value" });
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("returns empty array for empty query_str", () => {
      const handler = new PerplexityHandler("perplexity", "block");
      const body = JSON.stringify({ query_str: "" });
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("sets default model metadata", () => {
      const handler = new PerplexityHandler("perplexity", "block");
      expect(handler.modelName).toBe("GPT-3.5");
      expect(handler.modelVersion).toBe("GPT-3.5");
    });
  });
});
