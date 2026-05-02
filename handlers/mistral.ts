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
    let prompt = "";

    if (data?.messageInput?.length && data.messageInput[0]?.type === "text") {
      this.newChat = false;
      prompt = data.messageInput[0].text;
    } else if (data?.[0]?.json?.content?.[0]?.type === "text") {
      this.newChat = true;
      prompt = data[0].json.content[0].text;
    } else if (data?.mode === "start") {
      this.newChat = true;
      prompt =
        new URLSearchParams(window.location.search).get("q") || "";
    }

    if (prompt) {
      return [prompt];
    }
    return [];
  }

  override promptHttpOutput(body: unknown): void {
    const data = JSON.parse(body as string);
    if (data?.messageInput?.length && data.messageInput[0]?.type === "text") {
      data.messageInput[0].text = "[redacted]";
    } else if (data?.[0]?.json?.content?.[0]?.type === "text") {
      data[0].json.content[0].text = "[redacted]";
    }
    this.body = JSON.stringify(data);
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
