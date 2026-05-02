import { SiteHandler } from "./base";
import type { SiteMode } from "../lib/types";

/** ASCII Record Separator used by M365 Copilot to delimit batched JSON messages. */
const MESSAGE_DELIMITER = "\x1e";

interface M365Message {
  target?: string;
  type?: number;
  arguments?: Array<{
    message?: {
      author?: string;
      text?: string;
    };
  }>;
  item?: {
    messages?: Array<{
      author?: string;
      turnState?: string;
      text?: string;
      adaptiveCards?: Array<{
        body?: Array<{ text?: string }>;
      }>;
    }>;
  };
}

/** Parse batched JSON messages separated by the record separator character. */
function parseBatchedMessages(raw: unknown): M365Message[] {
  const str = typeof raw === "string" ? raw : String(raw);
  return str
    .split(MESSAGE_DELIMITER)
    .filter((s) => s.length > 0)
    .flatMap((s) => {
      try {
        return [JSON.parse(s) as M365Message];
      } catch {
        return [];
      }
    });
}

/**
 * Handler for Microsoft 365 Copilot (m365.cloud.microsoft/chat).
 *
 * **Transport:** WebSocket v2 interception with passive monitoring.
 *
 * **Request format:** Batched JSON messages delimited by ASCII Record Separator (`\x1e`).
 * User prompts are in messages where `target === "chat"` and `type === 4`, extracted
 * from `arguments[0].message.text` where `author === "user"`.
 *
 * **Response capture:** Monitors incoming WebSocket messages for `type === 2` (completion)
 * messages. Extracts bot responses from `item.messages` where `author === "bot"` and
 * `turnState === "Completed"`, preferring adaptive card body text over plain text.
 *
 * **Quirks:** Uses the `\x1e` delimiter for batched message framing, which is unique
 * to the SignalR-based M365 Copilot protocol.
 */
export class M365CopilotHandler extends SiteHandler {
  constructor(name: string, mode: SiteMode) {
    super(name, mode, {
      websocketV2: true,
      monitorWebSocket: true,
    });
    this.modelName = "M365 Copilot";
    this.modelVersion = "M365 Copilot";
  }

  override promptWsInput(data: unknown): string[] {
    const messages = parseBatchedMessages(data);
    for (const msg of messages) {
      if (msg.target === "chat" && msg.type === 4) {
        const inner = msg.arguments?.[0]?.message;
        if (inner?.author === "user" && inner?.text) {
          return [inner.text];
        }
      }
    }
    return [];
  }

  override promptWsOutput(data: unknown): void {
    const messages = parseBatchedMessages(data);
    for (const msg of messages) {
      if (msg.target === "chat" && msg.type === 4) {
        const inner = msg.arguments?.[0]?.message;
        if (inner?.author === "user" && inner?.text) {
          inner.text = "[redacted]";
        }
      }
    }
    this.body = messages
      .map((msg) => JSON.stringify(msg) + MESSAGE_DELIMITER)
      .join("");
  }

  override monitorWsResponse(data: unknown): void {
    const messages = parseBatchedMessages(data);
    for (const msg of messages) {
      if (msg.type === 2 && msg.item?.messages) {
        const botMessages = msg.item.messages.filter(
          (m) => m.author === "bot" && m.turnState === "Completed"
        );
        if (botMessages.length > 0) {
          const last = botMessages[botMessages.length - 1];
          const text =
            last.adaptiveCards?.[0]?.body?.[0]?.text || last.text;
          if (text) {
            this.sendAiResponse(text);
          }
        }
      }
    }
  }
}
