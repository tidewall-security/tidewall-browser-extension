import { SiteHandler, extractText } from "./base";
import type { SiteMode } from "../lib/types";

/**
 * Handler for Poe (poe.com).
 *
 * **Transport:** Fetch interception on POST to `/api/gql_POST`
 *
 * **Request format:** GraphQL mutation:
 * ```json
 * { "queryName": "sendMessageMutation", "bot": "GPT-4o", "variables": { "query": "user text" } }
 * ```
 * Prompt extracted from `variables.query` when `queryName === "sendMessageMutation"`.
 *
 * **Model metadata:** Extracted from the `bot` field in the request.
 *
 * **Response capture:** After stream ends, waits 2 seconds then scrapes the last
 * element matching `[class^="Message_messageTextContainer"]`.
 *
 * **Quirks:** Uses `disableFilter: true` because all GraphQL requests go through
 * the same endpoint, and the handler filters by `queryName` instead.
 */
export class PoeHandler extends SiteHandler {
  constructor(name: string, mode: SiteMode) {
    super(name, mode, {
      fetch: true,
      readStream: true,
      logOnStreamEnd: true,
      disableFilter: true,
      promptUrls: [/\/api\/gql_POST$/],
    });
    this.modelName = "GPT-4";
    this.modelVersion = "GPT-4o";
  }

  override promptHttpInput(body: unknown): string[] {
    const data = JSON.parse(body as string);
    if (data?.queryName === "sendMessageMutation") {
      if (data?.bot) {
        this.modelName = data.bot;
        this.modelVersion = data.bot;
      }
      const query = data?.variables?.query;
      if (query) {
        return [query];
      }
    }
    return [];
  }

  override promptHttpOutput(body: unknown, redacted: string[]): string {
    const data = JSON.parse(body as string);
    data.variables.query = redacted[0];
    return JSON.stringify(data);
  }

  override logResponse(): void {
    setTimeout(() => {
      const elements = document.querySelectorAll(
        '[class^="Message_messageTextContainer"]'
      );
      if (elements.length > 0) {
        const last = elements[elements.length - 1];
        this.sendAiResponse(extractText(last));
      }
    }, 2000);
  }
}
