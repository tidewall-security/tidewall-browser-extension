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
import { siteModes, deviceState } from "../lib/storage";
import { shouldGuard } from "../lib/session";
import type { SiteMode, PromptScanResult } from "../lib/types";
import { decideRequest, planExtraction } from "../lib/decide";

export default defineContentScript({
  matches: getAllUrlPatterns(),
  runAt: "document_start",

  async main() {
    // Namespaced per page load. NOT a security boundary — the page can read
    // the attribute that carries it — but a constant event name is trivially
    // scriptable, and this costs nothing.
    const channel = crypto.randomUUID();
    const CAPTURE_EVENT = `tidewall-capture-${channel}`;
    const CAPTURE_RESPONSE = `tidewall-capture-response-${channel}`;

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

    const status = await deviceState.getValue();
    if (!shouldGuard(status)) {
      console.log("[Tidewall] Device not connected, skipping", siteName);
      return;
    }

    const modes = (await siteModes.getValue()) ?? {};
    const mode = (modes[alias] ?? "discover") as SiteMode;

    if (mode === "disabled") {
      console.log("[Tidewall] Site disabled:", siteName);
      return;
    }

    // ── Is this site supported? ─────────────────────────────────────────────
    //
    // Content no longer OWNS a handler — the page world builds its own, where
    // the real request object lives. All this needs to know is whether there
    // is one, so it can decide between injecting the capture script and just
    // tracking the visit.

    if (!getHandler(alias, mode)) {
      if (mode === "discover") {
        sendMessage("trackSite", { site: alias, url: window.location.href });
      }
      console.log("[Tidewall] No handler for", alias, "- tracking only");
      return;
    }

    // ── Discovery tracking ──────────────────────────────────────────────────

    sendMessage("trackSite", { site: alias, url: window.location.href });

    // ── Inject capture script into page world ───────────────────────────────

    const script = document.createElement("script");
    script.src = browser.runtime.getURL("/capture.js");
    script.type = "text/javascript";
    // The page world builds its own handler, so it needs to know which site
    // and which mode. A data attribute is read synchronously by
    // `document.currentScript`, which avoids a handshake race with requests
    // the page fires immediately.
    script.dataset.tidewall = JSON.stringify({ alias, mode, channel });
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
          // ── The page world decides; this relays ──────────────────────
          //
          // Inspection and (soon) rewriting happen in `capture.js`, because
          // that is where the real request object lives. The only thing that
          // needs extension APIs is the guard call itself, so it is the only
          // thing that crosses. Nothing but strings crosses.

          case "guardPrompt": {
            const { prompts, meta } = detail as {
              prompts: string[];
              meta: { application: string; modelName: string; modelVersion: string };
            };
            const result = await sendMessage("guardPrompt", {
              // NOT joined. See GuardPromptData: joining made every
              // multi-prompt request fail the cardinality check downstream.
              prompts,
              site: alias,
              model: meta?.modelName ?? "",
              modelVersion: meta?.modelVersion ?? "",
              // No `url`. The background destructures four fields and never
              // read this one, and the guard API has no URL field to carry it,
              // so sending the page address only made it look as though the
              // server saw it.
            });
            respond({ result });
            return;
          }

          case "reportAnswer": {
            const { text, meta } = detail as {
              text: string;
              meta: { modelName: string; modelVersion: string };
            };
            sendMessage("guardOutput", { text, site: alias });
            respond({ ok: true });
            return;
          }

          case "notify": {
            const { kind, summary } = detail as {
              kind: "blocked" | "transformed";
              summary: string;
            };
            showNotification(kind, summary);
            // Counted here, not on the verdict: the page world only sends
            // this once a rewrite has been applied AND verified.
            if (kind === "transformed") {
              sendMessage("redactionApplied", { site: alias });
            }
            respond({ ok: true });
            return;
          }

        }
      } catch (err) {
        console.error("[Tidewall] Error handling capture event:", type, err);
        // FAIL CLOSED: the page world is waiting on this reply, and a
        // silent drop resolves as `pass` at its timeout.
        respond({ result: { blocked: true, transformed: false,
                            summary: "Blocked: the guard could not be reached." } });
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
