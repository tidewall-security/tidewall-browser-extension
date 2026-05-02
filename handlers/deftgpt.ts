import { SiteHandler, extractText } from "./base";
import type { SiteMode } from "../lib/types";

/**
 * Handler for DeftGPT (deftgpt.com).
 *
 * **Transport:** Fetch interception on POST to `/api/v1/chat/message`
 *
 * **Request format:**
 * ```json
 * { "message": "user text", "model": "gpt-4.1" }
 * ```
 * Prompt extracted from the `message` field. Model name normalized by replacing
 * lowercase "gpt" prefix with "GPT".
 *
 * **Response capture:** After stream ends, waits 2 seconds then scrapes the last
 * `div[class^='markdown_markdownContainer']` element.
 */
export class DeftGPTHandler extends SiteHandler {
  constructor(name: string, mode: SiteMode) {
    super(name, mode, {
      fetch: true,
      readStream: true,
      logOnStreamEnd: true,
      promptUrls: [/\/api\/v1\/chat\/message/],
    });
    this.modelName = "GPT";
    this.modelVersion = "GPT-4.1";
  }

  override promptHttpInput(body: unknown): string[] {
    const data = JSON.parse(body as string);
    if (data?.model) {
      this.modelName = data.model.replace(/^gpt/, "GPT");
      this.modelVersion = this.modelName;
    }
    if (data?.message) {
      return [data.message];
    }
    return [];
  }

  override logResponse(): void {
    setTimeout(() => {
      const elements = document.querySelectorAll(
        "div[class^='markdown_markdownContainer']"
      );
      if (elements.length > 0) {
        const last = elements[elements.length - 1];
        if (last) {
          this.sendAiResponse(extractText(last));
        }
      }
    }, 2000);
  }
}
