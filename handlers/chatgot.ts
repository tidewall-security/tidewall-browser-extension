import { SiteHandler, extractText } from "./base";
import type { SiteMode } from "../lib/types";

/**
 * Handler for ChatGOT (www.chatgot.io).
 *
 * **Transport:** Fetch interception on POST to `/api/v2/chat/conversation`
 *
 * **Request format:**
 * ```json
 * { "prompt": "user text" }
 * ```
 * Prompt extracted from the `prompt` field.
 *
 * **Model metadata:** Scraped from the DOM element at
 * `label[for='chat-input'] + sibling div.s-trans span`.
 *
 * **Response capture:** After stream ends, scrapes the last `div.v-md-editor-preview` element.
 */
export class ChatGOTHandler extends SiteHandler {
  constructor(name: string, mode: SiteMode) {
    super(name, mode, {
      fetch: true,
      readStream: true,
      logOnStreamEnd: true,
      promptUrls: [/\/api\/v2\/chat\/conversation$/],
    });
    this.modelName = "Inflection";
    this.modelVersion = "Inflection-2.5";
  }

  override promptHttpInput(body: unknown): string[] {
    const data = JSON.parse(body as string);
    const label = document
      .querySelector("label[for='chat-input']")
      ?.nextElementSibling?.querySelector("div.s-trans span");
    if (label?.textContent) {
      this.modelName = label.textContent;
      this.modelVersion = label.textContent;
    }
    if (data?.prompt) {
      return [data.prompt];
    }
    return [];
  }

  override logResponse(): void {
    const elements = document.querySelectorAll("div.v-md-editor-preview");
    if (elements.length > 0) {
      const last = elements[elements.length - 1];
      this.sendAiResponse(extractText(last));
    }
  }
}
