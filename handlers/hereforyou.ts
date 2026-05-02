import { SiteHandler } from "./base";
import type { SiteMode } from "../lib/types";

/**
 * Handler for Here for You (www.hereforyou.app).
 *
 * **Transport:** Fetch interception on POST to `/api/chat`
 *
 * **Request format:** Standard chat completions format:
 * ```json
 * { "messages": [{ "role": "user", "content": "user text" }] }
 * ```
 * Prompt extracted from the last message where `role === "user"`.
 *
 * **Model metadata:** Default is "Bell".
 *
 * **Response capture:** After stream ends, waits 1 second then scrapes the last
 * `div.justify-start` element, stripping the "Bell: " prefix.
 */
export class HereForYouHandler extends SiteHandler {
  constructor(name: string, mode: SiteMode) {
    super(name, mode, {
      fetch: true,
      readStream: true,
      logOnStreamEnd: true,
      promptUrls: [/\/api\/chat$/],
    });
    this.modelName = "Bell";
    this.modelVersion = "Bell";
  }

  override promptHttpInput(body: unknown): string[] {
    const data = JSON.parse(body as string);
    if (data?.messages?.length > 0) {
      const last = data.messages[data.messages.length - 1];
      if (last.role === "user" && last.content) {
        return [last.content];
      }
    }
    return [];
  }

  override logResponse(): void {
    setTimeout(() => {
      const elements = document.querySelectorAll("div.justify-start");
      if (elements.length > 0) {
        const last = elements[elements.length - 1];
        const text = last?.textContent?.replace(/^Bell:\s/, "") || "";
        if (text) {
          this.sendAiResponse(text);
        }
      }
    }, 1000);
  }
}
