import { SiteHandler, extractText } from "./base";
import type { SiteMode } from "../lib/types";

/**
 * Handler for Pi AI (pi.ai).
 *
 * **Transport:** Fetch interception on POST to `/api/v2/chat`
 *
 * **Request format:**
 * ```json
 * { "text": "user text" }
 * ```
 * Prompt extracted from the `text` field.
 *
 * **Model metadata:** Default is Inflection-2.5.
 *
 * **Response capture:** After stream ends, scrapes the last `div.break-anywhere` element.
 */
export class PiHandler extends SiteHandler {
  constructor(name: string, mode: SiteMode) {
    super(name, mode, {
      fetch: true,
      readStream: true,
      logOnStreamEnd: true,
      promptUrls: [/\/api\/v2\/chat/],
    });
    this.modelName = "Inflection";
    this.modelVersion = "Inflection-2.5";
  }

  override promptHttpInput(body: unknown): string[] {
    const text = JSON.parse(body as string)?.text;
    if (text) {
      return [text];
    }
    return [];
  }

  override logResponse(): void {
    const elements = document.querySelectorAll("div.break-anywhere");
    if (elements.length > 0) {
      const last = elements[elements.length - 1];
      this.sendAiResponse(extractText(last));
    }
  }
}
