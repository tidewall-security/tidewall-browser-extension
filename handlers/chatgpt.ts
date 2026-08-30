import { SiteHandler, extractText } from "./base";
import type { SiteMode } from "../lib/types";

/**
 * A part the guard can read: a string.
 *
 * Emptiness is deliberately NOT part of this. The predicate runs twice -- once
 * to extract, once to write back -- and `PageGuard.prove` re-extracts from the
 * rewritten body to check the rewrite landed. If a redaction replaced a part
 * with "" and this excluded empty strings, the re-extraction would come back
 * one short and a legitimate rewrite would be refused as unproven.
 *
 * The cost is that a message carrying an empty text part now reaches the guard
 * with an empty prompt in it, which is noise rather than harm.
 *
 * KNOWN LIMIT, and it is not this handler's to fix: a message with more than
 * one text part cannot currently be TRANSFORMED. The content script joins
 * every extracted prompt into a single guard message, the guard returns one
 * replacement, and `PageGuard.prove` requires as many replacements as prompts
 * -- so the verdict is refused for cardinality and the request blocks.
 *
 * That is fail-closed and it is an improvement on what happened before, which
 * was to redact `parts[0]` and replace the WHOLE array with it, silently
 * deleting every attachment and any later text from the user's message. But
 * multi-part redaction needs the pipeline to carry prompts separately.
 */
function isTextPart(part: unknown): part is string {
  return typeof part === "string";
}

/** Every readable text part of the first message, in order. */
function textParts(data: { messages?: Array<{ content?: { parts?: unknown[] } }> }): string[] {
  const parts = data?.messages?.[0]?.content?.parts;
  return Array.isArray(parts) ? parts.filter(isTextPart) : [];
}

/**
 * Handler for ChatGPT (chatgpt.com).
 *
 * **Transport:** Fetch interception on POST to `/conversation`
 *
 * **Request format:**
 * ```json
 * { "model": "gpt-4o", "messages": [{ "content": { "parts": ["user text"] } }] }
 * ```
 * Prompt extracted from `messages[0].content.parts[0]`.
 *
 * **Model metadata:** From the `model` field. `"auto"` maps to the default model (GPT-5-2).
 *
 * **Response capture:** Watches the SSE stream for `data: [DONE]`, then scrapes the
 * last `div.prose` element from the DOM after a 3-second delay.
 *
 * **Block cleanup:** Removes the regenerate/error button (`[data-testid='regenerate-thread-error-button']`).
 */
export class ChatGPTHandler extends SiteHandler {
  private defaultModel = "GPT-5-2";

  constructor(name: string, mode: SiteMode) {
    super(name, mode, {
      fetch: true,
      readStream: true,
      promptUrls: [/\/conversation$/],
    });
  }

  override promptHttpInput(body: unknown): string[] {
    const data = JSON.parse(body as string);
    if (data?.model) {
      if (data.model === "auto") {
        this.modelVersion = this.defaultModel;
      } else {
        this.modelVersion = data.model.replace(/^gpt/, "GPT");
      }
      this.modelName = this.modelVersion;
    }
    // EVERY text part, not `parts[0]`.
    //
    // `parts` is an array and a prompt can mix text with attachment
    // references. Reading only element zero meant a message whose first part
    // was an attachment returned that OBJECT as the prompt -- the guard was
    // handed `{asset_pointer: ...}` where a string was expected, and the
    // user's actual text, sitting at index 1, was never inspected at all.
    //
    // Non-string parts are skipped rather than stringified: they are
    // references to content this adapter cannot read, and feeding their JSON
    // to the guard would scan a URL rather than a prompt while reporting that
    // the prompt had been scanned.
    return textParts(data);
  }

  override promptHttpOutput(body: unknown, redacted: string[]): unknown {
    const data = JSON.parse(body as string);
    const parts = data?.messages?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return JSON.stringify(data);

    // Same predicate as the extractor, walked in the same order, so
    // `redacted[i]` lands on the part that produced prompt `i`. The previous
    // version replaced the WHOLE array with `[redacted[0]]`, which discarded
    // every attachment reference in the message along with any text after the
    // first.
    let next = 0;
    data.messages[0].content.parts = parts.map((part: unknown) =>
      isTextPart(part) ? redacted[next++] : part,
    );
    return JSON.stringify(data);
  }

  override logResponse(): void {
    setTimeout(() => {
      const elements = document.querySelectorAll("div.prose");
      if (elements.length > 0) {
        const last = elements[elements.length - 1];
        this.sendAiResponse(extractText(last));
      }
    }, 3000);
  }

  override processEvent(event: unknown): void {
    const eventStr = event as string;
    if (eventStr.startsWith("data: [DONE]")) {
      this.logResponse();
    }
  }

  override runOnBlock(): void {
    setTimeout(() => {
      document
        .querySelector("[data-testid='regenerate-thread-error-button']")
        ?.remove();
    }, 200);
  }
}
