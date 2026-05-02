import { describe, it, expect } from "vitest";
import { AnonChatGPTHandler } from "../../handlers/anonchatgpt";

describe("AnonChatGPTHandler", () => {
  describe("promptHttpInput", () => {
    it("extracts queryText from URL search params", () => {
      const handler = new AnonChatGPTHandler("anonchatgpt", "block");
      const url = new URL("https://example.com/query?queryText=Hello+world");
      const result = handler.promptHttpInput(url);
      expect(result).toEqual(["Hello world"]);
    });

    it("returns empty array when queryText is missing", () => {
      const handler = new AnonChatGPTHandler("anonchatgpt", "block");
      const url = new URL("https://example.com/query?other=value");
      expect(handler.promptHttpInput(url)).toEqual([]);
    });

    it("returns empty array when queryText is empty", () => {
      const handler = new AnonChatGPTHandler("anonchatgpt", "block");
      const url = new URL("https://example.com/query?queryText=");
      expect(handler.promptHttpInput(url)).toEqual([]);
    });

    it("returns empty array for non-URL input", () => {
      const handler = new AnonChatGPTHandler("anonchatgpt", "block");
      expect(handler.promptHttpInput(null)).toEqual([]);
    });

    it("sets default model metadata", () => {
      const handler = new AnonChatGPTHandler("anonchatgpt", "block");
      expect(handler.modelName).toBe("GPT-3");
      expect(handler.modelVersion).toBe("GPT-3");
    });
  });
});
