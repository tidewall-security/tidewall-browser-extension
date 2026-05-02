import { describe, it, expect } from "vitest";
import { HereForYouHandler } from "../../handlers/hereforyou";

describe("HereForYouHandler", () => {
  describe("promptHttpInput", () => {
    it("extracts last user message content", () => {
      const handler = new HereForYouHandler("hereforyou", "block");
      const body = JSON.stringify({
        messages: [
          { role: "system", content: "You are helpful" },
          { role: "user", content: "How are you?" },
        ],
      });
      const result = handler.promptHttpInput(body);
      expect(result).toEqual(["How are you?"]);
    });

    it("returns empty array when last message is not from user", () => {
      const handler = new HereForYouHandler("hereforyou", "block");
      const body = JSON.stringify({
        messages: [
          { role: "user", content: "Hi" },
          { role: "assistant", content: "Hello!" },
        ],
      });
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("returns empty array for empty messages", () => {
      const handler = new HereForYouHandler("hereforyou", "block");
      const body = JSON.stringify({ messages: [] });
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("returns empty array for missing messages", () => {
      const handler = new HereForYouHandler("hereforyou", "block");
      const body = JSON.stringify({});
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("sets default model metadata", () => {
      const handler = new HereForYouHandler("hereforyou", "block");
      expect(handler.modelName).toBe("Bell");
      expect(handler.modelVersion).toBe("Bell");
    });
  });
});
