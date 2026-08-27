/**
 * Page-world capture script — injected into the main page context to intercept
 * network requests before they leave the browser.
 *
 * This script runs in the page's JavaScript world (not the extension's isolated
 * content script world), which allows it to monkey-patch `window.fetch`,
 * `XMLHttpRequest`, and `WebSocket` directly.
 *
 * **Three interception mechanisms:**
 * 1. **Fetch** — wraps `window.fetch()` to intercept POST/GET requests
 * 2. **XHR** — wraps `XMLHttpRequest.open/send` to intercept XHR requests
 * 3. **WebSocket** — replaces the `WebSocket` constructor to intercept `.send()`
 *
 * **Communication protocol:**
 * The capture script communicates with the content script via CustomEvents on
 * `window`. Two event channels are used:
 * - `tidewall-capture` (outgoing) — capture script sends intercepted data
 * - `tidewall-capture-response` (incoming) — content script sends guard decisions
 *
 * Each message carries a unique `id` so responses can be correlated. The
 * {@link sendToContent} function implements request-response with a 30-second
 * timeout (defaults to "pass" on timeout). {@link notifyContent} is fire-and-forget
 * for streaming events and response data.
 *
 * This architecture follows the established collector pattern used by major AI security platforms.
 *
 * @module entrypoints/capture
 */

import { PageGuard, requestParts } from "../lib/page-guard";
import { getHandler } from "../handlers/index";
import type { SiteMode, PromptScanResult } from "../lib/types";

export default defineUnlistedScript(() => {
  // Configuration handed over by the content script on the script tag.
  const config = (() => {
    try {
      return JSON.parse(
        (document.currentScript as HTMLScriptElement | null)?.dataset.tidewall ?? "{}",
      ) as { alias?: string; mode?: SiteMode; channel?: string };
    } catch {
      return {};
    }
  })();

  const OUTGOING = `tidewall-capture-${config.channel ?? ""}`;
  const RESPONSE = `tidewall-capture-response-${config.channel ?? ""}`;

  let messageId = 0;

  /**
   * Send a message to the content script and wait for a correlated response.
   *
   * Dispatches a CustomEvent on `window` with a unique message ID, then
   * listens for a response event with the same ID. If no response arrives
   * within 30 seconds, resolves with `{ action: "pass" }` to avoid blocking
   * the intercepted request indefinitely.
   *
   * @param type - Message type identifier (e.g., "interceptFetch", "interceptXhr", "interceptWs")
   * @param payload - Data to send (URL, method, body, etc.)
   * @returns Promise resolving to the content script's response (action: "pass" | "blocked" | "transformed")
   */
  function sendToContent(
    type: string,
    payload: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve) => {
      const id = String(++messageId);

      const timeout = setTimeout(() => {
        window.removeEventListener(RESPONSE, handler);
        resolve({ action: "pass" });
      }, 30_000);

      function handler(e: Event) {
        const detail = (e as CustomEvent).detail;
        if (detail?.id !== id) return;
        window.removeEventListener(RESPONSE, handler);
        clearTimeout(timeout);
        resolve(detail);
      }

      window.addEventListener(RESPONSE, handler);

      window.dispatchEvent(
        new CustomEvent(OUTGOING, { detail: { ...payload, type, id } })
      );
    });
  }

  /**
   * Fire-and-forget notification to the content script (no response expected).
   *
   * Used for streaming events (streamEvent, streamDone), WebSocket messages
   * (wsMessage), and XHR responses (xhrResponse) where the capture script
   * does not need to wait for a guard decision.
   *
   * @param type - Message type identifier
   * @param payload - Data to send
   */
  function notifyContent(type: string, payload: Record<string, unknown>): void {
    window.dispatchEvent(
      new CustomEvent(OUTGOING, {
        detail: { ...payload, type, id: String(++messageId) },
      })
    );
  }

  // ── Fetch interception ───────────────────────────────────────────────────

  // THE GUARD LIVES HERE, in the page world, because this is where the real
  // request object still exists. Only the guard call crosses the bridge.
  const handler = config.alias ? getHandler(config.alias, config.mode ?? "block") : null;
  const pageGuard = handler
    ? new PageGuard(handler, config.mode ?? "block", {
        ask: async (prompts, meta) => {
          const reply = await sendToContent("guardPrompt", { prompts, meta });
          return (reply.result as PromptScanResult) ?? {
            blocked: false, transformed: false, summary: "",
          };
        },
        report: (text, meta) => { void sendToContent("reportAnswer", { text, meta }); },
        notify: (kind, summary) => { void sendToContent("notify", { kind, summary }); },
      })
    : null;

  const originalFetch = window.fetch;

  window.fetch = async function patchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    // `fetch(new Request(url, {method, body}))` carries method and body on the
    // REQUEST, not on `init`. Reading only `init` classified those as bodyless
    // GETs, so a POST-only handler skipped them and the prompt went out
    // untouched — inspection bypassed entirely rather than failing closed.
    const asRequest = input instanceof Request ? input : null;
    const { url, method, body } = await requestParts(input, init);
    if (method !== "POST" && method !== "GET") {
      return originalFetch.call(window, input, init);
    }

    // THE REAL BODY, not `String(body)`. Flattening it here is what made
    // FormData, URLSearchParams, Blob and byte arrays unreadable — and
    // therefore unrewritable — for every adapter.
    if (!pageGuard) return originalFetch.call(window, input, init);

    const verdict = await pageGuard.inspectHttp("fetch", url, method, body);

    if (verdict.action === "blocked") {
      return new Response("Blocked by Tidewall", { status: 403, statusText: "Forbidden" });
    }

    // A VERIFIED body is sent even when it is falsy. The previous truthiness
    // check meant a proven-empty rewrite silently fell back to the original.
    if (verdict.action === "transformed" && asRequest) {
      // Rebuild the Request so every other property survives the rewrite.
      const rebuilt = new Request(asRequest, { body: verdict.body as BodyInit });
      const rewrittenResp = await originalFetch.call(window, rebuilt, init);
      return rewrittenResp;
    }
    const outgoing =
      verdict.action === "transformed" ? { ...init, body: verdict.body as BodyInit } : init;

    const resp = await originalFetch.call(window, input, outgoing);

    // For streaming responses, read and forward events
    const contentType = resp.headers.get("content-type") ?? "";
    if (contentType.includes("text/event-stream") && resp.body) {
      const cloned = resp.clone();
      const reader = cloned.body!.getReader();
      const decoder = new TextDecoder();

      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              pageGuard?.onStreamEnd(url);
            notifyContent("streamDone", { url });
              break;
            }
            const chunk = decoder.decode(value, { stream: true });
            pageGuard?.onStreamChunk(chunk);
            notifyContent("streamEvent", { url, chunk });
          }
        } catch {
          pageGuard?.onStreamEnd(url);
            notifyContent("streamDone", { url });
        }
      })();
    }

    return resp;
  };

  // ── XHR interception ─────────────────────────────────────────────────────

  const OriginalXHR = window.XMLHttpRequest;
  const originalOpen = OriginalXHR.prototype.open;
  const originalSend = OriginalXHR.prototype.send;

  OriginalXHR.prototype.open = function (
    this: XMLHttpRequest & { _tidewallUrl?: string; _tidewallMethod?: string },
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ) {
    this._tidewallUrl = String(url);
    this._tidewallMethod = method;
    // @ts-expect-error open overload
    return originalOpen.call(this, method, url, ...rest);
  };

  OriginalXHR.prototype.send = function (
    this: XMLHttpRequest & {
      _tidewallUrl?: string;
      _tidewallMethod?: string;
    },
    body?: Document | XMLHttpRequestBodyInit | null
  ) {
    if (this._tidewallUrl) {
      // The REAL body — `String(body)` here destroyed FormData, Blob and byte
      // arrays before any adapter could read them.
      const xhr = this;
      const inspected = pageGuard
        ? pageGuard.inspectHttp("xhr", this._tidewallUrl, this._tidewallMethod ?? "GET", body)
        : Promise.resolve({ action: "pass" as const });

      inspected.then((response) => {
        if (response.action === "transformed") {
          originalSend.call(xhr, response.body as XMLHttpRequestBodyInit);
          return;
        }
        if (response.action === "blocked") {
          // Abort the XHR — don't send it
          xhr.dispatchEvent(new Event("error"));
          return;
        }
        // Patch onreadystatechange to capture response
        const origOnReady = xhr.onreadystatechange;
        xhr.onreadystatechange = function (ev: Event) {
          if (xhr.readyState === 4) {
            try {
              pageGuard?.onInfoResponse(xhr.responseText);
              notifyContent("xhrResponse", {
                url: xhr._tidewallUrl ?? "",
                status: xhr.status,
                body: xhr.responseText,
              });
            } catch {
              // responseText may throw for non-text types
            }
          }
          if (origOnReady) {
            origOnReady.call(xhr, ev);
          }
        };
        originalSend.call(xhr, body);
      });
      return; // Don't send yet — wait for guard response
    }

    return originalSend.call(this, body);
  };

  // ── WebSocket interception ───────────────────────────────────────────────

  const OriginalWebSocket = window.WebSocket;

  function PatchedWebSocket(
    this: WebSocket,
    url: string | URL,
    protocols?: string | string[]
  ) {
    const ws = new OriginalWebSocket(url, protocols);
    const wsUrl = String(url);

    const originalWsSend = ws.send.bind(ws);
    let wsQueue: Promise<void> = Promise.resolve();
    ws.send = function (data: string | ArrayBufferLike | Blob | ArrayBufferView) {
      // The REAL frame. Meta's adapter needs the Uint8Array, which
      // `String(data)` destroyed.
      if (!pageGuard) {
        originalWsSend(data);
        return;
      }

      // NATIVE SEMANTICS FIRST. `send()` is synchronous: it throws
      // InvalidStateError while CONNECTING, and deferring that behind an
      // async verdict would swallow the error and deliver the frame later.
      if (ws.readyState !== WebSocket.OPEN) {
        originalWsSend(data);   // let the native call throw exactly as it would
        return;
      }

      // ONE QUEUE PER SOCKET. Each send previously started an independent
      // inspection and sent when its own promise resolved, so concurrent
      // frames could resolve out of order and reverse a conversation.
      wsQueue = wsQueue
        .then(async () => {
          const verdict = await pageGuard.inspectWs(data);
          if (verdict.action === "blocked") return;
          if (ws.readyState !== WebSocket.OPEN) return;  // closed while waiting
          originalWsSend(data);
        })
        .catch(() => { /* a failed inspection must not stall the queue */ });
    };

    ws.addEventListener("message", (event: MessageEvent) => {
      let dataStr: string;
      try {
        dataStr = typeof event.data === "string" ? event.data : String(event.data);
      } catch {
        dataStr = "";
      }
      pageGuard?.onWsMessage(event.data);
      pageGuard?.onStreamChunk(event.data);
      notifyContent("wsMessage", { url: wsUrl, data: dataStr });
    });

    return ws;
  }

  // Copy static properties
  PatchedWebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
  PatchedWebSocket.OPEN = OriginalWebSocket.OPEN;
  PatchedWebSocket.CLOSING = OriginalWebSocket.CLOSING;
  PatchedWebSocket.CLOSED = OriginalWebSocket.CLOSED;
  PatchedWebSocket.prototype = OriginalWebSocket.prototype;

  // @ts-expect-error replacing WebSocket constructor
  window.WebSocket = PatchedWebSocket;
});
