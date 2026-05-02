import { SiteHandler, extractText } from "./base";
import type { SiteMode } from "../lib/types";

/**
 * Handler for Google AI Studio (aistudio.google.com).
 *
 * **Transport:** XHR interception on POST to `MakerSuiteService/GenerateContent`
 *
 * **Request format:** Deeply nested JSON array. The prompt is at `data[1][last][0][0][1]`.
 *
 * **Model metadata:** Scraped from the `ms-model-selector-two-column` DOM element.
 * Default is "gemini-2.5-pro".
 *
 * **Response capture:** After stream ends, scrapes the last `div.turn-content`
 * element inside the chat view container after a 1-second delay.
 *
 * **Quirks:** Uses `disableFilter: true` because the RPC endpoint URL is complex
 * and the handler should intercept all XHR requests on the page.
 */
export class AIStudioHandler extends SiteHandler {
  constructor(name: string, mode: SiteMode) {
    super(name, mode, {
      xmlhttp: true,
      logOnStreamEnd: true,
      disableFilter: true,
      promptUrls: [
        /\/\$rpc\/google\.internal\.alkali\.applications\.makersuite\.v1\.MakerSuiteService\/GenerateContent/,
      ],
    });
    this.modelName = "Gemini";
    this.modelVersion = "gemini-2.5-pro";
  }

  override promptHttpInput(body: unknown): string[] {
    const data = JSON.parse(body as string);

    const selectorEl = document.querySelector(
      "ms-model-selector-two-column"
    );
    const modelText = selectorEl?.textContent?.trim();
    if (modelText) {
      this.modelVersion = modelText;
      const spaceIdx = modelText.indexOf(" ");
      this.modelName = spaceIdx >= 0 ? modelText.substring(0, spaceIdx) : modelText;
    }

    try {
      const arr = data[1];
      const last = arr[arr.length - 1];
      const prompt = last[0][0][1];
      if (prompt) {
        return [prompt];
      }
    } catch {
      // structure mismatch — skip
    }
    return [];
  }

  override promptHttpOutput(body: unknown): void {
    const data = JSON.parse(body as string);
    try {
      const arr = data[1];
      arr[arr.length - 1][0][0][1] = "[redacted]";
    } catch {
      // structure mismatch — skip
    }
    this.body = JSON.stringify(data);
  }

  override logResponse(): void {
    if (document.querySelector("div.chat-view-container")) {
      const elements = document.querySelectorAll("div.turn-content");
      const last = elements[elements.length - 1];
      if (last) {
        setTimeout(() => {
          this.sendAiResponse(extractText(last));
        }, 1000);
      }
    }
  }
}
