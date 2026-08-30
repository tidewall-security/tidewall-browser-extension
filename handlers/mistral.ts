import { SiteHandler, extractText } from "./base";
import type { SiteMode } from "../lib/types";

/**
 * Handler for Mistral (mistral.ai).
 *
 * **Transport:** Fetch interception on POST to `/api/chat` and `/api/trpc/message.newChat`
 *
 * **Request format:** Multiple formats depending on the endpoint:
 * - Standard chat: `{ messageInput: [{ type: "text", text: "..." }] }`
 * - New chat (tRPC): `[{ json: { content: [{ type: "text", text: "..." }] } }]`
 * - Start mode: reads `?q=` from the URL search params
 *
 * **Model metadata:** Default is Mistral 7B.
 *
 * **Response capture:** Observes `aria-disabled` attribute on buttons to detect
 * generation complete, then waits 3 seconds and scrapes the last
 * `div[data-message-part-type='answer']` element.
 *
 * **Block cleanup:** Removes the retry button (`button[aria-label='Retry']`).
 */
type Entry = { type?: string; text?: unknown };

/**
 * An entry the guard can read: typed text, holding a string.
 *
 * Emptiness is deliberately not part of it -- see `isTextPart` in the ChatGPT
 * handler for why. A redaction that empties an entry must still round-trip
 * through `PageGuard.prove`.
 */
function isTextEntry(e: Entry): boolean {
  return e?.type === "text" && typeof e.text === "string";
}

function textEntries(list: Entry[]): string[] {
  return list.filter(isTextEntry).map((e) => e.text as string);
}

function rewriteTextEntries(list: Entry[], redacted: string[]): void {
  let next = 0;
  for (const entry of list) {
    if (isTextEntry(entry)) entry.text = redacted[next++];
  }
}

export class MistralHandler extends SiteHandler {
  private newChat = false;

  constructor(name: string, mode: SiteMode) {
    super(name, mode, {
      fetch: true,
      promptUrls: [/\/api\/chat$/, /\/api\/trpc\/message\.newChat/],
    });
    this.modelName = "Mistral";
    this.modelVersion = "Mistral 7B";
  }

  override promptHttpInput(body: unknown): string[] {
    const data = JSON.parse(body as string);

    // EVERY text entry, not element zero.
    //
    // Both shapes are arrays that can mix text with images and attachments.
    // Requiring `[0].type === "text"` meant a message whose first entry was an
    // image failed the branch entirely, fell through, and returned nothing --
    // so the user's text, sitting at index 1, went to Mistral unguarded.
    // FALL THROUGH when an array yields nothing. Returning early on merely
    // HAVING the array was a regression I introduced: `{mode: "start",
    // messageInput: []}` stopped reaching the `q` branch below, so a prompt in
    // the query string went to Mistral unguarded. The original branches
    // required text at index 0 and so fell through by accident; this falls
    // through on purpose.
    if (Array.isArray(data?.messageInput)) {
      const texts = textEntries(data.messageInput);
      if (texts.length) {
        this.newChat = false;
        return texts;
      }
    }
    if (Array.isArray(data?.[0]?.json?.content)) {
      const texts = textEntries(data[0].json.content);
      if (texts.length) {
        this.newChat = true;
        return texts;
      }
    }
    if (data?.mode === "start") {
      this.newChat = true;
      const q = new URLSearchParams(window.location.search).get("q") || "";
      return q ? [q] : [];
    }
    return [];
  }

  override promptHttpOutput(body: unknown, redacted: string[]): unknown {
    const data = JSON.parse(body as string);

    // Same predicate as the extractor, same order, so `redacted[i]` lands on
    // the entry that produced prompt `i`. Non-text entries are left exactly as
    // they were rather than dropped.
    if (Array.isArray(data?.messageInput)) {
      rewriteTextEntries(data.messageInput, redacted);
    } else if (Array.isArray(data?.[0]?.json?.content)) {
      rewriteTextEntries(data[0].json.content, redacted);
    }
    return JSON.stringify(data);
  }

  override runOnBlock(): void {
    setTimeout(() => {
      document.querySelector("button[aria-label='Retry']")?.remove();
    }, 200);
  }

  override logResponse(): void {
    if (this.responseObserver) {
      this.responseObserver.disconnect();
      this.responseObserver = null;
    }

    this.responseObserver = new MutationObserver((mutations) => {
      let handled = false;
      mutations.forEach((mutation) => {
        if (
          !handled &&
          mutation.type === "attributes" &&
          mutation.attributeName === "aria-disabled" &&
          (mutation.target as Element).nodeName === "BUTTON" &&
          (mutation.target as Element).getAttribute("aria-disabled") === "false"
        ) {
          handled = true;
          setTimeout(() => {
            const elements = document.querySelectorAll(
              "div[data-message-part-type='answer']"
            );
            const last = elements[elements.length - 1];
            if (last) {
              this.sendAiResponse(extractText(last));
            }
          }, 3000);
          this.responseObserver?.disconnect();
          this.responseObserver = null;
        }
      });
    });

    const main = document.querySelector("main");
    if (main) {
      this.responseObserver.observe(main, {
        attributes: true,
        childList: false,
        subtree: true,
      });
    }
  }
}
