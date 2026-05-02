import { describe, it, expect } from "vitest";
import { ClaudeHandler } from "../../handlers/claude";

describe("ClaudeHandler", () => {
  describe("promptHttpInput", () => {
    it("extracts prompt from request body", () => {
      const handler = new ClaudeHandler("claude", "block");
      const body = JSON.stringify({ prompt: "What is AI?" });
      const result = handler.promptHttpInput(body);
      expect(result).toEqual(["What is AI?"]);
    });

    it("uses lastPrompt for retry_completion without prompt", () => {
      const handler = new ClaudeHandler("claude", "block");
      // First send a normal prompt to store lastPrompt
      handler.promptHttpInput(JSON.stringify({ prompt: "original question" }));
      // Then retry without prompt
      const body = JSON.stringify({ parent_message_uuid: "abc-123" });
      const result = handler.promptHttpInput(body);
      expect(result).toEqual(["original question"]);
    });

    it("returns empty array when no prompt and no lastPrompt", () => {
      const handler = new ClaudeHandler("claude", "block");
      const body = JSON.stringify({ parent_message_uuid: "abc-123" });
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("returns empty array for empty body", () => {
      const handler = new ClaudeHandler("claude", "block");
      const body = JSON.stringify({});
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("sets default model metadata", () => {
      const handler = new ClaudeHandler("claude", "block");
      expect(handler.modelName).toBe("Claude Sonnet 4");
      expect(handler.modelVersion).toBe("claude-sonnet-4-20250514");
    });
  });

  describe("metaHttpInput", () => {
    it("extracts model version from api_model", () => {
      const handler = new ClaudeHandler("claude", "block");
      handler.metaHttpInput({ api_model: "claude-sonnet-4-20250514-claude-ai" });
      expect(handler.modelVersion).toBe("claude-sonnet-4-20250514");
    });

    it("strips -claude-ai suffix from api_model", () => {
      const handler = new ClaudeHandler("claude", "block");
      handler.metaHttpInput({ api_model: "claude-3-opus-20240229-claude-ai" });
      expect(handler.modelVersion).toBe("claude-3-opus-20240229");
    });
  });
});
