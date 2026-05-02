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

export default defineUnlistedScript(() => {
  const OUTGOING = "tidewall-capture";
  const RESPONSE = "tidewall-capture-response";

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

  const originalFetch = window.fetch;

  window.fetch = async function patchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const method = (init?.method ?? "GET").toUpperCase();
    if (method !== "POST" && method !== "GET") {
      return originalFetch.call(window, input, init);
    }

    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;

    let bodyStr: string | null = null;
    if (init?.body) {
      try {
        bodyStr =
          typeof init.body === "string"
            ? init.body
            : init.body instanceof ArrayBuffer
              ? new TextDecoder().decode(init.body)
              : init.body instanceof Blob
                ? await init.body.text()
                : String(init.body);
      } catch {
        bodyStr = null;
      }
    }

    const response = await sendToContent("interceptFetch", {
      url,
      method,
      body: bodyStr,
    });

    // Blocked — return fake 403
    if (response.action === "blocked") {
      return new Response("Blocked by Tidewall", { status: 403, statusText: "Forbidden" });
    }

    // Transformed — replace request body
    const actualInit = { ...init };
    if (response.action === "transformed" && response.transformedBody) {
      actualInit.body = response.transformedBody as string;
    }

    const resp = await originalFetch.call(window, input, actualInit);

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
              notifyContent("streamDone", { url });
              break;
            }
            const chunk = decoder.decode(value, { stream: true });
            notifyContent("streamEvent", { url, chunk });
          }
        } catch {
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
      let bodyStr: string | null = null;
      try {
        bodyStr = typeof body === "string" ? body : body ? String(body) : null;
      } catch {
        bodyStr = null;
      }

      // Use sendToContent (request/response) so the guard can block
      const xhr = this;
      sendToContent("interceptXhr", {
        url: this._tidewallUrl,
        method: this._tidewallMethod ?? "GET",
        body: bodyStr,
      }).then((response) => {
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
    ws.send = function (data: string | ArrayBufferLike | Blob | ArrayBufferView) {
      let dataStr: string;
      try {
        dataStr = typeof data === "string" ? data : String(data);
      } catch {
        dataStr = "";
      }

      // Use sendToContent so the guard can block WebSocket messages
      sendToContent("interceptWs", { url: wsUrl, data: dataStr }).then(
        (response) => {
          if (response.action === "blocked") {
            return; // Don't send — message blocked by guard
          }
          originalWsSend(data);
        }
      );
    };

    ws.addEventListener("message", (event: MessageEvent) => {
      let dataStr: string;
      try {
        dataStr = typeof event.data === "string" ? event.data : String(event.data);
      } catch {
        dataStr = "";
      }
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
