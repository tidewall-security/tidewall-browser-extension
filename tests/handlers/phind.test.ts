import { describe, it, expect } from "vitest";
import { PhindHandler } from "../../handlers/phind";

describe("PhindHandler", () => {
  describe("promptWsInput", () => {
    it("extracts query from WebSocket message", () => {
      const handler = new PhindHandler("phind", "block");
      const data = JSON.stringify({ query: "How to sort in Python?" });
      const result = handler.promptWsInput(data);
      expect(result).toEqual(["How to sort in Python?"]);
    });

    it("returns empty array for missing query", () => {
      const handler = new PhindHandler("phind", "block");
      const data = JSON.stringify({ other: "value" });
      expect(handler.promptWsInput(data)).toEqual([]);
    });

    it("returns empty array for empty query", () => {
      const handler = new PhindHandler("phind", "block");
      const data = JSON.stringify({ query: "" });
      expect(handler.promptWsInput(data)).toEqual([]);
    });

    it("sets default model metadata", () => {
      const handler = new PhindHandler("phind", "block");
      expect(handler.modelName).toBe("phind");
      expect(handler.modelVersion).toBe("phind-fast");
    });
  });
});
