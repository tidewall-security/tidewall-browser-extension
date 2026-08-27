import { SiteHandler, extractText } from "./base";
import type { SiteMode } from "../lib/types";

/** Default model version when not detected from the stream. */
const DEFAULT_MODEL = "DeepSeek-V3";

/**
 * Handler for DeepSeek (chat.deepseek.com).
 *
 * **Transport:** XHR interception on POST to `/api/v{n}/chat/completion`
 *
 * **Request format:**
 * ```json
 * { "prompt": "user text" }
 * ```
 * Prompt extracted from the `prompt` field.
 *
 * **Model metadata:** Extracted from SSE stream events. Looks for
 * `data:` lines containing JSON with `v.response.model`.
 *
 * **Response capture:** Observes DOM mutations for `aria-disabled` attribute changes
 * (indicating generation complete), then scrapes the last `div.ds-markdown` element.
 */
export class DeepSeekHandler extends SiteHandler {
  constructor(name: string, mode: SiteMode) {
    super(name, mode, {
      xmlhttp: true,
      readStream: true,
      promptUrls: [/\/api\/v\d+\/chat\/completion$/],
    });
    this.modelName = "DeepSeek";
    this.modelVersion = DEFAULT_MODEL;
  }

  override promptHttpInput(body: unknown): string[] {
    const data = JSON.parse(body as string);
    const prompt = data?.prompt;
    if (prompt) {
      return [prompt];
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
          mutation.attributeName === "aria-disabled"
        ) {
          const elements = document.querySelectorAll("div.ds-markdown");
          const last = elements[elements.length - 1];
          if (last) {
            this.sendAiResponse(extractText(last));
          }
          this.responseObserver?.disconnect();
          this.responseObserver = null;
        }
      });
    });

    const root = document.getElementById("root");
    if (root) {
      this.responseObserver.observe(root, {
        attributes: true,
        childList: true,
        subtree: true,
      });
    }
  }

  override processEvent(event: unknown): void {
    const eventStr = event as string;
    const lines = eventStr.split("\n");
    for (const line of lines) {
      if (line?.startsWith("data:")) {
        const payload = line.substring(5).trim();
        try {
          const parsed = JSON.parse(payload);
          if (parsed?.v?.response && "model" in parsed.v.response) {
            this.modelVersion = parsed.v.response.model || DEFAULT_MODEL;
            break;
          }
        } catch {
          // ignore non-JSON data lines
        }
      }
    }
  }
}
