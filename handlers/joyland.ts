import { SiteHandler, extractText } from "./base";
import type { SiteMode } from "../lib/types";

/**
 * Handler for Joyland AI (www.joyland.ai).
 *
 * **Transport:** XHR interception on POST to `/v1/chat/streamChat`
 *
 * **Request format:**
 * ```json
 * { "textMsg": "user text" }
 * ```
 * Prompt extracted from the `textMsg` field.
 *
 * **Response capture:** After stream ends, waits 4 seconds then scrapes the last
 * `div.chat-main-container div.robot-text` element.
 */
export class JoylandHandler extends SiteHandler {
  constructor(name: string, mode: SiteMode) {
    super(name, mode, {
      xmlhttp: true,
      logOnStreamEnd: true,
      promptUrls: [/\/v1\/chat\/streamChat/],
    });
    this.modelName = "Hermes 13B";
    this.modelVersion = "Hermes 13B";
  }

  override promptHttpInput(body: unknown): string[] {
    const textMsg = JSON.parse(body as string)?.textMsg;
    if (textMsg) {
      return [textMsg];
    }
    return [];
  }

  override logResponse(): void {
    setTimeout(() => {
      const elements = document.querySelectorAll(
        "div.chat-main-container div.robot-text"
      );
      if (elements.length > 0) {
        const last = elements[elements.length - 1];
        this.sendAiResponse(extractText(last));
      }
    }, 4000);
  }
}
