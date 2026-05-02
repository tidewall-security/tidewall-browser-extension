import { SiteHandler, extractText } from "./base";
import type { SiteMode } from "../lib/types";

/**
 * Handler for Sigma Browser (app.sigmabrowser.com).
 *
 * **Transport:** WebSocket interception.
 *
 * **Request format:** Length-prefixed WebSocket messages (numeric prefix followed by JSON).
 * The JSON payload is `["search", "{\"query\": \"user text\"}"]` or `["followup", ...]`.
 * Prompt extracted by parsing the inner JSON and reading the `query` field.
 *
 * **Response capture:** Watches for `["finished"]` WebSocket events, then scrapes the
 * last `div main div[class^="_content_"]` element from the DOM.
 *
 * **Quirks:** Uses `sendBlockText: " "`. Messages use a numeric length prefix before
 * the JSON payload (Socket.IO framing).
 */
export class SigmaHandler extends SiteHandler {
  private shouldSend = false;

  constructor(name: string, mode: SiteMode) {
    super(name, mode, {
      websocket: true,
      sendBlockText: " ",
    });
    this.modelName = "Gemma";
    this.modelVersion = "Gemma";
  }

  override promptWsInput(data: unknown): string[] {
    const raw = data as string;
    const match = raw.match(/^\d+/);
    if (!match) return [];

    const prefix = match[0];
    const payload = raw.substring(prefix.length);
    if (!payload) return [];

    try {
      const arr = JSON.parse(payload);
      if (arr && (arr[0] === "search" || arr[0] === "followup")) {
        this.shouldSend = true;
        const inner = JSON.parse(arr[1]);
        if (inner.query) {
          return [inner.query];
        }
      }
    } catch {
      // ignore parse errors
    }
    return [];
  }

  override processEvent(event: unknown): void {
    const raw = event as string;
    const match = raw.match(/^\d+/);
    if (!match) return;

    const prefix = match[0];
    const payload = raw.substring(prefix.length);
    if (!payload) return;

    try {
      const arr = JSON.parse(payload);
      if (arr && arr[0] === "finished" && this.shouldSend) {
        this.shouldSend = false;
        const elements = document.querySelectorAll(
          'div main div[class^="_content_"]'
        );
        if (elements.length > 0) {
          const last = elements[elements.length - 1];
          this.sendAiResponse(extractText(last));
        }
      }
    } catch {
      // ignore parse errors
    }
  }
}
