/**
 * Background service worker — the extension's central coordinator.
 *
 * This long-lived service worker handles all communication with the Tidewall
 * server-side guard API. It receives messages from content scripts (via
 * the messaging protocol defined in lib/messaging.ts) and performs:
 *
 * **Guard evaluation:**
 * - `guardPrompt` — sends user prompts to `/v1/guard_chat_completions` for
 *   policy evaluation. Returns block/transform/pass decisions to the content script.
 * - `guardOutput` — sends AI responses for output scanning (fire-and-forget).
 * - `trackSite` — logs site visits in discover mode.
 *
 * **Device management:**
 * - `register` — authenticates the device with the Tidewall server, stores tokens,
 *   and sets up periodic token refresh via `browser.alarms`.
 * - `disconnect` — clears all stored state and cancels refresh alarms.
 * - `getStatus` — returns current stats for the popup UI.
 *
 * **Token lifecycle:**
 * Three credentials, each reaching exactly one place. An `rt_` registration
 * token is accepted at enrolment and nowhere else. Enrolment returns a `dr_`
 * device refresh token, which reaches only this device's own refresh route and
 * never rotates, and an `at_` access token, which is short-lived and is what
 * guard calls carry. The access token is renewed from the `dr_` token on an
 * alarm and on demand after a 401.
 *
 * **Badge states:**
 * - Gray: disconnected / error
 * - Green: last prompt allowed
 * - Yellow: pending approval or last prompt transformed
 * - Red: last prompt blocked
 *
 * @module entrypoints/background
 */

import { onMessage } from "../lib/messaging";
import * as api from "../lib/api";
import * as store from "../lib/storage";
import { buildGuardMessages } from "../lib/guard-request";
import { checkServerUrl } from "../lib/server-url";
import * as session from "../lib/session";
import type { DeviceState, GuardRequest, GuardMessage, SiteMode } from "../lib/types";

// ── Badge helper ──────────────────────────────────────────────────────────────

/**
 * Mapping of semantic color names to hex values for the extension badge.
 */
const BADGE_COLORS: Record<string, string> = {
  gray: "#6e7681",
  green: "#46954a",
  yellow: "#d4a72c",
  red: "#e5484d",
};

/**
 * Update the extension toolbar badge color to reflect the current state.
 *
 * @param color - Semantic color name: "gray" (disconnected), "green" (allowed),
 *   "yellow" (pending/transformed), or "red" (blocked)
 */
function updateBadge(color: keyof typeof BADGE_COLORS): void {
  const hex = BADGE_COLORS[color] ?? BADGE_COLORS.gray;
  browser.action.setBadgeBackgroundColor({ color: hex });
  browser.action.setBadgeText({ text: " " });
}

// ── Token refresh ─────────────────────────────────────────────────────────────

/** Browser-facing side effects for the session module. */
const effects: session.SessionEffects = {
  setBadge: updateBadge,
  clearAlarm: (name) => browser.alarms.clear(name),
  createAlarm: (name, opts) => browser.alarms.create(name, opts),
};

const REFRESH_ALARM = session.REFRESH_ALARM;
const applyState = (state: DeviceState) => session.applyState(state, effects);
const scheduleRefresh = (expiryMs: number) => session.scheduleRefresh(expiryMs, effects);
const refreshToken = () => session.refreshToken(effects);

// ── Background entry ──────────────────────────────────────────────────────────

export default defineBackground(() => {
  console.log("[Tidewall] Background service worker started");

  // Set initial badge
  updateBadge("gray");

  // ── guardPrompt ─────────────────────────────────────────────────────────

  onMessage("guardPrompt", async ({ data }) => {
    const { prompts, site, model, modelVersion } = data;

    const fp = (await store.fingerprint.getValue()) ?? "";
    const email = (await store.userEmail.getValue()) ?? "";
    const name = (await store.userName.getValue()) ?? "";

    const messages: GuardMessage[] = buildGuardMessages(prompts);

    const guardReq: GuardRequest = {
      guard_input: { messages },
      event_type: "input",
      user_id: email || name || "unknown",
      collector_instance_id: fp,
      app_id: site,
      model: model ?? site,
      model_version: modelVersion ?? "",
    };

    async function doGuardCall(): Promise<{
      blocked: boolean;
      transformed: boolean;
      summary: string;
      transformedMessages?: string[];
    }> {
      const resp = await api.guardChat(guardReq);

      // Update stats
      const scans = ((await store.scanCount.getValue()) ?? 0) + 1;
      await store.scanCount.setValue(scans);

      const result = resp.result;
      const summary = resp.summary ?? "";

      // ACCOUNTING FOLLOWS THE ACT, and a transform is not an act yet.
      //
      // A `transformed` verdict says the guard produced a redacted version; it
      // does not say the extension applied one. This counted the transform,
      // set a yellow badge and recorded "transformed" activity BEFORE the page
      // attempted any rewrite -- so a rewrite that silently failed was still
      // audited as a redaction, which is the same lie as the notification.
      //
      // Every transform currently blocks (see `decideRequest`), so it is
      // counted as a block here. The transform counter comes back when a
      // rewrite can be PROVEN applied, driven by an acknowledgement from the
      // page world rather than by the verdict alone.
      if (result.blocked || result.transformed) {
        const blocks = ((await store.blockCount.getValue()) ?? 0) + 1;
        await store.blockCount.setValue(blocks);
        updateBadge("red");
      } else {
        updateBadge("green");
      }

      // Policy name
      if (result.policy) {
        await store.policyName.setValue(result.policy);
      }

      // Recent activity
      const activity = (await store.recentActivity.getValue()) ?? [];
      activity.unshift({
        site,
        // "transformed" is not recorded until a rewrite is proven applied.
        status: result.blocked || result.transformed ? "blocked" : "allowed",
        time: Date.now(),
      });
      await store.recentActivity.setValue(activity.slice(0, 10));

      // Build response
      const transformedMessages = result.guard_output?.messages?.map(
        (m) => m.content
      );

      return {
        blocked: result.blocked,
        transformed: result.transformed,
        summary,
        transformedMessages,
      };
    }

    try {
      return await doGuardCall();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);

      if (msg === "ACCESS_TOKEN_EXPIRED") {
        try {
          await refreshToken();
          return await doGuardCall();
        } catch {
          // FAIL CLOSED. `blocked: false` here reads to every caller as
          // "the guard checked this and found nothing", which is the one
          // thing it does not mean. An unreachable guard is not a clean scan.
          return {
            blocked: true,
            transformed: false,
            summary: "Blocked: could not authenticate to the guard.",
          };
        }
      }

      console.error("[Tidewall] guardPrompt error:", msg);
      // FAIL CLOSED, for the same reason: an error is not a verdict.
      return {
        blocked: true,
        transformed: false,
        summary: "Blocked: the guard could not be reached, so this prompt was not checked.",
      };
    }
  });

  // ── guardOutput ─────────────────────────────────────────────────────────

  onMessage("guardOutput", async ({ data }) => {
    const { text, site } = data;
    const fp = (await store.fingerprint.getValue()) ?? "";
    const email = (await store.userEmail.getValue()) ?? "";
    const name = (await store.userName.getValue()) ?? "";

    const guardReq: GuardRequest = {
      guard_input: { messages: [{ role: "assistant", content: text }] },
      event_type: "output",
      user_id: email || name || "unknown",
      collector_instance_id: fp,
      app_id: site,
      model: site,
      model_version: "",
    };

    try {
      await api.guardChat(guardReq);
    } catch (err) {
      console.error("[Tidewall] guardOutput error:", err);
    }
  });

  // ── trackSite ───────────────────────────────────────────────────────────

  onMessage("redactionApplied", async () => {
    // ACCOUNTING FOLLOWS THE ACT. The guard's verdict says a redaction was
    // OFFERED; this says one was applied and proven, which is the only thing
    // worth counting as a transform.
    const transforms = ((await store.transformCount.getValue()) ?? 0) + 1;
    await store.transformCount.setValue(transforms);
    updateBadge("yellow");
  });

  onMessage("trackSite", async ({ data }) => {
    const { site, url } = data;
    const fp = (await store.fingerprint.getValue()) ?? "";
    const email = (await store.userEmail.getValue()) ?? "";
    const name = (await store.userName.getValue()) ?? "";

    const guardReq: GuardRequest = {
      guard_input: { messages: [{ role: "system", content: `Visited: ${url}` }] },
      event_type: "discovery",
      user_id: email || name || "unknown",
      collector_instance_id: fp,
      app_id: site,
      model: site,
      model_version: "",
    };

    try {
      await api.guardChat(guardReq);
    } catch (err) {
      console.error("[Tidewall] trackSite error:", err);
    }
  });

  // ── getStatus ───────────────────────────────────────────────────────────

  onMessage("getStatus", async () => {
    return {
      scanCount: (await store.scanCount.getValue()) ?? 0,
      blockCount: (await store.blockCount.getValue()) ?? 0,
      transformCount: (await store.transformCount.getValue()) ?? 0,
      deviceStatus: (await store.deviceState.getValue()) ?? "unregistered",
      confirmationCode: (await store.confirmationCode.getValue()) ?? "",
      policyName: (await store.policyName.getValue()) ?? "",
      recentActivity: (await store.recentActivity.getValue()) ?? [],
    };
  });

  // ── register ────────────────────────────────────────────────────────────

  onMessage("register", async ({ data }) => {
    try {
      // Checked HERE, not only in the popup. This worker holds the credential
      // and makes the request, so this is the boundary that matters; the
      // popup's copy exists to give a person a reason they can act on, not to
      // be relied upon. A message handler must not trust its sender's checks.
      const verdict = checkServerUrl(data.serverUrl, data.allowInsecureLoopback);
      if (!verdict.ok) {
        console.error("[Tidewall] refusing to register against", data.serverUrl, "--", verdict.reason);
        return { success: false, error: verdict.reason };
      }

      await store.serverUrl.setValue(data.serverUrl);
      await store.rtToken.setValue(data.rtToken);
      await store.userName.setValue(data.userName);
      await store.userEmail.setValue(data.userEmail);
      await store.deviceName.setValue(data.deviceName);

      // Advisory only. Kept for diagnostics; it identifies nothing and
      // authorises nothing, which is the whole point of the change that
      // separated enrolment from refresh.
      let fp = (await store.fingerprint.getValue()) ?? "";
      if (!fp) {
        fp = crypto.randomUUID();
        await store.fingerprint.setValue(fp);
      }

      // The device's identity. Generated once with a CSPRNG and persisted
      // BEFORE enrolling: the server validates the form and cannot tell whether
      // the value was random, and enrolment is first-claim and never reassigns.
      // Anyone holding a registration token who can predict this can enrol it
      // first and lock the genuine client out.
      let installationId = (await store.credentials.getValue())?.installationId ?? "";
      if (!installationId) installationId = crypto.randomUUID();

      // Captured before the request; disconnect bumps it before clearing state.
      const generation = (await store.sessionGeneration.getValue()) ?? 0;

      const resp = await api.enrolDevice({
        installation_id: installationId,
        fingerprint: fp,
        user_name: data.userName,
        user_email: data.userEmail,
        device_name: data.deviceName,
        browser: navigator.userAgent.includes("Chrome") ? "Chrome" : "Unknown",
        os: navigator.platform || "",
        extension_version: "1.0.0",
      });

      if (generation !== ((await store.sessionGeneration.getValue()) ?? 0)) {
        console.warn("[Tidewall] discarding an enrolment that outlived its session");
        return { success: false };
      }

      if (resp.kind !== "success") {
        const detail =
          resp.kind === "failure"
            ? resp.reason
            : resp.kind === "rate_limited"
              ? "rate limited"
              : resp.detail;
        console.error("[Tidewall] enrolment refused:", detail);
        await applyState("unregistered");
        return { success: false };
      }

      await store.setCredentials(resp.credentials);
      await store.confirmationCode.setValue(resp.confirmationCode ?? "");
      if (resp.config?.sites) await store.siteModes.setValue(resp.config.sites);
      await applyState(resp.deviceStatus === "active" ? "active" : "pending");

      scheduleRefresh(resp.credentials.accessTokenExpiry);

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Tidewall] register error:", msg);
      await applyState("unregistered");
      updateBadge("gray");
      return { success: false, error: msg };
    }
  });

  // ── disconnect ──────────────────────────────────────────────────────────

  onMessage("disconnect", async () => {
    // FIRST, before anything is cleared. An enrol or refresh already in flight
    // captured the old value and will discard its result rather than writing a
    // disconnected device back as active.
    await store.sessionGeneration.setValue(
      ((await store.sessionGeneration.getValue()) ?? 0) + 1
    );
    await store.credentials.setValue(null);
    await store.confirmationCode.setValue("");
    await store.rtToken.setValue("");
    await store.deviceState.setValue("unregistered");
    await store.scanCount.setValue(0);
    await store.blockCount.setValue(0);
    await store.transformCount.setValue(0);
    await store.recentActivity.setValue([]);
    await store.policyName.setValue("");
    browser.alarms.clear(REFRESH_ALARM);
    updateBadge("gray");
  });

  // ── Alarm listener (token refresh) ──────────────────────────────────────

  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== "token-refresh") return;

    try {
      await refreshToken();
    } catch (err) {
      console.error("[Tidewall] Token refresh alarm error:", err);
    }
  });
});
