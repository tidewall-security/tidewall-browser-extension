import { SiteHandler, extractText } from "./base";
import type { SiteMode } from "../lib/types";

/**
 * Handler for Notion AI (www.notion.so).
 *
 * **Transport:** Fetch interception on POST to `/api/v3/runAssistantV2` and `/api/v3/runInferenceTranscript`
 *
 * **Request format:** JSON with a `transcript` array of `{ type, value }` entries.
 * Extracts the last entry where `type === "user"` or `"human"`. The value field
 * may be a nested array, an XML-like `<chat><text>...</text></chat>` string, or plain text.
 *
 * **Response capture:** Scrapes `div[data-active-edit-reference-id]` from the DOM.
 *
 * **Quirks:** Uses `sendBlockText: " "`. The transcript value format varies
 * between different Notion AI features (assistant vs. inference).
 */
export class NotionHandler extends SiteHandler {
  constructor(name: string, mode: SiteMode) {
    super(name, mode, {
      fetch: true,
      sendBlockText: " ",
      promptUrls: [
        /\/api\/v3\/runAssistantV2$/,
        /\/api\/v3\/runInferenceTranscript$/,
      ],
    });
    this.modelName = "GPT-4";
    this.modelVersion = "GPT-4o";
  }

  override promptHttpInput(body: unknown): string[] {
    const data = JSON.parse(body as string);
    const transcript: Array<{ type: string; value: unknown }> =
      data?.transcript || [];
    const entry = [...transcript].reverse().find(
      (t) => t.type === "user" || t.type === "human"
    );
    if (entry?.value) {
      let text: string;
      if (Array.isArray(entry.value)) {
        text = (entry.value as string[][])[0]?.[0] ?? "";
      } else if (
        typeof entry.value === "string" &&
        entry.value.startsWith("<chat><text>")
      ) {
        text = entry.value
          .replace(/^<chat><text>/, "")
          .replace(/<\/text><\/chat>$/, "");
      } else {
        text = String(entry.value);
      }
      if (text) {
        return [text];
      }
    }
    return [];
  }

  override logResponse(): void {
    const el = document.querySelector(
      "div[data-active-edit-reference-id]"
    );
    if (el) {
      this.sendAiResponse(extractText(el));
    }
  }
}
