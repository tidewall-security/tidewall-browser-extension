import { SiteHandler, extractText } from "./base";
import type { SiteMode } from "../lib/types";

/**
 * Handler for FlowGPT (flowgpt.com).
 *
 * **Transport:** Fetch interception on POST to `/v3/chat` and `/v3/chat-anonymous`
 *
 * **Request format:**
 * ```json
 * { "question": "user text", "model": "gpt-4" }
 * ```
 * Prompt extracted from the `question` field. Model metadata from the `model` field.
 *
 * **Response capture:** After stream ends, scrapes the last
 * `#chatConversationList div.flowgpt-markdown` element (no delay).
 */
export class FlowGPTHandler extends SiteHandler {
  constructor(name: string, mode: SiteMode) {
    super(name, mode, {
      fetch: true,
      logOnStreamEnd: true,
      promptUrls: [/\/v3\/chat$/, /\/v3\/chat-anonymous/],
    });
    this.modelName = "FlowGPT";
    this.modelVersion = "FlowGPT";
  }

  override promptHttpInput(body: unknown): string[] {
    const data = JSON.parse(body as string);
    if (data?.model) {
      this.modelName = data.model;
      this.modelVersion = data.model;
    }
    if (data?.question) {
      return [data.question];
    }
    return [];
  }

  override logResponse(): void {
    const elements = document.querySelectorAll(
      "#chatConversationList div.flowgpt-markdown"
    );
    if (elements.length > 0) {
      const last = elements[elements.length - 1];
      this.sendAiResponse(extractText(last));
    }
  }
}
