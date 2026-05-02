import { SiteHandler, extractText } from "./base";
import type { SiteMode } from "../lib/types";

/**
 * Handler for You.com (you.com).
 *
 * **Transport:** XHR interception on POST to `/api/streamingSearch`
 *
 * **Request format:**
 * ```json
 * { "query": "user text", "prompt": "..." }
 * ```
 * Prompt extracted from the `query` field. Both `query` and `prompt` are redacted on block.
 *
 * **Response capture:** After stream ends, waits 200ms then scrapes the last
 * `div#chat-history div[data-testid^="youchat-answer-turn"]` element.
 */
export class YouHandler extends SiteHandler {
  constructor(name: string, mode: SiteMode) {
    super(name, mode, {
      xmlhttp: true,
      logOnStreamEnd: true,
      promptUrls: [/\/api\/streamingSearch/],
    });
    this.modelName = "GPT-4";
    this.modelVersion = "GPT-4o";
  }

  override promptHttpInput(body: unknown): string[] {
    const query = JSON.parse(body as string)?.query;
    if (query) {
      return [query];
    }
    return [];
  }

  override promptHttpOutput(body: unknown): void {
    const data = JSON.parse(body as string);
    data.query = "[redacted]";
    data.prompt = "[redacted]";
    this.body = JSON.stringify(data);
  }

  override logResponse(): void {
    setTimeout(() => {
      const elements = document.querySelectorAll(
        'div#chat-history div[data-testid^="youchat-answer-turn"]'
      );
      if (elements.length > 0) {
        const last = elements[elements.length - 1];
        this.sendAiResponse(extractText(last));
      }
    }, 200);
  }
}
