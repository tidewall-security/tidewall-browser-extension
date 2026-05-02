import { describe, it, expect } from "vitest";
import { KukiHandler } from "../../handlers/kuki";

describe("KukiHandler", () => {
  describe("promptHttpInput", () => {
    it("extracts input from URL-encoded body", () => {
      const handler = new KukiHandler("kuki", "block");
      const body = "input=Hello+Kuki&other=value";
      const result = handler.promptHttpInput(body);
      expect(result).toEqual(["Hello Kuki"]);
    });

    it("returns empty array for missing input", () => {
      const handler = new KukiHandler("kuki", "block");
      const body = "other=value";
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("returns empty array for empty input", () => {
      const handler = new KukiHandler("kuki", "block");
      const body = "input=";
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("sets default model metadata", () => {
      const handler = new KukiHandler("kuki", "block");
      expect(handler.modelName).toBe("Kuki");
      expect(handler.modelVersion).toBe("Kuki");
    });
  });
});
