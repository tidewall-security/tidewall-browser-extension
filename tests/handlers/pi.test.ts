import { describe, it, expect } from "vitest";
import { PiHandler } from "../../handlers/pi";

describe("PiHandler", () => {
  describe("promptHttpInput", () => {
    it("extracts text from request body", () => {
      const handler = new PiHandler("pi", "block");
      const body = JSON.stringify({ text: "Tell me something interesting" });
      const result = handler.promptHttpInput(body);
      expect(result).toEqual(["Tell me something interesting"]);
    });

    it("returns empty array for missing text", () => {
      const handler = new PiHandler("pi", "block");
      const body = JSON.stringify({ other: "value" });
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("returns empty array for empty text", () => {
      const handler = new PiHandler("pi", "block");
      const body = JSON.stringify({ text: "" });
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("sets default model metadata", () => {
      const handler = new PiHandler("pi", "block");
      expect(handler.modelName).toBe("Inflection");
      expect(handler.modelVersion).toBe("Inflection-2.5");
    });
  });
});
