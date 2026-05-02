import { describe, it, expect } from "vitest";
import { IAskHandler } from "../../handlers/iask";

describe("IAskHandler", () => {
  describe("promptWsInput", () => {
    it("extracts query from form submit event", () => {
      const handler = new IAskHandler("iask", "block");
      const data = JSON.stringify([
        null,
        null,
        null,
        null,
        { type: "form", event: "submit", value: "q=What+is+AI%3F" },
      ]);
      const result = handler.promptWsInput(data);
      expect(result).toEqual(["What is AI?"]);
    });

    it("returns empty array for non-form events", () => {
      const handler = new IAskHandler("iask", "block");
      const data = JSON.stringify([
        null,
        null,
        null,
        null,
        { type: "click", event: "submit", value: "q=test" },
      ]);
      expect(handler.promptWsInput(data)).toEqual([]);
    });

    it("returns empty array for non-submit events", () => {
      const handler = new IAskHandler("iask", "block");
      const data = JSON.stringify([
        null,
        null,
        null,
        null,
        { type: "form", event: "change", value: "q=test" },
      ]);
      expect(handler.promptWsInput(data)).toEqual([]);
    });

    it("returns empty array for short arrays", () => {
      const handler = new IAskHandler("iask", "block");
      const data = JSON.stringify([null, null]);
      expect(handler.promptWsInput(data)).toEqual([]);
    });

    it("returns empty array when q param is missing", () => {
      const handler = new IAskHandler("iask", "block");
      const data = JSON.stringify([
        null,
        null,
        null,
        null,
        { type: "form", event: "submit", value: "other=value" },
      ]);
      expect(handler.promptWsInput(data)).toEqual([]);
    });

    it("sets default model metadata", () => {
      const handler = new IAskHandler("iask", "block");
      expect(handler.modelName).toBe("iAsk Pro");
      expect(handler.modelVersion).toBe("iAsk Pro");
    });
  });
});
