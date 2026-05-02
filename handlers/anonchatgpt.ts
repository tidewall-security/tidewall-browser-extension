import { SiteHandler, extractText } from "./base";
import type { SiteMode } from "../lib/types";

/**
 * Handler for AnonChatGPT (anonchatgpt.com).
 *
 * **Transport:** Fetch GET interception on `/query?queryText=...`
 *
 * **Request format:** Query parameters in a GET request URL.
 * Prompt extracted from the `queryText` search parameter.
 *
 * **Model metadata:** Default is GPT-3.
 *
 * **Response capture:** After stream ends, waits 1 second then scrapes the
 * element immediately before the `<form>` element in the DOM.
 *
 * **Quirks:** One of the few handlers that uses `fetchGet: true` to intercept
 * GET requests (most sites use POST for prompts).
 */
export class AnonChatGPTHandler extends SiteHandler {
  constructor(name: string, mode: SiteMode) {
    super(name, mode, {
      fetchGet: true,
      readStream: true,
      logOnStreamEnd: true,
      promptUrls: [/\/query\?queryText=/],
    });
    this.modelName = "GPT-3";
    this.modelVersion = "GPT-3";
  }

  override promptHttpInput(body: unknown): string[] {
    const url = body as URL;
    if (url?.searchParams?.has("queryText")) {
      const query = url.searchParams.get("queryText");
      if (query) {
        return [query];
      }
    }
    return [];
  }

  override logResponse(): void {
    setTimeout(() => {
      const el = document.querySelector("form")?.previousElementSibling;
      if (el) {
        this.sendAiResponse(extractText(el as Element));
      }
    }, 1000);
  }
}
