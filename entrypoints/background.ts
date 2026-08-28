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

/** Alarm name, used by both the scheduler and disconnect. */
const REFRESH_ALARM = "token-refresh";

/**
 * Schedule the next refresh from the token's own expiry.
 *
 * Not a fixed 60-minute period. The access token lives 3600s, so a 60-minute
 * period fired exactly at expiry: no margin, and no second attempt if the first
 * failed. With a thirty-day refresh credential there is nothing to gain by
 * cutting it fine.
 *
 * Alarms can be delayed and can vanish across a restart or an update, so this
 * is called on every worker start as well as after every successful refresh. A
 * worker that slept through its slot gets a minimum delay and refreshes almost
 * immediately on waking.
 */
function scheduleRefresh(expiryMs: number): void {
  const halfLifeMs = (expiryMs - Date.now()) / 2;
  const delayMinutes = Math.max(1, Math.floor(halfLifeMs / 60_000));
  browser.alarms.create(REFRESH_ALARM, { delayInMinutes: delayMinutes });
}

/** In-flight refresh, shared by every caller. See {@link refreshToken}. */
let inFlightRefresh: Promise<void> | null = null;

/**
 * Move to a terminal or transitional state and reflect it in the badge.
 *
 * Every refresh outcome ends here. Previously an unrecognised one fell through
 * the `if`s and did nothing at all — silently, with the badge still green.
 */
async function applyState(state: DeviceState): Promise<void> {
  await store.deviceState.setValue(state);
  updateBadge(
    state === "active" ? "green" : state === "pending" ? "yellow" : "gray"
  );
}

/**
 * Renew the access token, at most once at a time.
 *
 * Two callers exist — a guard call that saw 401, and the alarm — and concurrent
 * guard 401s each used to call this independently. They now await one shared
 * promise. The `finally` matters: without it a single failure would leave a
 * rejected promise cached and wedge refresh for the life of the worker.
 */
async function refreshToken(): Promise<void> {
  if (inFlightRefresh) return inFlightRefresh;
  inFlightRefresh = doRefresh().finally(() => {
    inFlightRefresh = null;
  });
  return inFlightRefresh;
}

async function doRefresh(): Promise<void> {
  const creds = await store.credentials.getValue();
  if (!creds) {
    await applyState("unregistered");
    return;
  }

  // Captured BEFORE the request. Disconnect bumps this before clearing state,
  // so a result that lands after a disconnect can be recognised and dropped
  // rather than writing the old device back as active.
  const generation = (await store.sessionGeneration.getValue()) ?? 0;

  const outcome = await api.refreshDevice(creds.deviceId);

  if (((await store.sessionGeneration.getValue()) ?? 0) !== generation) {
    console.warn("[Tidewall] discarding a refresh that outlived its session");
    return;
  }

  switch (outcome.kind) {
    case "success":
      await store.setCredentials({
        ...creds,
        accessToken: outcome.accessToken,
        accessTokenExpiry: outcome.accessTokenExpiry,
      });
      if (outcome.config?.sites) await store.siteModes.setValue(outcome.config.sites);
      await applyState("active");
      return;

    case "failure":
      switch (outcome.reason) {
        case "device_pending":
          // Not an error. Approval is outstanding; keep the code on display.
          await applyState("pending");
          return;
        case "device_revoked":
          // TERMINAL. Re-enrolling here would undo the revocation, which is the
          // whole reason the server refuses to answer anything else.
          await applyState("disabled");
          browser.alarms.clear(REFRESH_ALARM);
          return;
        case "credential_expired":
        case "credential_unknown":
          // The credential is gone; this installation must start over.
          await applyState("unregistered");
          return;
      }
      return;

    case "rate_limited":
      // Deliberately no state change: nothing is wrong with this device, and
      // demoting it would make a burst look like a revocation.
      console.warn("[Tidewall] refresh rate limited; backing off");
      return;

    case "transport_failure":
      console.warn("[Tidewall] refresh transport failure:", outcome.detail);
      return;
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
