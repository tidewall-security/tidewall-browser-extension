import { SiteHandler } from "./base";
import type { SiteMode } from "../lib/types";

/**
 * Shape of a conversation entry in Salesforce Agentforce responses.
 */
interface ConversationEntry {
  entryType: string;
  sender: { role: string };
  entryPayload: {
    abstractMessage: {
      staticContent: { text: string };
    };
  };
}

/**
 * Handler for Salesforce Agentforce (*.lightning.force.com).
 *
 * **Transport:** XHR interception with stream reading on POST to
 * `aura.LifecycleAgentConnect.sendMessage` and `getConversationMessages`
 *
 * **Request format:** URL-encoded form data with a `message` parameter
 * containing JSON. User input is at
 * `actions[0].params.lifecycleAgentMessageInputRepresentation.userInput`.
 *
 * **Response capture:** Processes streamed JSON events via `processEvent`.
 * Parses nested JSON in `actions[0].returnValue.response` to find Chatbot
 * messages in `conversationEntries`.
 *
 * **Quirks:** The response JSON is double-encoded (JSON inside a JSON string),
 * requiring two parse steps.
 */
export class SalesforceHandler extends SiteHandler {
  constructor(name: string, mode: SiteMode) {
    super(name, mode, {
      readStream: true,
      xmlhttp: true,
      promptUrls: [
        /aura\.LifecycleAgentConnect\.sendMessage/,
        /aura\.LifecycleAgentConnect\.getConversationMessages/,
      ],
    });
    this.modelName = "Agentforce";
    this.modelVersion = "Agentforce";
  }

  override promptHttpInput(body: unknown): string[] {
    const message = new URLSearchParams(body as string).get("message");
    if (!message) return [];

    const parsed = JSON.parse(message);
    const userInput =
      parsed?.actions?.[0]?.params?.lifecycleAgentMessageInputRepresentation
        ?.userInput;
    if (userInput) {
      return [userInput];
    }
    return [];
  }

  override processEvent(event: unknown): void {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(event as string);
    } catch {
      return;
    }

    if (!data.actions || !(data.actions as unknown[]).length) return;

    const response = (data.actions as Record<string, unknown>[])[0]
      ?.returnValue as Record<string, unknown> | undefined;
    if (!response?.response) return;

    let inner: Record<string, unknown>;
    try {
      inner = JSON.parse(response.response as string);
    } catch {
      return;
    }

    const entries = (inner.conversationEntries as ConversationEntry[]) ?? [];
    const chatbotMessages = entries
      .filter((e) => e.entryType === "Message")
      .filter((e) => e.sender?.role === "Chatbot");

    if (chatbotMessages.length > 0) {
      const text =
        chatbotMessages[0].entryPayload?.abstractMessage?.staticContent?.text;
      if (text) {
        this.sendAiResponse(text);
      }
    }
  }
}
