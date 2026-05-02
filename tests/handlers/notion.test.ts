import { describe, it, expect } from "vitest";
import { NotionHandler } from "../../handlers/notion";

describe("NotionHandler", () => {
  describe("promptHttpInput", () => {
    it("extracts prompt from user transcript entry with string value", () => {
      const handler = new NotionHandler("notion", "block");
      const body = JSON.stringify({
        transcript: [
          { type: "system", value: "You are helpful" },
          { type: "user", value: "Write a summary" },
        ],
      });
      const result = handler.promptHttpInput(body);
      expect(result).toEqual(["Write a summary"]);
    });

    it("extracts prompt from human transcript entry", () => {
      const handler = new NotionHandler("notion", "block");
      const body = JSON.stringify({
        transcript: [{ type: "human", value: "Hello Notion" }],
      });
      const result = handler.promptHttpInput(body);
      expect(result).toEqual(["Hello Notion"]);
    });

    it("extracts prompt from nested array value", () => {
      const handler = new NotionHandler("notion", "block");
      const body = JSON.stringify({
        transcript: [{ type: "user", value: [["Nested prompt"]] }],
      });
      const result = handler.promptHttpInput(body);
      expect(result).toEqual(["Nested prompt"]);
    });

    it("extracts prompt from XML-wrapped value", () => {
      const handler = new NotionHandler("notion", "block");
      const body = JSON.stringify({
        transcript: [
          { type: "user", value: "<chat><text>XML wrapped prompt</text></chat>" },
        ],
      });
      const result = handler.promptHttpInput(body);
      expect(result).toEqual(["XML wrapped prompt"]);
    });

    it("finds last user entry in transcript (reversed search)", () => {
      const handler = new NotionHandler("notion", "block");
      const body = JSON.stringify({
        transcript: [
          { type: "user", value: "first question" },
          { type: "assistant", value: "response" },
          { type: "user", value: "second question" },
        ],
      });
      const result = handler.promptHttpInput(body);
      expect(result).toEqual(["second question"]);
    });

    it("returns empty array for empty transcript", () => {
      const handler = new NotionHandler("notion", "block");
      const body = JSON.stringify({ transcript: [] });
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("returns empty array for missing transcript", () => {
      const handler = new NotionHandler("notion", "block");
      const body = JSON.stringify({});
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("sets default model metadata", () => {
      const handler = new NotionHandler("notion", "block");
      expect(handler.modelName).toBe("GPT-4");
      expect(handler.modelVersion).toBe("GPT-4o");
    });
  });
});
