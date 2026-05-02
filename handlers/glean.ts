import { SiteHandler, extractText } from "./base";
import type { SiteMode } from "../lib/types";

/**
 * Handler for Glean (app.glean.com).
 *
 * **Transport:** XHR + Fetch interception on POST to `/api/v1/chat`
 *
 * **Request format:**
 * ```json
 * { "messages": [{ "fragments": [{ "text": "user text" }] }] }
 * ```
 * Prompt extracted from `messages[0].fragments[0].text`.
 *
 * **Info endpoint:** Monitors `/api/v1/checkauth` responses to extract user
 * metadata (name, email) for logging.
 *
 * **Response capture:** After stream ends, waits 3 seconds then scrapes the last
 * `pre[aria-label='Assistant Response']` element.
 */
export class GleanHandler extends SiteHandler {
  constructor(name: string, mode: SiteMode) {
    super(name, mode, {
      xmlhttp: true,
      fetch: true,
      logOnStreamEnd: true,
      promptUrls: [/\/api\/v1\/chat/],
      infoRespUrls: [/\/api\/v1\/checkauth/],
    });
    this.modelName = "Glean";
    this.modelVersion = "Glean";
  }

  override promptHttpInput(body: unknown): string[] {
    const data = JSON.parse(body as string);
    const text =
      data?.messages?.[0]?.fragments?.[0]?.text;
    if (text) {
      return [text];
    }
    return [];
  }

  override promptHttpOutput(body: unknown): void {
    const data = JSON.parse(body as string);
    data.messages[0].fragments[0].text = "[redacted]";
    this.body = JSON.stringify(data);
  }

  override metaHttpInput(body: unknown): void {
    const data = body as Record<string, unknown> | null;
    if (!data) return;

    const user = data.user as Record<string, unknown> | undefined;
    if (user?.name) {
      // Store user metadata for telemetry
      console.log(`[Tidewall][Glean] user: ${user.name}`);
    }
    const metadata = user?.metadata as Record<string, unknown> | undefined;
    if (metadata?.email) {
      console.log(`[Tidewall][Glean] email: ${metadata.email}`);
    }
  }

  override logResponse(): void {
    setTimeout(() => {
      const elements = document.querySelectorAll(
        "pre[aria-label='Assistant Response'"
      );
      if (elements.length > 0) {
        const last = elements[elements.length - 1];
        this.sendAiResponse(extractText(last));
      }
    }, 3000);
  }
}
