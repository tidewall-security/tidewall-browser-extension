import { SiteHandler, extractText } from "./base";
import type { SiteMode } from "../lib/types";

/**
 * Handler for Microsoft Copilot (copilot.microsoft.com).
 *
 * **Transport:** WebSocket v2 interception with passive monitoring.
 *
 * **Request format:** JSON messages with `{ event: "send", content: [{ type: "text", text: "..." }] }`.
 * Prompt extracted by filtering content items where `type === "text"` and joining their text.
 *
 * **Response capture:** Monitors incoming WebSocket messages for `{ event: "done" }`,
 * then observes DOM mutations for `data-testid="message-item-reactions"` to appear,
 * walks up to the `data-content="ai-message"` container, and extracts all paragraph text.
 */
export class CopilotHandler extends SiteHandler {
  constructor(name: string, mode: SiteMode) {
    super(name, mode, {
      websocketV2: true,
      monitorWebSocket: true,
    });
    this.modelName = "Copilot";
    this.modelVersion = "Copilot";
  }

  override promptWsInput(data: unknown): string[] {
    try {
      const msg = typeof data === "string" ? JSON.parse(data) : data;
      if (msg?.event === "send" && msg?.content) {
        const text = (msg.content as Array<{ type: string; text: string }>)
          .filter((item) => item.type === "text")
          .map((item) => item.text)
          .join(" ");
        if (text) {
          return [text];
        }
      }
    } catch {
      // ignore parse errors
    }
    return [];
  }

  override promptWsOutput(data: unknown): void {
    try {
      const msg = typeof data === "string" ? JSON.parse(data) : data;
      if (msg?.event === "send" && msg?.content) {
        msg.content = (
          msg.content as Array<{ type: string; text?: string }>
        ).map((item) =>
          item.type === "text" ? { ...item, text: "[redacted]" } : item
        );
        this.body = JSON.stringify(msg);
      }
    } catch {
      // ignore parse errors
    }
  }

  override monitorWsResponse(data: unknown): void {
    try {
      const msg = typeof data === "string" ? JSON.parse(data) : data;
      if (msg?.event === "done") {
        setTimeout(() => {
          this.logResponse();
        }, 100);
      }
    } catch {
      // ignore parse errors
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
          mutation.attributeName === "class"
        ) {
          const target = mutation.target as Element;
          if (target.getAttribute("data-testid") === "message-item-reactions") {
            let container: Element | null = target.parentElement;
            while (
              container &&
              container.getAttribute("data-content") !== "ai-message"
            ) {
              container = container.parentElement;
            }
            if (container) {
              const paragraphs = container.querySelectorAll("p");
              const texts: string[] = [];
              paragraphs.forEach((p) => {
                const t = extractText(p);
                if (t) texts.push(t);
              });
              const combined = texts.join(" ");
              if (combined) {
                this.sendAiResponse(combined);
              }
            }
            this.responseObserver?.disconnect();
            this.responseObserver = null;
          }
        }
      });
    });

    const conversationDiv = document.querySelector(
      "div[data-content='conversation']"
    );
    if (conversationDiv) {
      this.responseObserver.observe(conversationDiv, {
        attributes: true,
        childList: true,
        subtree: true,
      });
    }
  }
}
