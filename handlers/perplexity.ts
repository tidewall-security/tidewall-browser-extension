import { SiteHandler, extractText } from "./base";
import type { SiteMode } from "../lib/types";

/**
 * Handler for Perplexity (www.perplexity.ai).
 *
 * **Transport:** Fetch interception on POST to `/rest/sse/perplexity_ask`
 *
 * **Request format:**
 * ```json
 * { "query_str": "user text", "params": { "dsl_query": "..." } }
 * ```
 * Prompt extracted from the `query_str` field.
 *
 * **Response capture:** After stream ends, waits 3 seconds then scrapes the last
 * `div.prose` element from the DOM.
 *
 * **Quirks:** Uses `sendBlockText: " "` to prevent the UI from hanging on blocked requests.
 */
export class PerplexityHandler extends SiteHandler {
  constructor(name: string, mode: SiteMode) {
    super(name, mode, {
      fetch: true,
      logOnStreamEnd: true,
      sendBlockText: " ",
      promptUrls: [/\/rest\/sse\/perplexity_ask$/],
    });
    this.modelName = "GPT-3.5";
    this.modelVersion = "GPT-3.5";
  }

  override promptHttpInput(body: unknown): string[] {
    const data = JSON.parse(body as string);
    const query = data?.query_str;
    if (query) {
      return [query];
    }
    return [];
  }

  override promptHttpOutput(body: unknown, redacted: string[]): string {
    const data = JSON.parse(body as string);
    data.query_str = redacted[0];
    if (data?.params?.dsl_query) {
      data.params.dsl_query = redacted[0];
    }
    return JSON.stringify(data);
  }

  override logResponse(): void {
    setTimeout(() => {
      const elements = document.querySelectorAll("div.prose");
      if (elements.length > 0) {
        const last = elements[elements.length - 1];
        this.sendAiResponse(extractText(last));
      }
    }, 3000);
  }
}
