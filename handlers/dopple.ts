import { SiteHandler, extractText } from "./base";
import type { SiteMode } from "../lib/types";

/**
 * Handler for Dopple (*.dopple.ai).
 *
 * **Transport:** Fetch interception on POST to `/api/messages/send`
 *
 * **Request format:**
 * ```json
 * { "userQuery": "user text" }
 * ```
 * Prompt extracted from the `userQuery` field.
 *
 * **Response capture:** After stream ends, waits 2 seconds then scrapes the last
 * `div.text-chat-ai` element.
 *
 * **Quirks:** Uses `sendBlockText: " "` and wildcard domain matching (`*.dopple.ai`).
 */
export class DoppleHandler extends SiteHandler {
  constructor(name: string, mode: SiteMode) {
    super(name, mode, {
      fetch: true,
      readStream: true,
      logOnStreamEnd: true,
      sendBlockText: " ",
      promptUrls: [/\/api\/messages\/send/],
    });
    this.modelName = "Dopple";
    this.modelVersion = "Dopple";
  }

  override promptHttpInput(body: unknown): string[] {
    const data = JSON.parse(body as string);
    if (data?.userQuery) {
      return [data.userQuery];
    }
    return [];
  }

  override logResponse(): void {
    setTimeout(() => {
      const elements = document.querySelectorAll("div.text-chat-ai");
      if (elements.length > 0) {
        const last = elements[elements.length - 1];
        this.sendAiResponse(extractText(last));
      }
    }, 2000);
  }
}
