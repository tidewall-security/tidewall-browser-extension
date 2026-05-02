import { SiteHandler } from "./base";
import type { SiteMode } from "../lib/types";

/**
 * Handler for Yodayo (yodayo.com).
 *
 * **Transport:** WebSocket interception.
 *
 * **Request format:** JSON with `{ type: "stream_message", data: { message: "user text" } }`.
 * Prompt extracted from `data.message`.
 *
 * **Model metadata:** Scraped from `div button p` elements in the DOM (buttons without class attributes).
 *
 * **Response capture:** Accumulates `message_part` strings from `stream_message` events,
 * then sends the complete text on `stream_message_end`.
 */
export class YodayoHandler extends SiteHandler {
  private messageStr = "";

  constructor(name: string, mode: SiteMode) {
    super(name, mode, {
      websocket: true,
    });
    this.modelName = "Yodayo";
    this.modelVersion = "Yodayo";
  }

  override promptWsInput(data: unknown): string[] {
    const msg = JSON.parse(data as string);
    if (msg?.type === "stream_message" && msg?.data?.message) {
      // Detect model from DOM buttons
      document.querySelectorAll("div button p").forEach((p) => {
        if (!p.hasAttribute("class") && p.textContent) {
          this.modelName = p.textContent;
          this.modelVersion = p.textContent;
        }
      });
      return [msg.data.message];
    }
    return [];
  }

  override processEvent(event: unknown): void {
    const msg = JSON.parse(event as string);
    if (msg?.type === "stream_message") {
      this.messageStr += msg.data?.message_part ?? "";
    } else if (msg?.type === "stream_message_end" && this.messageStr) {
      this.sendAiResponse(this.messageStr);
      this.messageStr = "";
    }
  }
}
