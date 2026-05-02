import { SiteHandler, extractText } from "./base";
import type { SiteMode } from "../lib/types";

/**
 * Handler for Meta AI (www.meta.ai).
 *
 * **Transport:** XHR interception on POST to `/api/graphql/` and `/graphql?locale=user`
 *
 * **Request format:** FormData with a `variables` field containing JSON.
 * Prompt extracted from `variables.message.sensitive_string_value`.
 *
 * **Model metadata:** Default is Llama 4.
 *
 * **Response capture:** Observes DOM mutations for `data-visualcompletion="ignore"` class
 * changes, then scrapes the last `div.html-div` element. Observes the element
 * adjacent to the progress bar for streaming completion signals.
 *
 * **Quirks:** Uses FormData (not JSON) for the request body, which is unique among handlers.
 */
export class MetaHandler extends SiteHandler {
  constructor(name: string, mode: SiteMode) {
    super(name, mode, {
      xmlhttp: true,
      promptUrls: [/\/api\/graphql\//, /\/graphql\?locale=user/],
    });
    this.modelName = "Llama";
    this.modelVersion = "Llama 4";
  }

  override promptHttpInput(body: unknown): string[] {
    if (typeof body === "object" && body instanceof FormData) {
      const variables = body.get("variables") as string | null;
      if (variables) {
        const parsed = JSON.parse(variables);
        const message = parsed?.message?.sensitive_string_value;
        if (message) {
          return [message];
        }
      }
    }
    return [];
  }

  override promptHttpOutput(body: unknown): void {
    const formData = body as FormData;
    const variables = formData.get("variables") as string | null;
    if (variables) {
      const parsed = JSON.parse(variables);
      if (parsed?.message?.sensitive_string_value) {
        parsed.message.sensitive_string_value = "[redacted]";
        formData.set("variables", JSON.stringify(parsed));
      }
    }
    this.body = formData;
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
          mutation.attributeName === "class" &&
          (mutation.target as Element).getAttribute("data-visualcompletion") ===
            "ignore"
        ) {
          handled = true;
          const elements = document.querySelectorAll("div.html-div");
          const last = elements[elements.length - 1];
          if (last) {
            this.sendAiResponse(extractText(last));
          }
          this.responseObserver?.disconnect();
          this.responseObserver = null;
        }
      });
    });

    const progressBar = document.querySelector(
      "div[role='progressbar']"
    )?.nextElementSibling;
    if (progressBar) {
      this.responseObserver.observe(progressBar, {
        attributes: true,
        childList: true,
        subtree: true,
      });
    }
  }
}
