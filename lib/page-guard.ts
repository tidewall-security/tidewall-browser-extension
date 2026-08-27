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
import { decideRequest, planExtraction, type RequestVerdict } from "./decide";

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
  notify(kind: "blocked", summary: string): void;
}

export class PageGuard {
  constructor(
    private readonly handler: SiteHandler,
    private readonly mode: SiteMode,
    private readonly bridge: GuardBridge,
  ) {
    this.handler.mode = mode;
  }

  /** An HTTP request — fetch or XHR. `body` is the caller's real object. */
  async inspectHttp(url: string, method: string, body: unknown): Promise<RequestVerdict> {
    const h = this.handler;
    if (!h.captureFetch && !h.captureGet && !h.captureXmlHttp) return { action: "pass" };
    if (!h.disableFilter && !h.filterRequestUrl(url)) return { action: "pass" };
    if (method === "GET" && !h.captureGet) return { action: "pass" };

    return this.run(planExtraction(h.classifyHttp(body), this.mode));
  }

  /** A WebSocket frame. */
  async inspectWs(frame: unknown): Promise<RequestVerdict> {
    const h = this.handler;
    if (!h.captureWebSocket && !h.captureWebSocketV2) return { action: "pass" };

    return this.run(planExtraction(h.classifyWs(frame), this.mode));
  }

  private async run(plan: ReturnType<typeof planExtraction>): Promise<RequestVerdict> {
    if (plan.act === "pass") return { action: "pass" };
    if (plan.act === "block") return this.refuse(plan.summary);

    const result = await this.bridge.ask(plan.prompts, this.meta());
    const verdict = decideRequest(result);
    return verdict.action === "blocked" ? this.refuse(verdict.summary) : verdict;
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
