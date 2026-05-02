import { describe, it, expect } from "vitest";
import { OpenArtHandler } from "../../handlers/openart";

describe("OpenArtHandler", () => {
  describe("promptHttpInput", () => {
    it("extracts prompt from request body", () => {
      const handler = new OpenArtHandler("openart", "block");
      const body = JSON.stringify({ prompt: "A sunset over mountains" });
      const result = handler.promptHttpInput(body);
      expect(result).toEqual(["A sunset over mountains"]);
    });

    it("extracts model metadata from base_model", () => {
      const handler = new OpenArtHandler("openart", "block");
      const body = JSON.stringify({
        base_model: "StabilityAI/SDXL",
        prompt: "test",
      });
      handler.promptHttpInput(body);
      expect(handler.modelName).toBe("StabilityAI");
      expect(handler.modelVersion).toBe("StabilityAI/SDXL");
    });

    it("handles base_model without slash", () => {
      const handler = new OpenArtHandler("openart", "block");
      const body = JSON.stringify({
        base_model: "Juggernaut",
        prompt: "test",
      });
      handler.promptHttpInput(body);
      expect(handler.modelName).toBe("Juggernaut");
      expect(handler.modelVersion).toBe("Juggernaut");
    });

    it("returns empty array for missing prompt", () => {
      const handler = new OpenArtHandler("openart", "block");
      const body = JSON.stringify({ base_model: "test" });
      expect(handler.promptHttpInput(body)).toEqual([]);
    });

    it("sets default model metadata", () => {
      const handler = new OpenArtHandler("openart", "block");
      expect(handler.modelName).toBe("KandooAI");
      expect(handler.modelVersion).toBe("KandooAI/Juggernaut-XL");
    });
  });
});
