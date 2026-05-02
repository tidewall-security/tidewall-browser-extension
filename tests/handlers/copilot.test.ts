import { describe, it, expect } from "vitest";
import { CopilotHandler } from "../../handlers/copilot";

describe("CopilotHandler", () => {
  describe("promptWsInput", () => {
    it("extracts text from send event content", () => {
      const handler = new CopilotHandler("copilot", "block");
      const data = JSON.stringify({
        event: "send",
        content: [
          { type: "text", text: "Hello" },
          { type: "text", text: "world" },
        ],
      });
      const result = handler.promptWsInput(data);
      expect(result).toEqual(["Hello world"]);
    });

    it("filters out non-text content items", () => {
      const handler = new CopilotHandler("copilot", "block");
      const data = JSON.stringify({
        event: "send",
        content: [
          { type: "image", url: "http://img.png" },
          { type: "text", text: "only text" },
        ],
      });
      const result = handler.promptWsInput(data);
      expect(result).toEqual(["only text"]);
    });

    it("returns empty array for non-send events", () => {
      const handler = new CopilotHandler("copilot", "block");
      const data = JSON.stringify({ event: "receive", content: [] });
      expect(handler.promptWsInput(data)).toEqual([]);
    });

    it("returns empty array for invalid JSON", () => {
      const handler = new CopilotHandler("copilot", "block");
      expect(handler.promptWsInput("not json")).toEqual([]);
    });

    it("accepts pre-parsed object", () => {
      const handler = new CopilotHandler("copilot", "block");
      const data = {
        event: "send",
        content: [{ type: "text", text: "parsed input" }],
      };
      const result = handler.promptWsInput(data);
      expect(result).toEqual(["parsed input"]);
    });

    it("sets default model metadata", () => {
      const handler = new CopilotHandler("copilot", "block");
      expect(handler.modelName).toBe("Copilot");
      expect(handler.modelVersion).toBe("Copilot");
    });
  });
});
