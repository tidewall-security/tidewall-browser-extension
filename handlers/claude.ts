import { SiteHandler, extractText } from "./base";
import type { SiteMode } from "../lib/types";

/**
 * Handler for Claude (claude.ai).
 *
 * **Transport:** Fetch interception on POST to `/api/organizations/.../chat_conversations/.../completion`
 * and `/retry_completion`.
 *
 * **Request format:**
 * ```json
 * { "prompt": "user text", "parent_message_uuid": "..." }
 * ```
 * Prompt extracted from the `prompt` field. For retry_completion (where prompt
 * may be empty), falls back to the last captured prompt.
 *
 * **Model metadata:** Default is Claude Sonnet 4. Updated from the
 * `/api/organizations/.../model_configs/...` info response endpoint by
 * extracting the `api_model` field.
 *
 * **Response capture:** Observes DOM mutations on the conversation container,
 * waiting for `data-is-streaming` to change to `"false"`, then extracts text
 * from the first child of the streaming element.
 */
export class ClaudeHandler extends SiteHandler {
  private lastPrompt = "";

  constructor(name: string, mode: SiteMode) {
    super(name, mode, {
      fetch: true,
      promptUrls: [
        /\/api\/organizations\/.*\/chat_conversations\/.*\/completion$/,
        /\/api\/organizations\/.*\/chat_conversations\/.*\/retry_completion$/,
      ],
      infoRespUrls: [
        /\/api\/organizations\/[a-z0-9\-]*\/model_configs\/.*/,
      ],
    });
    this.modelName = "Claude Sonnet 4";
    this.modelVersion = "claude-sonnet-4-20250514";
  }

  override promptHttpInput(body: unknown): string[] {
    const data = JSON.parse(body as string);

    // For retry_completion where prompt is empty, use lastPrompt
    if (data?.parent_message_uuid && !data?.prompt && this.lastPrompt) {
      return [this.lastPrompt];
    }

    if (data?.prompt) {
      this.lastPrompt = data.prompt;
      return [data.prompt];
    }
    return [];
  }

  override promptHttpOutput(body: unknown, redacted: string[]): string {
    const data = JSON.parse(body as string);
    data.prompt = redacted[0];
    return JSON.stringify(data);
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
          mutation.attributeName === "data-is-streaming"
        ) {
          const target = mutation.target as Element;
          if (target.getAttribute("data-is-streaming") === "false") {
            const firstChild = target.firstChild;
            if (firstChild) {
              this.sendAiResponse(extractText(firstChild));
            }
            this.responseObserver?.disconnect();
            this.responseObserver = null;
          }
        }
      });
    });

    const header = document.querySelector("header");
    const container =
      header?.nextSibling &&
      (header.nextSibling as Element)?.firstChild &&
      ((header.nextSibling as Element).firstChild as Element)?.firstChild;

    if (container) {
      this.responseObserver.observe(container as Node, {
        attributes: true,
        childList: true,
        subtree: true,
      });
    }
  }

  override metaHttpInput(body: unknown): void {
    const data = body as Record<string, unknown>;
    if (data?.api_model) {
      this.modelVersion = (data.api_model as string).replace(/-claude-ai$/, "");
    }
  }
}
