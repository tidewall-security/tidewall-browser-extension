import { SiteHandler, extractText } from "./base";
import type { SiteMode } from "../lib/types";

/**
 * Handler for ChatGPT (chatgpt.com).
 *
 * **Transport:** Fetch interception on POST to `/conversation`
 *
 * **Request format:**
 * ```json
 * { "model": "gpt-4o", "messages": [{ "content": { "parts": ["user text"] } }] }
 * ```
 * Prompt extracted from `messages[0].content.parts[0]`.
 *
 * **Model metadata:** From the `model` field. `"auto"` maps to the default model (GPT-5-2).
 *
 * **Response capture:** Watches the SSE stream for `data: [DONE]`, then scrapes the
 * last `div.prose` element from the DOM after a 3-second delay.
 *
 * **Block cleanup:** Removes the regenerate/error button (`[data-testid='regenerate-thread-error-button']`).
 */
export class ChatGPTHandler extends SiteHandler {
  private defaultModel = "GPT-5-2";

  constructor(name: string, mode: SiteMode) {
    super(name, mode, {
      fetch: true,
      readStream: true,
      promptUrls: [/\/conversation$/],
    });
  }

  override promptHttpInput(body: unknown): string[] {
    const data = JSON.parse(body as string);
    if (data?.model) {
      if (data.model === "auto") {
        this.modelVersion = this.defaultModel;
      } else {
        this.modelVersion = data.model.replace(/^gpt/, "GPT");
      }
      this.modelName = this.modelVersion;
    }
    // Extract user prompt text from ChatGPT's message format
    if (data?.messages?.length > 0 && data.messages[0].content?.parts) {
      const prompt = data.messages[0].content.parts[0];
      if (prompt) return [prompt];
    }
    return [];
  }

  override promptHttpOutput(body: unknown, redacted: string[]): unknown {
    const data = JSON.parse(body as string);
    data.messages[0].content.parts = [redacted[0]];
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

  override processEvent(event: unknown): void {
    const eventStr = event as string;
    if (eventStr.startsWith("data: [DONE]")) {
      this.logResponse();
    }
  }

  override runOnBlock(): void {
    setTimeout(() => {
      document
        .querySelector("[data-testid='regenerate-thread-error-button']")
        ?.remove();
    }, 200);
  }
}
