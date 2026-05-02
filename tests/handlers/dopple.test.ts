import { describe, it, expect } from "vitest";
import { DoppleHandler } from "../../handlers/dopple";

describe("DoppleHandler", () => {
  describe("promptHttpInput", () => {
    it("extracts userQuery from request body", () => {
      const handler = new DoppleHandler("dopple", "block");
      const body = JSON.stringify({ userQuery: "Tell me a joke" });
      const result = handler.promptHttpInput(body);
      expect(result).toEqual(["Tell me a joke"]);
    });

    it("returns empty array for missing userQuery", () => {
      const handler = new DoppleHandler("dopple", "block");
      const body = JSON.stringify({ other: "value" });
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("returns empty array for empty userQuery", () => {
      const handler = new DoppleHandler("dopple", "block");
      const body = JSON.stringify({ userQuery: "" });
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("sets default model metadata", () => {
      const handler = new DoppleHandler("dopple", "block");
      expect(handler.modelName).toBe("Dopple");
      expect(handler.modelVersion).toBe("Dopple");
    });
  });
});
