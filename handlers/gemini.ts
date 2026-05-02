import { SiteHandler, extractText } from "./base";
import type { SiteMode } from "../lib/types";

/**
 * Handler for Google Gemini (gemini.google.com).
 *
 * **Transport:** XHR interception on POST to `BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate`
 *
 * **Request format:** URL-encoded form data with a nested JSON structure in the `f.req` parameter.
 * The prompt is deeply nested: `JSON.parse(f.req)[1]` is another JSON string, then `[0][0]` is the prompt.
 *
 * **Model metadata:** Scraped from the `bard-mode-switcher button` element in the DOM.
 * Default is "Gemini 2.5 Flash".
 *
 * **Response capture:** Observes `data-test-lottie-animation-status` attribute changes
 * on the chat history container, then extracts text from the last `.model-response-text` element.
 *
 * **Quirks:** Uses `sendBlockText: " "` to inject a space into blocked requests,
 * preventing Gemini's UI from showing a loading spinner indefinitely.
 */
export class GeminiHandler extends SiteHandler {
  constructor(name: string, mode: SiteMode) {
    super(name, mode, {
      xmlhttp: true,
      sendBlockText: " ",
      promptUrls: [
        /\/_\/BardChatUi\/data\/assistant\.lamda\.BardFrontendService\/StreamGenerate/,
      ],
    });
    this.modelName = "Gemini";
    this.modelVersion = "Gemini 2.5 Flash";
  }

  override promptHttpInput(body: unknown): string[] {
    const params = new URLSearchParams(body as string);
    const fReq = params.get("f.req");
    if (fReq) {
      const outer = JSON.parse(fReq);
      const inner = JSON.parse(outer[1]);
      if (inner[0]?.[0]) {
        return [inner[0][0]];
      }
    }
    return [];
  }

  override promptHttpOutput(body: unknown): void {
    const params = new URLSearchParams(body as string);
    const fReq = params.get("f.req");
    if (fReq) {
      const outer = JSON.parse(fReq);
      const inner = JSON.parse(outer[1]);
      inner[0][0] = "[redacted]";
      outer[1] = JSON.stringify(inner);
      params.set("f.req", JSON.stringify(outer));
      this.body = params.toString();
    }
  }

  override logResponse(): void {
    if (this.responseObserver) {
      this.responseObserver.disconnect();
      this.responseObserver = null;
    }

    this.responseObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === "attributes" &&
          mutation.attributeName === "data-test-lottie-animation-status"
        ) {
          const elements = document.querySelectorAll(".model-response-text");
          if (elements.length > 0) {
            const last = elements[elements.length - 1];
            this.sendAiResponse(extractText(last));
            this.responseObserver?.disconnect();
            this.responseObserver = null;
          }
        }
      });
    });

    const container = document.querySelector(
      "[data-test-id='chat-history-container']"
    );
    if (container) {
      this.responseObserver.observe(container, {
        attributes: true,
        childList: true,
        subtree: true,
      });
    }
  }

  override getModelVersion(): string {
    const button = document.querySelector("bard-mode-switcher button");
    let version = button?.textContent?.trim();
    if (version && !version.match(/Copilot/)) {
      version = `Gemini ${version}`;
    }
    return version || this.modelVersion;
  }
}
