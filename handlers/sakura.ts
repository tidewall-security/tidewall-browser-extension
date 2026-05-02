import { SiteHandler, extractText } from "./base";
import type { SiteMode } from "../lib/types";

/**
 * Handler for Sakura (www.sakura.fm).
 *
 * **Transport:** Fetch interception on POST to `/api/chat`
 *
 * **Request format:**
 * ```json
 * { "action": { "content": "user text" } }
 * ```
 * Prompt extracted from `action.content`.
 *
 * **Model metadata:** Default is "Dragonfruit".
 *
 * **Response capture:** After stream ends, scrapes the last button element
 * inside the first `main div` container.
 */
export class SakuraHandler extends SiteHandler {
  constructor(name: string, mode: SiteMode) {
    super(name, mode, {
      fetch: true,
      readStream: true,
      logOnStreamEnd: true,
      promptUrls: [/\/api\/chat/],
    });
    this.modelName = "Dragonfruit";
    this.modelVersion = "Dragonfruit";
  }

  override promptHttpInput(body: unknown): string[] {
    const content = JSON.parse(body as string)?.action?.content;
    if (content) {
      return [content];
    }
    return [];
  }

  override logResponse(): void {
    const buttons = document
      .querySelector("main div")
      ?.querySelectorAll("button");
    if (buttons && buttons.length > 0) {
      const last = buttons[buttons.length - 1];
      this.sendAiResponse(extractText(last));
    }
  }
}
