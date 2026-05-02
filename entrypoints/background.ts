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
 * The extension uses two tokens: a refresh token (`rt_` prefix, long-lived)
 * stored from registration, and an access token (`at_` prefix, short-lived)
 * obtained via `/v1/devices/check`. The access token is refreshed every 60
 * minutes by an alarm, and on-demand when a 401 response is received.
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
import type { GuardRequest, GuardMessage, SiteMode } from "../lib/types";

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

/**
 * Refresh the short-lived access token by calling `/v1/devices/check`.
 *
 * Uses the stored refresh token and device fingerprint to obtain a new
 * access token. If the device has been deactivated server-side, sets
 * status to "pending" and updates the badge to yellow.
 *
 * Called both on a 60-minute alarm and on-demand when a guard call returns 401.
 */
async function refreshToken(): Promise<void> {
  const fp = (await store.fingerprint.getValue()) ?? "";
  const name = (await store.userName.getValue()) ?? "";
  const email = (await store.userEmail.getValue()) ?? "";
  const devName = (await store.deviceName.getValue()) ?? "";

  const resp = await api.deviceCheck({
    fingerprint: fp,
    name,
    email,
    device_name: devName,
  });

  if (resp.status === "InactiveDevice") {
    await store.deviceStatus.setValue("pending");
    updateBadge("yellow");
    return;
  }

  if (resp.status === "Success" && resp.result) {
    await store.atToken.setValue(resp.result.access_token.token);
    await store.atExpiry.setValue(
      Date.now() + resp.result.access_token.expires_in * 1000
    );
    if (resp.result.config?.sites) {
      await store.siteModes.setValue(resp.result.config.sites);
    }
  }
}

// ── Background entry ──────────────────────────────────────────────────────────

export default defineBackground(() => {
  console.log("[Tidewall] Background service worker started");

  // Set initial badge
  updateBadge("gray");

  // ── guardPrompt ─────────────────────────────────────────────────────────

  onMessage("guardPrompt", async ({ data }) => {
    const { text, site, model, modelVersion } = data;

    const fp = (await store.fingerprint.getValue()) ?? "";
    const email = (await store.userEmail.getValue()) ?? "";
    const name = (await store.userName.getValue()) ?? "";

    const messages: GuardMessage[] = [{ role: "user", content: text }];

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

      if (result.blocked) {
        const blocks = ((await store.blockCount.getValue()) ?? 0) + 1;
        await store.blockCount.setValue(blocks);
        updateBadge("red");
      } else if (result.transformed) {
        const transforms = ((await store.transformCount.getValue()) ?? 0) + 1;
        await store.transformCount.setValue(transforms);
        updateBadge("yellow");
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
        status: result.blocked ? "blocked" : result.transformed ? "transformed" : "allowed",
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
          return {
            blocked: false,
            transformed: false,
            summary: "Token refresh failed",
          };
        }
      }

      console.error("[Tidewall] guardPrompt error:", msg);
      return {
        blocked: false,
        transformed: false,
        summary: "Guard call failed",
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
      deviceStatus: (await store.deviceStatus.getValue()) ?? "disconnected",
      policyName: (await store.policyName.getValue()) ?? "",
      recentActivity: (await store.recentActivity.getValue()) ?? [],
    };
  });

  // ── register ────────────────────────────────────────────────────────────

  onMessage("register", async ({ data }) => {
    try {
      await store.serverUrl.setValue(data.serverUrl);
      await store.rtToken.setValue(data.rtToken);
      await store.userName.setValue(data.userName);
      await store.userEmail.setValue(data.userEmail);
      await store.deviceName.setValue(data.deviceName);

      // Generate fingerprint if not set
      let fp = (await store.fingerprint.getValue()) ?? "";
      if (!fp) {
        fp = crypto.randomUUID();
        await store.fingerprint.setValue(fp);
      }

      const resp = await api.deviceCheck({
        fingerprint: fp,
        user_name: data.userName,
        user_email: data.userEmail,
        device_name: data.deviceName,
        browser: navigator.userAgent.includes("Chrome") ? "Chrome" : "Unknown",
        os: navigator.platform || "",
        extension_version: "1.0.0",
      });

      if (resp.status === "InactiveDevice") {
        await store.deviceStatus.setValue("pending");
        updateBadge("yellow");
        return { success: true };
      }

      if (resp.status === "Success" && resp.result) {
        await store.atToken.setValue(resp.result.access_token.token);
        await store.atExpiry.setValue(
          Date.now() + resp.result.access_token.expires_in * 1000
        );
        if (resp.result.config?.sites) {
          await store.siteModes.setValue(resp.result.config.sites);
        }
        await store.deviceStatus.setValue("connected");
        updateBadge("green");
      }

      // Set up token refresh alarm — every 60 minutes
      browser.alarms.create("token-refresh", { periodInMinutes: 60 });

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Tidewall] register error:", msg);
      await store.deviceStatus.setValue("error");
      updateBadge("gray");
      return { success: false, error: msg };
    }
  });

  // ── disconnect ──────────────────────────────────────────────────────────

  onMessage("disconnect", async () => {
    await store.atToken.setValue("");
    await store.rtToken.setValue("");
    await store.deviceStatus.setValue("disconnected");
    await store.scanCount.setValue(0);
    await store.blockCount.setValue(0);
    await store.transformCount.setValue(0);
    await store.recentActivity.setValue([]);
    await store.policyName.setValue("");
    browser.alarms.clear("token-refresh");
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
