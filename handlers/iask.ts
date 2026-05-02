import { SiteHandler, extractText } from "./base";
import type { SiteMode } from "../lib/types";

/**
 * Handler for iAsk (iask.ai).
 *
 * **Transport:** WebSocket interception.
 *
 * **Request format:** Array-based WebSocket messages where index 4 contains
 * `{ type: "form", event: "submit", value: "q=user+text" }`.
 * Prompt extracted by parsing the `value` as URL-encoded form data and reading the `q` parameter.
 *
 * **Response capture:** Watches for WebSocket events matching `[null, ...]` with length 5,
 * then waits 2 seconds and scrapes the `#text` element from the DOM (excluding the last child).
 *
 * **Quirks:** Uses a `responseSent` flag to avoid sending duplicate responses.
 */
export class IAskHandler extends SiteHandler {
  private responseSent = true;

  constructor(name: string, mode: SiteMode) {
    super(name, mode, {
      websocket: true,
    });
    this.modelName = "iAsk Pro";
    this.modelVersion = "iAsk Pro";
  }

  override promptWsInput(data: unknown): string[] {
    const msg = JSON.parse(data as string);
    const entry = msg && msg.length > 4 ? msg[4] : null;
    if (entry?.type === "form" && entry?.event === "submit") {
      const query = new URLSearchParams(entry.value).get("q");
      if (query) {
        this.responseSent = false;
        return [query];
      }
    }
    return [];
  }

  override processEvent(event: unknown): void {
    const msg = JSON.parse(event as string);
    if (!this.responseSent && msg.length === 5 && msg[0] === null) {
      this.responseSent = true;
      setTimeout(() => {
        const el = document.getElementById("text")?.cloneNode(true) as HTMLElement | null;
        if (el) {
          const last = el.lastElementChild;
          if (last) el.removeChild(last);
          this.sendAiResponse(extractText(el));
        }
      }, 2000);
    }
  }
}
