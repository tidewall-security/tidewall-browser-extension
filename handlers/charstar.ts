import { SiteHandler, extractText } from "./base";
import type { SiteMode } from "../lib/types";

/**
 * Handler for Charstar AI (charstar.ai).
 *
 * **Transport:** Fetch interception on POST to `/api/chats/send`
 *
 * **Request format:**
 * ```json
 * { "message": { "content": "user text" }, "model": "HAD" }
 * ```
 * Prompt extracted from `message.content`. Model metadata from the `model` field.
 *
 * **Response capture:** After stream ends, waits 1 second then scrapes the last
 * `main div.whitespace-pre-wrap` element.
 */
export class CharstarHandler extends SiteHandler {
  constructor(name: string, mode: SiteMode) {
    super(name, mode, {
      fetch: true,
      readStream: true,
      logOnStreamEnd: true,
      promptUrls: [/\/api\/chats\/send$/],
    });
    this.modelName = "HAD";
    this.modelVersion = "HAD";
  }

  override promptHttpInput(body: unknown): string[] {
    const data = JSON.parse(body as string);
    if (data?.model) {
      this.modelName = data.model;
      this.modelVersion = data.model;
    }
    if (data?.message?.content) {
      return [data.message.content];
    }
    return [];
  }

  override logResponse(): void {
    setTimeout(() => {
      const elements = document.querySelectorAll(
        "main div.whitespace-pre-wrap"
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
