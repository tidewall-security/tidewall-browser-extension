import { describe, it, expect } from "vitest";
import { PoeHandler } from "../../handlers/poe";

describe("PoeHandler", () => {
  describe("promptHttpInput", () => {
    it("extracts query from sendMessageMutation", () => {
      const handler = new PoeHandler("poe", "block");
      const body = JSON.stringify({
        queryName: "sendMessageMutation",
        variables: { query: "Explain quantum computing" },
      });
      const result = handler.promptHttpInput(body);
      expect(result).toEqual(["Explain quantum computing"]);
    });

    it("extracts bot model name", () => {
      const handler = new PoeHandler("poe", "block");
      const body = JSON.stringify({
        queryName: "sendMessageMutation",
        bot: "Claude-3.5-Sonnet",
        variables: { query: "test" },
      });
      handler.promptHttpInput(body);
      expect(handler.modelName).toBe("Claude-3.5-Sonnet");
      expect(handler.modelVersion).toBe("Claude-3.5-Sonnet");
    });

    it("returns empty array for non-sendMessageMutation queries", () => {
      const handler = new PoeHandler("poe", "block");
      const body = JSON.stringify({
        queryName: "otherMutation",
        variables: { query: "test" },
      });
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("returns empty array for missing variables", () => {
      const handler = new PoeHandler("poe", "block");
      const body = JSON.stringify({ queryName: "sendMessageMutation" });
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("returns empty array for empty query", () => {
      const handler = new PoeHandler("poe", "block");
      const body = JSON.stringify({
        queryName: "sendMessageMutation",
        variables: { query: "" },
      });
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("sets default model metadata", () => {
      const handler = new PoeHandler("poe", "block");
      expect(handler.modelName).toBe("GPT-4");
      expect(handler.modelVersion).toBe("GPT-4o");
    });
  });
});
