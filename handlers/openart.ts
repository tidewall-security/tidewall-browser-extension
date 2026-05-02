import { SiteHandler } from "./base";
import type { SiteMode } from "../lib/types";

/**
 * Handler for OpenArt AI (openart.ai).
 *
 * **Transport:** XHR interception on POST to `/api/create`
 *
 * **Request format:**
 * ```json
 * { "prompt": "image description", "base_model": "KandooAI/Juggernaut-XL" }
 * ```
 * Prompt extracted from the `prompt` field. Model metadata extracted from `base_model`,
 * with the model name derived from the portion before the `/` separator.
 *
 * **Response capture:** Not implemented (image generation site).
 */
export class OpenArtHandler extends SiteHandler {
  constructor(name: string, mode: SiteMode) {
    super(name, mode, {
      xmlhttp: true,
      promptUrls: [/\/api\/create$/],
    });
    this.modelName = "KandooAI";
    this.modelVersion = "KandooAI/Juggernaut-XL";
  }

  override promptHttpInput(body: unknown): string[] {
    const data = JSON.parse(body as string);
    if (data?.base_model) {
      this.modelVersion = data.base_model;
      const parts = this.modelVersion.split("/");
      this.modelName = parts.length > 1 ? parts[0] : this.modelVersion;
    }
    if (data?.prompt) {
      return [data.prompt];
    }
    return [];
  }
}
