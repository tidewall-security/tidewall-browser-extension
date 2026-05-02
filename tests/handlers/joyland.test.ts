import { describe, it, expect } from "vitest";
import { JoylandHandler } from "../../handlers/joyland";

describe("JoylandHandler", () => {
  describe("promptHttpInput", () => {
    it("extracts textMsg from request body", () => {
      const handler = new JoylandHandler("joyland", "block");
      const body = JSON.stringify({ textMsg: "Hello character" });
      const result = handler.promptHttpInput(body);
      expect(result).toEqual(["Hello character"]);
    });

    it("returns empty array for missing textMsg", () => {
      const handler = new JoylandHandler("joyland", "block");
      const body = JSON.stringify({ other: "value" });
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("returns empty array for empty textMsg", () => {
      const handler = new JoylandHandler("joyland", "block");
      const body = JSON.stringify({ textMsg: "" });
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("sets default model metadata", () => {
      const handler = new JoylandHandler("joyland", "block");
      expect(handler.modelName).toBe("Hermes 13B");
      expect(handler.modelVersion).toBe("Hermes 13B");
    });
  });
});
