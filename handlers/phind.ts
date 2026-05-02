import { SiteHandler } from "./base";
import type { SiteMode } from "../lib/types";

/**
 * Handler for Phind (www.phind.com).
 *
 * **Transport:** WebSocket interception with passive monitoring.
 *
 * **Request format:** JSON with `{ query: "user text" }`.
 *
 * **Response capture:** Monitors incoming WebSocket messages for `{ type: "complete" }`.
 * The response is an S3 URL (`data.s3_url`) rather than inline text. After a 2-second
 * delay, sends the S3 URL as the response text.
 *
 * **Quirks:** Unlike most handlers, the response is a URL to rendered content
 * rather than the text itself.
 */
export class PhindHandler extends SiteHandler {
  private iframeSrc = "";

  constructor(name: string, mode: SiteMode) {
    super(name, mode, {
      websocket: true,
      monitorWebSocket: true,
    });
    this.modelName = "phind";
    this.modelVersion = "phind-fast";
  }

  override promptWsInput(data: unknown): string[] {
    const msg = JSON.parse(data as string);
    if (msg?.query) {
      return [msg.query];
    }
    return [];
  }

  override monitorWsResponse(data: unknown): void {
    const msg = JSON.parse(data as string);
    if (msg?.type === "complete") {
      this.iframeSrc = msg?.data?.s3_url || "";
      this.logResponse();
    }
  }

  override logResponse(): void {
    setTimeout(() => {
      if (this.iframeSrc) {
        this.sendAiResponse(this.iframeSrc);
      }
    }, 2000);
  }
}
