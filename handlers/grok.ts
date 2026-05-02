import { SiteHandler, extractText } from "./base";
import type { SiteMode } from "../lib/types";

/**
 * Handler for Grok (grok.com).
 *
 * **Transport:** Fetch interception on POST to `/rest/app-chat/conversations/new`
 * and `/rest/app-chat/conversations/{id}/responses`
 *
 * **Request format:**
 * ```json
 * { "message": "user text" }
 * ```
 * Prompt extracted from the `message` field.
 *
 * **Response capture:** After stream ends, waits 3 seconds then scrapes the last
 * `div.message-bubble` element from the DOM.
 *
 * **Block cleanup:** Removes retry buttons matching `button[data-slot='button']`
 * whose text includes "retry".
 */
export class GrokHandler extends SiteHandler {
  constructor(name: string, mode: SiteMode) {
    super(name, mode, {
      fetch: true,
      logOnStreamEnd: true,
      promptUrls: [
        /\/rest\/app-chat\/conversations\/new$/,
        /\/rest\/app-chat\/conversations\/[0-9a-f\-]+\/responses$/,
      ],
    });
    this.modelName = "Grok";
    this.modelVersion = "Grok-1";
  }

  override promptHttpInput(body: unknown): string[] {
    const message = JSON.parse(body as string)?.message;
    if (message) {
      return [message];
    }
    return [];
  }

  override promptHttpOutput(body: unknown): void {
    const data = JSON.parse(body as string);
    data.message = "[redacted]";
    this.body = JSON.stringify(data);
  }

  override logResponse(): void {
    setTimeout(() => {
      const elements = document.querySelectorAll("div.message-bubble");
      if (elements.length > 0) {
        const last = elements[elements.length - 1];
        this.sendAiResponse(extractText(last));
      }
    }, 3000);
  }

  override runOnBlock(): void {
    setTimeout(() => {
      const buttons = document.querySelectorAll("button[data-slot='button']");
      for (const btn of buttons) {
        if (btn.textContent?.trim().toLowerCase().includes("retry")) {
          btn.remove();
        }
      }
    }, 200);
  }
}
