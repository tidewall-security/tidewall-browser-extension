/**
 * The guard, running in the PAGE WORLD.
 *
 * This is where inspection has to happen, because this is where the real
 * request object still exists. The content script only ever received
 * `String(body)`, so a `FormData`, `URLSearchParams`, `Blob` or byte array
 * arrived as `"[object …]"` — unreadable, and impossible to rewrite. That is
 * the layering defect behind redaction never having worked.
 *
 * Only the guard call needs extension APIs, so it is the only thing that
 * crosses the bridge. Nothing but strings crosses it.
 *
 * THREAT MODEL: cooperative page. A hostile document can forge the verdict on
 * this relay, swap the primitives an adapter parses with, or keep a
 * pre-interception `fetch`. That is inherent to inspecting traffic by
 * monkey-patching and is documented rather than defended against.
 */

import type { SiteHandler } from "../handlers/base";
import type { PromptScanResult, SiteMode } from "./types";
import { decideRequest, planExtraction, CANNOT_REWRITE, type RequestVerdict } from "./decide";

export interface CallMetadata {
  application: string;
  modelName: string;
  modelVersion: string;
}

export interface GuardBridge {
  /** Ask the guard about extracted prompts. Strings out, verdict back. */
  ask(prompts: string[], meta: CallMetadata): Promise<PromptScanResult>;
  /** Report an observed answer for logging. */
  report(text: string, meta: CallMetadata): void;
  /** Surface a decision to the user. */
  notify(kind: "blocked" | "transformed", summary: string): void;
}

/** Shown when the guard could not be reached or did not answer usefully. */
/** Shown when the guard's replacement count does not match what was found. */
export const CARDINALITY =
  "Blocked: the guard's response did not match this request, so it was not sent.";

export const NO_VERDICT =
  "Blocked: this prompt could not be checked, so it was not sent.";

/** A reply is only a verdict if it actually carries one. */
function isVerdict(value: unknown): value is PromptScanResult {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as PromptScanResult).blocked === "boolean" &&
    typeof (value as PromptScanResult).transformed === "boolean"
  );
}

export class PageGuard {
  constructor(
    private readonly handler: SiteHandler,
    private readonly mode: SiteMode,
    private readonly bridge: GuardBridge,
  ) {
    this.handler.mode = mode;
    // Response observation reaches the bridge through the handler's own
    // output callback. Without this, `logResponse` scrapes an answer and
    // `sendAiResponse` drops it: `_sendOutput` is unbound.
    this.handler.bindMessaging(
      async () => { throw new Error("guard calls go through inspectHttp/inspectWs"); },
      (text: string) => { this.reportAnswer(text); },
    );
  }

  /**
   * An HTTP request. `body` is the caller's real object.
   *
   * The transport is explicit because the flags are per-transport: a handler
   * declaring `fetch` must not start guarding XHR just because both arrive
   * here, which is what conflating them did.
   */
  async inspectHttp(
    transport: "fetch" | "xhr",
    url: string,
    method: string,
    body: unknown,
  ): Promise<RequestVerdict> {
    const h = this.handler;
    if (transport === "xhr") {
      if (!h.captureXmlHttp) return { action: "pass" };
    } else {
      if (!h.captureFetch && !h.captureGet) return { action: "pass" };
      if (method === "GET" && !h.captureGet) return { action: "pass" };
    }
    if (!h.disableFilter && !h.filterRequestUrl(url)) return { action: "pass" };

    return this.run(planExtraction(h.classifyHttp(body), this.mode), body);
  }

  /** A WebSocket frame. */
  async inspectWs(frame: unknown): Promise<RequestVerdict> {
    const h = this.handler;
    if (!h.captureWebSocket && !h.captureWebSocketV2) return { action: "pass" };

    return this.run(planExtraction(h.classifyWs(frame), this.mode), frame);
  }

  private async run(
    plan: ReturnType<typeof planExtraction>,
    body: unknown,
  ): Promise<RequestVerdict> {
    if (plan.act === "pass") return { action: "pass" };
    if (plan.act === "block") return this.refuse(plan.summary);

    // FAIL CLOSED on anything that is not a verdict.
    //
    // The relay resolves `{action:"pass"}` at its 30-second timeout, and a
    // lost, dropped or version-skewed reply looks the same. Treating those as
    // a clean scan sends the original prompt — a leak arriving as an accident
    // rather than a decision.
    let result: PromptScanResult;
    try {
      result = await this.bridge.ask(plan.prompts, this.meta());
    } catch {
      return this.refuse(NO_VERDICT);
    }
    if (!isVerdict(result)) return this.refuse(NO_VERDICT);

    const verdict = decideRequest(result);
    if (verdict.action === "blocked") return this.refuse(verdict.summary);
    if (verdict.action === "rewrite") return this.prove(body, plan.prompts, verdict.redacted, result.summary);
    return verdict;
  }

  /**
   * Apply the guard's redaction, then prove it was applied.
   *
   * Re-extract from the REWRITTEN body and require the result to EQUAL the
   * replacement vector. Not "the original is absent" — an adapter that writes
   * `""` satisfies absence while deleting the prompt, and re-extraction then
   * returns nothing at all because extractors filter falsy values.
   *
   * Run immediately before the send, so the page cannot mutate a shared
   * FormData or byte array between the check and the use.
   */
  private async prove(
    body: unknown,
    extracted: string[],
    redacted: string[],
    summary: string,
  ): Promise<RequestVerdict> {
    if (redacted.length !== extracted.length) return this.refuse(CARDINALITY);

    let rewritten: unknown;
    try {
      rewritten = await this.handler.promptHttpOutput(body, redacted);
    } catch {
      return this.refuse(CANNOT_REWRITE);
    }
    if (rewritten === undefined || rewritten === null) return this.refuse(CANNOT_REWRITE);

    const after = this.handler.classifyHttp(rewritten);
    if (after.kind !== "prompt" && after.kind !== "unsupportedPrompt") {
      return this.refuse(CANNOT_REWRITE);
    }
    const found = after.prompts;
    if (found.length !== redacted.length || found.some((v, i) => v !== redacted[i])) {
      return this.refuse(CANNOT_REWRITE);
    }

    // Only NOW is it true that a redaction happened, so only now is it
    // announced and counted. Announcing on the verdict alone is what told
    // users their prompt had been redacted when it had not.
    this.bridge.notify("transformed", summary);
    return { action: "transformed", body: rewritten };
  }

  private refuse(summary: string): RequestVerdict {
    this.bridge.notify("blocked", summary);
    this.handler.runOnBlock();
    return { action: "blocked", summary };
  }

  private meta(): CallMetadata {
    return this.handler.getMetaData();
  }

  // -- response observation, which also belongs here --------------------------
  //
  // These read the DOM and the streamed response, both of which live in this
  // world. Only the eventual text crosses the bridge.

  onStreamChunk(chunk: unknown): void { this.handler.processEvent(chunk); }
  onStreamEnd(url: string): void { this.handler.logResponse(url); }
  onWsMessage(data: unknown): void { this.handler.monitorWsResponse(data); }
  onInfoResponse(body: unknown): void { this.handler.metaHttpInput(body); }

  reportAnswer(text: string): void {
    if (text) this.bridge.report(text, this.meta());
  }
}
