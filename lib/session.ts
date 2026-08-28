/**
 * Device session lifecycle: refresh, state transitions, and their guards.
 *
 * Extracted from the background entrypoint so it can be tested. Everything here
 * was previously inside `defineBackground`, where the single-flight guard, the
 * session generation and the terminal-state handling had no test between them —
 * each could be deleted with the whole suite staying green.
 *
 * @module lib/session
 */

import * as api from "./api";
import * as store from "./storage";
import type { DeviceState } from "./types";

/** Alarm name shared by the scheduler and disconnect. */
export const REFRESH_ALARM = "token-refresh";

/** Side effects the caller supplies, so tests do not need a browser. */
export interface SessionEffects {
  setBadge(colour: "green" | "yellow" | "gray"): void;
  clearAlarm(name: string): void;
  createAlarm(name: string, opts: { delayInMinutes: number }): void;
}

/** In-flight refresh, shared by every caller. */
let inFlight: Promise<void> | null = null;

/** Test seam: drop any shared promise between cases. */
export function resetInFlight(): void {
  inFlight = null;
}

/**
 * Move to a state and reflect it.
 *
 * Every refresh outcome ends here. Previously an unrecognised one fell through
 * the conditionals and did nothing at all — silently, badge still green.
 */
export async function applyState(
  state: DeviceState,
  effects: SessionEffects
): Promise<void> {
  await store.deviceState.setValue(state);
  effects.setBadge(state === "active" ? "green" : state === "pending" ? "yellow" : "gray");
}

/**
 * Schedule the next refresh from the token's own expiry.
 *
 * Not a fixed hour. The access token lives 3600s, so an hourly alarm fired
 * exactly at expiry: no margin, and no second attempt if the first failed.
 */
export function scheduleRefresh(expiryMs: number, effects: SessionEffects): void {
  const halfLifeMs = (expiryMs - Date.now()) / 2;
  effects.createAlarm(REFRESH_ALARM, {
    delayInMinutes: Math.max(1, Math.floor(halfLifeMs / 60_000)),
  });
}

/**
 * Renew the access token, at most once at a time.
 *
 * Two callers exist — a guard call that saw 401, and the alarm — and concurrent
 * guard 401s each used to call independently. The `finally` matters: without it
 * one failure caches a rejected promise and wedges refresh for the worker's life.
 */
export function refreshToken(effects: SessionEffects): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = doRefresh(effects).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function doRefresh(effects: SessionEffects): Promise<void> {
  const creds = await store.credentials.getValue();
  if (!creds) {
    await applyState("unregistered", effects);
    return;
  }

  // Captured BEFORE the request. Disconnect bumps this before clearing state,
  // so a result landing afterwards is recognised and dropped rather than
  // writing the disconnected device back as active.
  const generation = (await store.sessionGeneration.getValue()) ?? 0;

  const outcome = await api.refreshDevice(creds.deviceId);

  if (((await store.sessionGeneration.getValue()) ?? 0) !== generation) {
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
      await applyState("active", effects);
      scheduleRefresh(outcome.accessTokenExpiry, effects);
      return;

    case "failure":
      switch (outcome.reason) {
        case "device_pending":
          await applyState("pending", effects);
          return;
        case "device_revoked":
          // TERMINAL. Re-enrolling here undoes the revocation, which is exactly
          // why the server refuses to answer anything else for a revoked
          // device. Stop polling and stay stopped.
          await applyState("disabled", effects);
          effects.clearAlarm(REFRESH_ALARM);
          return;
        case "credential_expired":
        case "credential_unknown":
          await applyState("unregistered", effects);
          return;
      }
      return;

    // These two cases cannot be independently killed by mutation, and that is
    // stated rather than left looking covered: the switch has no default, so
    // deleting either gives identical runtime behaviour. They are here to say
    // the no-op is deliberate. What IS tested is the consequence -- that the
    // device state survives both untouched, because demoting on either would
    // make a burst or an unreachable server look like a revocation.
    case "rate_limited":
      return;

    case "transport_failure":
      return;
  }
}

/**
 * May the content script guard this page?
 *
 * ONLY when the device is active. Pending, disabled and unregistered devices
 * hold no usable credential, so every guard call would fail.
 *
 * Extracted and named because the inline version compared against two strings
 * that no longer exist. Renaming the state item would have made that condition
 * always true and silently stopped the extension guarding anything, on every
 * site — with nothing failing anywhere, and no typecheck in CI to catch it.
 */
export function shouldGuard(state: DeviceState | null | undefined): boolean {
  return state === "active";
}
