import { SiteHandler } from "./base";
import type { SiteMode } from "../lib/types";

/**
 * Handler for Character AI (character.ai).
 *
 * **Transport:** WebSocket interception.
 *
 * **Request format:** JSON with `{ command: "create_and_generate_turn", payload: { turn: { candidates: [{ raw_content: "..." }] } } }`.
 * Prompt extracted from `payload.turn.candidates[0].raw_content`.
 *
 * **Response capture:** Processes WebSocket events for `command: "update_turn"` where
 * `turn.candidates[0].is_final === true`, then extracts `raw_content`.
 */
export class CharacterHandler extends SiteHandler {
  constructor(name: string, mode: SiteMode) {
    super(name, mode, {
      websocket: true,
    });
    this.modelName = "CharacterAI";
    this.modelVersion = "character-ai";
  }

  override promptWsInput(data: unknown): string[] {
    const msg = JSON.parse(data as string);
    if (
      msg?.command === "create_and_generate_turn" &&
      msg.payload?.turn?.candidates?.[0]
    ) {
      const raw = msg.payload.turn.candidates[0].raw_content;
      if (raw) {
        return [raw];
      }
    }
    return [];
  }

  override processEvent(event: unknown): void {
    const msg = JSON.parse(event as string);
    if (
      msg?.command === "update_turn" &&
      msg.turn?.candidates?.[0]?.is_final
    ) {
      this.sendAiResponse(msg.turn.candidates[0].raw_content);
    }
  }
}
