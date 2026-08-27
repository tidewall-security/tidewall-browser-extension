/**
 * Content script — the bridge between the page-world capture script and the
 * background service worker.
 *
 * This script runs in the extension's isolated content script world on every
 * page that matches a registered AI site URL pattern. It has two key roles:
 *
 * 1. **Orchestration:** Determines which site handler to use based on the
 *    current hostname, loads the handler with the correct mode (block/log/discover),
 *    binds messaging callbacks, and injects the capture script into the page world.
 *
 * 2. **Message relay:** Listens for CustomEvents from the capture script
 *    (`tidewall-capture`), delegates to the handler's extraction methods,
 *    sends guard requests to the background via `sendMessage`, and relays
 *    the guard's decision back to the capture script via response events.
 *
 * **Event flow:**
 * ```
 * Page world (capture.ts)  -->  CustomEvent  -->  Content script (this file)
 *   |                                                    |
 *   |  <-- CustomEvent response --                       |
 *                                        sendMessage --> Background (guard API)
 * ```
 *
 * The content script also renders the notification banner when prompts are
 * blocked or transformed, using {@link showNotification}.
 *
 * @module entrypoints/content
 */

import { getAllUrlPatterns, SITE_REGISTRY } from "../lib/constants";
import { sendMessage } from "../lib/messaging";
import { getHandler } from "../handlers/index";
import { siteModes, deviceStatus } from "../lib/storage";
import type { SiteMode, PromptScanResult } from "../lib/types";
import { decideRequest, shouldGuard } from "../lib/decide";

export default defineContentScript({
  matches: getAllUrlPatterns(),
  runAt: "document_start",

  async main() {
    const CAPTURE_EVENT = "tidewall-capture";
    const CAPTURE_RESPONSE = "tidewall-capture-response";

    // ── Determine current site ──────────────────────────────────────────────

    const hostname = window.location.hostname;
    let siteKey: string | null = null;

    for (const [key, entry] of Object.entries(SITE_REGISTRY)) {
      // Direct hostname match
      if (hostname === key || hostname.endsWith("." + key)) {
        siteKey = key;
        break;
      }
      // Wildcard pattern match (e.g., "*.dopple.ai")
      if (key.startsWith("*") && hostname.endsWith(key.slice(1))) {
        siteKey = key;
        break;
      }
      // Check if hostname matches URL patterns
      if (key.startsWith("*") && hostname.endsWith(key.slice(2))) {
        siteKey = key;
        break;
      }
    }

    if (!siteKey) {
      console.log("[Tidewall] No matching site for", hostname);
      return;
    }

    const siteEntry = SITE_REGISTRY[siteKey];
    const alias = siteEntry.alias;
    const siteName = siteEntry.name;

    // ── Determine mode ──────────────────────────────────────────────────────

    const status = await deviceStatus.getValue();
    if (status !== "connected" && status !== "registered") {
      console.log("[Tidewall] Device not connected, skipping", siteName);
      return;
    }

    const modes = (await siteModes.getValue()) ?? {};
    const mode = (modes[alias] ?? "discover") as SiteMode;

    if (mode === "disabled") {
      console.log("[Tidewall] Site disabled:", siteName);
      return;
    }

    // ── Get handler ─────────────────────────────────────────────────────────

    const handler = getHandler(alias, mode);

    if (!handler) {
      // In discover mode without a handler, just track the site
      if (mode === "discover") {
        sendMessage("trackSite", { site: alias, url: window.location.href });
      }
      console.log("[Tidewall] No handler for", alias, "- tracking only");
      return;
    }

    handler.mode = mode;

    // ── Bind messaging ──────────────────────────────────────────────────────

    handler.bindMessaging(
      async (prompts: string[]): Promise<PromptScanResult> => {
        const text = prompts.join("\n---\n");
        const meta = handler.getMetaData();
        return sendMessage("guardPrompt", {
          text,
          site: alias,
          model: meta.modelName,
          modelVersion: meta.modelVersion,
        });
      },
      (text: string): void => {
        sendMessage("guardOutput", { text, site: alias });
      }
    );

    // ── Discovery tracking ──────────────────────────────────────────────────

    sendMessage("trackSite", { site: alias, url: window.location.href });

    // ── Inject capture script into page world ───────────────────────────────

    const script = document.createElement("script");
    script.src = browser.runtime.getURL("/capture.js");
    script.type = "text/javascript";
    (document.documentElement || document.head || document.body).appendChild(
      script
    );

    // ── Listen for capture events ───────────────────────────────────────────

    window.addEventListener(CAPTURE_EVENT, async (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.type) return;

      const { type, id } = detail;

      function respond(data: Record<string, unknown>): void {
        window.dispatchEvent(
          new CustomEvent(CAPTURE_RESPONSE, {
            detail: { ...data, id },
          })
        );
      }

      try {
        switch (type) {
          case "interceptFetch": {
            if (!handler.captureFetch && !handler.captureGet) {
              respond({ action: "pass" });
              return;
            }

            const { url, method, body } = detail;

            // Skip non-matching URLs
            if (!handler.disableFilter && !handler.filterRequestUrl(url)) {
              respond({ action: "pass" });
              return;
            }

            // Skip GET requests if not configured
            if (method === "GET" && !handler.captureGet) {
              respond({ action: "pass" });
              return;
            }

            // Extract prompt text and metadata from the request body
            const prompts: string[] = handler.promptHttpInput(body) || [];

            // If mode is discover or log, just pass through
            if (mode === "discover" || mode === "log") {
              respond({ action: "pass" });
              return;
            }

            // NO RAW-BODY FALLBACK. Guarding the raw body when extraction
            // returns nothing means a broad-filter site -- Poe and AI Studio
            // intercept nearly everything by design -- can draw a transform
            // verdict on ordinary traffic and be blocked for it. Empty
            // extraction is treated as "not a prompt request" until typed
            // outcomes can tell that apart from "a prompt I cannot read".
            if (!shouldGuard(prompts)) {
              respond({ action: "pass" });
              return;
            }

            const result = await handler.processRequestBody(prompts);
            const verdict = decideRequest(result);

            if (verdict.action === "blocked") {
              showNotification("blocked", verdict.summary);
              handler.runOnBlock();
              respond({ action: "blocked" });
              return;
            }

            respond({ action: "pass" });
            break;
          }

          case "interceptXhr": {
            if (!handler.captureXmlHttp) {
              respond({ action: "pass" });
              return;
            }

            const { url: xhrUrl, body: xhrBody } = detail;
            if (!handler.disableFilter && !handler.filterRequestUrl(xhrUrl)) {
              respond({ action: "pass" });
              return;
            }

            const xhrPrompts: string[] = handler.promptHttpInput(xhrBody) || [];

            if (mode === "discover" || mode === "log") {
              respond({ action: "pass" });
              return;
            }

            // Block mode — send to guard
            const xhrGuardInput = xhrPrompts.length > 0
              ? xhrPrompts
              : (xhrBody ? [typeof xhrBody === "string" ? xhrBody : JSON.stringify(xhrBody)] : []);
            const xhrResult = await handler.processRequestBody(xhrGuardInput);
            const xhrVerdict = decideRequest(xhrResult);

            if (xhrVerdict.action === "blocked") {
              showNotification("blocked", xhrVerdict.summary);
              handler.runOnBlock();
              respond({ action: "blocked" });
              return;
            }

            respond({ action: "pass" });
            break;
          }

          case "interceptWs": {
            if (!handler.captureWebSocket && !handler.captureWebSocketV2) {
              respond({ action: "pass" });
              return;
            }

            const wsPrompts: string[] = handler.promptWsInput(detail.data) || [];

            if (mode === "discover" || mode === "log") {
              respond({ action: "pass" });
              return;
            }

            // Block mode — send to guard
            const wsGuardInput = wsPrompts.length > 0
              ? wsPrompts
              : (detail.data ? [detail.data] : []);
            const wsResult = await handler.processRequestBody(wsGuardInput);
            const wsVerdict = decideRequest(wsResult);

            if (wsVerdict.action === "blocked") {
              showNotification("blocked", wsVerdict.summary);
              handler.runOnBlock();
              respond({ action: "blocked" });
              return;
            }

            respond({ action: "pass" });
            break;
          }

          case "wsMessage": {
            if (handler.monitorWebSocket) {
              handler.monitorWsResponse(detail.data);
            }
            handler.processEvent(detail.data);
            break;
          }

          case "streamEvent": {
            handler.processEvent(detail.chunk);
            break;
          }

          case "streamDone": {
            if (handler.logOnStreamEnd) {
              handler.logResponse(detail.url);
            }
            break;
          }

          case "xhrResponse": {
            if (handler.filterInfoRespUrl(detail.url)) {
              handler.metaHttpInput(detail.body);
            }
            break;
          }
        }
      } catch (err) {
        console.error("[Tidewall] Error handling capture event:", type, err);
        if (type === "interceptFetch") {
          respond({ action: "pass" });
        }
      }
    });

    console.log(`[Tidewall] Content script loaded for ${siteName} (${mode} mode)`);
  },
});

// ── Notification banner ───────────────────────────────────────────────────────

/**
 * Display a fixed-position notification banner at the top of the page.
 *
 * Renders a colored banner indicating whether a prompt was blocked (red) or
 * transformed/redacted (yellow). The banner auto-dismisses after 10 seconds
 * and includes a manual dismiss button. Only one banner is shown at a time;
 * any existing banner is removed before creating a new one.
 *
 * @param type - Whether the prompt was "blocked" or "transformed"
 * @param summary - Human-readable description from the guard API (e.g., policy violation details)
 */
function showNotification(
  type: "blocked" | "transformed",
  summary: string
): void {
  const existing = document.getElementById("tidewall-notification");
  if (existing) existing.remove();

  const banner = document.createElement("div");
  banner.id = "tidewall-notification";

  const isBlocked = type === "blocked";
  const bgGradient = isBlocked
    ? "linear-gradient(135deg, #e5484d, #c93c40)"
    : "linear-gradient(135deg, #d4a72c, #b8922a)";
  const label = isBlocked ? "Prompt blocked" : "Prompt redacted";

  banner.setAttribute(
    "style",
    [
      "position: fixed",
      "top: 0",
      "left: 0",
      "right: 0",
      "z-index: 2147483647",
      `background: ${bgGradient}`,
      "color: #fff",
      "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      "font-size: 14px",
      "padding: 12px 20px",
      "display: flex",
      "align-items: center",
      "justify-content: space-between",
      "box-shadow: 0 2px 8px rgba(0,0,0,0.3)",
    ].join("; ")
  );

  const text = document.createElement("span");
  text.textContent = `Tidewall: ${label} \u2014 ${summary}`;

  const dismiss = document.createElement("button");
  dismiss.textContent = "\u2715";
  dismiss.setAttribute(
    "style",
    [
      "background: none",
      "border: none",
      "color: #fff",
      "font-size: 18px",
      "cursor: pointer",
      "padding: 0 4px",
      "margin-left: 12px",
      "line-height: 1",
    ].join("; ")
  );
  dismiss.addEventListener("click", () => banner.remove());

  banner.appendChild(text);
  banner.appendChild(dismiss);
  document.body.appendChild(banner);

  // Auto-dismiss after 10 seconds
  setTimeout(() => {
    if (banner.parentNode) banner.remove();
  }, 10_000);
}
