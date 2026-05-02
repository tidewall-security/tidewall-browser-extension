import { SiteHandler, extractText } from "./base";
import type { SiteMode } from "../lib/types";

/**
 * Handler for Askan.ai (www.askan.ai).
 *
 * **Transport:** XHR interception (matches all URLs via `/` pattern).
 *
 * **Request format:** Does not extract from the request body. Instead, reads
 * the prompt directly from the DOM input field `#sppb-form-builder-field-0`.
 *
 * **Model metadata:** Default is GPT-3.5.
 *
 * **Response capture:** On page navigation, scrapes `#sp-component div[itemprop='articleBody']`.
 * The site renders responses as separate page navigations rather than inline.
 *
 * **Quirks:** Prompt extraction from DOM rather than request body is unusual.
 * The site uses Joomla/SP Page Builder, hence the `sppb-` prefixed selectors.
 */
export class AskanAIHandler extends SiteHandler {
  constructor(name: string, mode: SiteMode) {
    super(name, mode, {
      xmlhttp: true,
      promptUrls: [/\//],
    });
    this.modelName = "GPT-3";
    this.modelVersion = "GPT-3.5";
  }

  override promptHttpInput(_body: unknown): string[] {
    const input = document.querySelector(
      "#sppb-form-builder-field-0"
    ) as HTMLInputElement | null;
    if (input?.value) {
      return [input.value];
    }
    return [];
  }

  override logResponse(): void {
    // On navigation, scrape article body
    if (
      window.performance.getEntriesByType(
        "navigation"
      )[0] &&
      (
        window.performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming
      ).type === "navigate"
    ) {
      const elements = document.querySelectorAll(
        "#sp-component div[itemprop='articleBody']"
      );
      if (elements.length > 0) {
        const last = elements[elements.length - 1];
        this.sendAiResponse(extractText(last));
      }
    }
  }
}
