import { SiteHandler, extractText } from "./base";
import type { SiteMode } from "../lib/types";

/**
 * Handler for Kuki AI (chat.kuki.ai).
 *
 * **Transport:** XHR interception on POST to `/cptalk`
 *
 * **Request format:** URL-encoded form data with an `input` parameter.
 * Prompt extracted via `URLSearchParams.get("input")`.
 *
 * **Response capture:** Waits 1 second then scrapes the last
 * `div.pb-bot-response div.pb-chat-bubble-wrapper div.pb-chat-bubble` element.
 */
export class KukiHandler extends SiteHandler {
  constructor(name: string, mode: SiteMode) {
    super(name, mode, {
      xmlhttp: true,
      promptUrls: [/\/cptalk$/],
    });
    this.modelName = "Kuki";
    this.modelVersion = "Kuki";
  }

  override promptHttpInput(body: unknown): string[] {
    const input = new URLSearchParams(body as string).get("input");
    if (input) {
      return [input];
    }
    return [];
  }

  override logResponse(): void {
    setTimeout(() => {
      const elements = document.querySelectorAll(
        "div.pb-bot-response div.pb-chat-bubble-wrapper div.pb-chat-bubble"
      );
      if (elements.length > 0) {
        const last = elements[elements.length - 1];
        if (last) {
          this.sendAiResponse(extractText(last));
        }
      }
    }, 1000);
  }
}
