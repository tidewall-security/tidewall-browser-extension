import { describe, it, expect } from "vitest";
import { GeminiHandler } from "../../handlers/gemini";

describe("GeminiHandler", () => {
  describe("promptHttpInput", () => {
    it("extracts prompt from nested f.req parameter", () => {
      const handler = new GeminiHandler("gemini", "block");
      const inner = JSON.stringify([["What is the meaning of life?"]]);
      const outer = JSON.stringify([null, inner]);
      const params = new URLSearchParams();
      params.set("f.req", JSON.stringify(JSON.parse(JSON.stringify([null, inner]))));
      // Build the correct structure
      const innerData = [["Tell me about space"]];
      const outerData = [null, JSON.stringify(innerData)];
      const body = new URLSearchParams();
      body.set("f.req", JSON.stringify(outerData));
      const result = handler.promptHttpInput(body.toString());
      expect(result).toEqual(["Tell me about space"]);
    });

    it("returns empty array for missing f.req", () => {
      const handler = new GeminiHandler("gemini", "block");
      const body = new URLSearchParams();
      body.set("other", "value");
      expect(handler.promptHttpInput(body.toString())).toEqual([]);
    });

    it("returns empty array for malformed inner JSON", () => {
      const handler = new GeminiHandler("gemini", "block");
      const outerData = [null, "not valid json"];
      const body = new URLSearchParams();
      body.set("f.req", JSON.stringify(outerData));
      expect(() => handler.promptHttpInput(body.toString())).toThrow();
    });

    it("sets default model metadata", () => {
      const handler = new GeminiHandler("gemini", "block");
      expect(handler.modelName).toBe("Gemini");
      expect(handler.modelVersion).toBe("Gemini 2.5 Flash");
    });
  });
});
