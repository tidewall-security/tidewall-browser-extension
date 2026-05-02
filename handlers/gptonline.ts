import { SiteHandler, extractText } from "./base";
import type { SiteMode } from "../lib/types";

/**
 * Handler for GPT Online (gptonline.ai).
 *
 * **Transport:** Fetch + XHR interception on POST to `/wp-admin/admin-ajax.php`
 *
 * **Request format:** FormData with `message` or `msg` field.
 * Prompt extracted via `formData.get("message")` or `formData.get("msg")`.
 *
 * **Model metadata:** Default is GPT-3.
 *
 * **Response capture:** Detects completion via `processEvent` (looks for `[DONE]`
 * or `{ status: "success" }`), then waits 2 seconds and scrapes the last
 * `li.wpaicg-ai-message` element.
 *
 * **Quirks:** Built on WordPress with the WPAICG plugin, hence the `admin-ajax.php` endpoint.
 */
export class GPTOnlineHandler extends SiteHandler {
  constructor(name: string, mode: SiteMode) {
    super(name, mode, {
      fetch: true,
      xmlhttp: true,
      readStream: true,
      logOnStreamEnd: true,
      promptUrls: [/\/wp\-admin\/admin\-ajax\.php/],
    });
    this.modelName = "GPT-3";
    this.modelVersion = "GPT-3";
  }

  override promptHttpInput(body: unknown): string[] {
    const formData = body as FormData;
    const message =
      formData?.get?.("message") || formData?.get?.("msg");
    if (message) {
      return [String(message)];
    }
    return [];
  }

  override processEvent(event: unknown): void {
    const eventStr = event as string;
    if (eventStr.trim().endsWith("[DONE]")) {
      this.logResponse();
    } else {
      try {
        const data = JSON.parse(eventStr);
        if (data?.status === "success") {
          this.logResponse();
        }
      } catch {
        // ignore parse errors
      }
    }
  }

  override logResponse(): void {
    setTimeout(() => {
      const elements = document.querySelectorAll("li.wpaicg-ai-message");
      if (elements.length > 0) {
        const last = elements[elements.length - 1];
        this.sendAiResponse(extractText(last));
      }
    }, 2000);
  }
}
