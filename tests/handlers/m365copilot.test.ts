import { describe, it, expect } from "vitest";
import { M365CopilotHandler } from "../../handlers/m365copilot";

const RS = "\x1e"; // Record Separator

describe("M365CopilotHandler", () => {
  describe("promptWsInput", () => {
    it("extracts user message from batched chat message", () => {
      const handler = new M365CopilotHandler("m365copilot", "block");
      const msg = {
        target: "chat",
        type: 4,
        arguments: [{ message: { author: "user", text: "Help me write a report" } }],
      };
      const data = JSON.stringify(msg) + RS;
      const result = handler.promptWsInput(data);
      expect(result).toEqual(["Help me write a report"]);
    });

    it("ignores non-user messages", () => {
      const handler = new M365CopilotHandler("m365copilot", "block");
      const msg = {
        target: "chat",
        type: 4,
        arguments: [{ message: { author: "bot", text: "Here is the report" } }],
      };
      const data = JSON.stringify(msg) + RS;
      expect(handler.promptWsInput(data)).toEqual([]);
    });

    it("ignores non-chat targets", () => {
      const handler = new M365CopilotHandler("m365copilot", "block");
      const msg = {
        target: "other",
        type: 4,
        arguments: [{ message: { author: "user", text: "test" } }],
      };
      const data = JSON.stringify(msg) + RS;
      expect(handler.promptWsInput(data)).toEqual([]);
    });

    it("ignores messages with wrong type", () => {
      const handler = new M365CopilotHandler("m365copilot", "block");
      const msg = {
        target: "chat",
        type: 1,
        arguments: [{ message: { author: "user", text: "test" } }],
      };
      const data = JSON.stringify(msg) + RS;
      expect(handler.promptWsInput(data)).toEqual([]);
    });

    it("handles multiple batched messages", () => {
      const handler = new M365CopilotHandler("m365copilot", "block");
      const msg1 = { target: "ping", type: 6 };
      const msg2 = {
        target: "chat",
        type: 4,
        arguments: [{ message: { author: "user", text: "batched prompt" } }],
      };
      const data = JSON.stringify(msg1) + RS + JSON.stringify(msg2) + RS;
      expect(handler.promptWsInput(data)).toEqual(["batched prompt"]);
    });

    it("returns empty array for empty string", () => {
      const handler = new M365CopilotHandler("m365copilot", "block");
      expect(handler.promptWsInput("")).toEqual([]);
    });

    it("sets default model metadata", () => {
      const handler = new M365CopilotHandler("m365copilot", "block");
      expect(handler.modelName).toBe("M365 Copilot");
      expect(handler.modelVersion).toBe("M365 Copilot");
    });
  });
});
