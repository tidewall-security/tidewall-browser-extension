import { describe, it, expect, beforeEach } from "vitest";
import { YodayoHandler } from "../../handlers/yodayo";

beforeEach(() => {
  (globalThis as any).document = {
    querySelector: () => null,
    querySelectorAll: () => [],
  };
});

describe("YodayoHandler", () => {
  describe("promptWsInput", () => {
    it("extracts message from stream_message type", () => {
      const handler = new YodayoHandler("yodayo", "block");
      const data = JSON.stringify({
        type: "stream_message",
        data: { message: "Draw me an anime character" },
      });
      const result = handler.promptWsInput(data);
      expect(result).toEqual(["Draw me an anime character"]);
    });

    it("returns empty array for other message types", () => {
      const handler = new YodayoHandler("yodayo", "block");
      const data = JSON.stringify({
        type: "stream_message_end",
        data: { message: "test" },
      });
      expect(handler.promptWsInput(data)).toEqual([]);
    });

    it("returns empty array for missing data.message", () => {
      const handler = new YodayoHandler("yodayo", "block");
      const data = JSON.stringify({
        type: "stream_message",
        data: {},
      });
      expect(handler.promptWsInput(data)).toEqual([]);
    });

    it("returns empty array for empty message", () => {
      const handler = new YodayoHandler("yodayo", "block");
      const data = JSON.stringify({
        type: "stream_message",
        data: { message: "" },
      });
      expect(handler.promptWsInput(data)).toEqual([]);
    });

    it("sets default model metadata", () => {
      const handler = new YodayoHandler("yodayo", "block");
      expect(handler.modelName).toBe("Yodayo");
      expect(handler.modelVersion).toBe("Yodayo");
    });
  });
});
