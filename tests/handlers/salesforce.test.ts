import { describe, it, expect } from "vitest";
import { SalesforceHandler } from "../../handlers/salesforce";

describe("SalesforceHandler", () => {
  describe("promptHttpInput", () => {
    it("extracts userInput from nested URL-encoded message", () => {
      const handler = new SalesforceHandler("salesforce", "block");
      const innerMessage = JSON.stringify({
        actions: [
          {
            params: {
              lifecycleAgentMessageInputRepresentation: {
                userInput: "Help me with a case",
              },
            },
          },
        ],
      });
      const body = new URLSearchParams();
      body.set("message", innerMessage);
      const result = handler.promptHttpInput(body.toString());
      expect(result).toEqual(["Help me with a case"]);
    });

    it("returns empty array when message param is missing", () => {
      const handler = new SalesforceHandler("salesforce", "block");
      const body = "other=value";
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("returns empty array when userInput is missing", () => {
      const handler = new SalesforceHandler("salesforce", "block");
      const innerMessage = JSON.stringify({ actions: [{ params: {} }] });
      const body = new URLSearchParams();
      body.set("message", innerMessage);
      expect(handler.promptHttpInput(body.toString())).toEqual([]);
    });

    it("sets default model metadata", () => {
      const handler = new SalesforceHandler("salesforce", "block");
      expect(handler.modelName).toBe("Agentforce");
      expect(handler.modelVersion).toBe("Agentforce");
    });
  });
});
