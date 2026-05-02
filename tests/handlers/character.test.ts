import { describe, it, expect } from "vitest";
import { CharacterHandler } from "../../handlers/character";

describe("CharacterHandler", () => {
  describe("promptWsInput", () => {
    it("extracts prompt from create_and_generate_turn command", () => {
      const handler = new CharacterHandler("character", "block");
      const data = JSON.stringify({
        command: "create_and_generate_turn",
        payload: {
          turn: {
            candidates: [{ raw_content: "Tell me a story" }],
          },
        },
      });
      const result = handler.promptWsInput(data);
      expect(result).toEqual(["Tell me a story"]);
    });

    it("returns empty array for other commands", () => {
      const handler = new CharacterHandler("character", "block");
      const data = JSON.stringify({
        command: "update_turn",
        payload: { turn: { candidates: [{ raw_content: "response" }] } },
      });
      expect(handler.promptWsInput(data)).toEqual([]);
    });

    it("returns empty array for missing candidates", () => {
      const handler = new CharacterHandler("character", "block");
      const data = JSON.stringify({
        command: "create_and_generate_turn",
        payload: { turn: {} },
      });
      expect(handler.promptWsInput(data)).toEqual([]);
    });

    it("returns empty array for empty raw_content", () => {
      const handler = new CharacterHandler("character", "block");
      const data = JSON.stringify({
        command: "create_and_generate_turn",
        payload: {
          turn: { candidates: [{ raw_content: "" }] },
        },
      });
      expect(handler.promptWsInput(data)).toEqual([]);
    });

    it("sets default model metadata", () => {
      const handler = new CharacterHandler("character", "block");
      expect(handler.modelName).toBe("CharacterAI");
      expect(handler.modelVersion).toBe("character-ai");
    });
  });
});
