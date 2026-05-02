import { SiteHandler } from "./base";
import type { SiteMode } from "../lib/types";

/**
 * Handler for Copy AI (app.copy.ai).
 *
 * **Transport:** XHR interception with stream reading on POST to
 * `/v1/workspaces/{id}/teamspaces/{id}/conversations/ask` and `/conversations?conversationUUID`
 *
 * **Request format:**
 * ```json
 * { "text": "user text" }
 * ```
 * Prompt extracted from the `text` field.
 *
 * **Model metadata:** Scraped from the `div[data-testid='select-dropdown']` DOM element.
 * Detects GPT vs Claude model families from the dropdown text.
 *
 * **Response capture:** Tracks conversation histories via `processEvent`, matching
 * on UUID between "RUNNING" and "DONE" statuses to capture the final response text.
 */
export class CopyAIHandler extends SiteHandler {
  private promptId = "";

  constructor(name: string, mode: SiteMode) {
    super(name, mode, {
      xmlhttp: true,
      readStream: true,
      promptUrls: [
        /\/v1\/workspaces\/\d+\/teamspaces\/\d+\/conversations\/ask/,
        /\/v1\/workspaces\/\d+\/teamspaces\/\d+\/conversations\?conversationUUID/,
      ],
    });
    this.modelName = "GPT";
    this.modelVersion = "GPT-3.5";
  }

  override promptHttpInput(body: unknown): string[] {
    const data = JSON.parse(body as string);
    const dropdown = document.querySelector(
      "div[data-testid='select-dropdown']"
    );
    if (dropdown) {
      const text = dropdown.textContent || "";
      if (text.startsWith("GPT")) {
        this.modelName = "GPT";
      } else if (text.startsWith("Claude")) {
        this.modelName = "Claude";
      } else {
        this.modelName = text;
      }
      this.modelVersion = text;
    }
    if (data?.text) {
      return [data.text];
    }
    return [];
  }

  override processEvent(event: unknown): void {
    const data = event as {
      conversationHistories?: Array<{
        uuid: string;
        status: string;
        text: string;
      }>;
    };
    if (data?.conversationHistories?.length) {
      const last =
        data.conversationHistories[data.conversationHistories.length - 1];
      if (last) {
        if (last.status === "RUNNING") {
          this.promptId = last.uuid;
        } else if (
          this.promptId &&
          this.promptId === last.uuid &&
          last.status === "DONE"
        ) {
          this.promptId = "";
          this.sendAiResponse(last.text);
        }
      }
    }
  }
}
