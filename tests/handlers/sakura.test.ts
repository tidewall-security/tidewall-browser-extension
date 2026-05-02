import { describe, it, expect } from "vitest";
import { SakuraHandler } from "../../handlers/sakura";

describe("SakuraHandler", () => {
  describe("promptHttpInput", () => {
    it("extracts content from action field", () => {
      const handler = new SakuraHandler("sakura", "block");
      const body = JSON.stringify({ action: { content: "Hello Sakura" } });
      const result = handler.promptHttpInput(body);
      expect(result).toEqual(["Hello Sakura"]);
    });

    it("returns empty array for missing action", () => {
      const handler = new SakuraHandler("sakura", "block");
      const body = JSON.stringify({ other: "value" });
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("returns empty array for missing content", () => {
      const handler = new SakuraHandler("sakura", "block");
      const body = JSON.stringify({ action: {} });
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("returns empty array for empty content", () => {
      const handler = new SakuraHandler("sakura", "block");
      const body = JSON.stringify({ action: { content: "" } });
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("sets default model metadata", () => {
      const handler = new SakuraHandler("sakura", "block");
      expect(handler.modelName).toBe("Dragonfruit");
      expect(handler.modelVersion).toBe("Dragonfruit");
    });
  });
});
