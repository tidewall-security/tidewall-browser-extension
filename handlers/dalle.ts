import { SiteHandler } from "./base";
import type { SiteMode } from "../lib/types";

/**
 * Handler for DALL-E Free (www.dall-efree.com).
 *
 * **Transport:** XHR interception on POST to `/api/generateImage`
 *
 * **Request format:** FormData with a `prompt` field.
 * Prompt extracted via `formData.get("prompt")`.
 *
 * **Model metadata:** Reports as "Replicate Ai" (the backend used by this free DALL-E site).
 *
 * **Response capture:** Not implemented (image generation sites don't produce text responses).
 */
export class DalleHandler extends SiteHandler {
  constructor(name: string, mode: SiteMode) {
    super(name, mode, {
      xmlhttp: true,
      promptUrls: [/\/api\/generateImage$/],
    });
    this.modelName = "Replicate Ai";
    this.modelVersion = "Replicate Ai";
  }

  override promptHttpInput(body: unknown): string[] {
    const formData = body as FormData;
    const prompt = formData?.get?.("prompt");
    if (prompt) {
      return [String(prompt)];
    }
    return [];
  }
}
