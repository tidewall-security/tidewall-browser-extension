/**
 * Extension storage definitions using WXT's typed storage API.
 *
 * All persistent state for the Tidewall extension is stored in `chrome.storage.local`
 * via WXT's `storage.defineItem` helper. Each exported constant is a typed
 * storage item with a default value, providing `.getValue()` and `.setValue()`
 * methods that are safe to call from any extension context (background, content
 * script, popup).
 *
 * **Storage groups:**
 * - **Server/auth** — server URL, refresh token, access token, token expiry
 * - **Device identity** — fingerprint, device name, user name/email, status
 * - **Site modes** — per-site mode overrides pushed from the server
 * - **Statistics** — scan, block, and transform counters
 * - **Activity** — recent guard actions for the popup activity feed
 * - **Policy** — name of the active guard policy
 *
 * @module lib/storage
 */

import { storage } from "wxt/utils/storage";

// ── Server / authentication ───────────────────���──────────────────────────────

/** Base URL of the Tidewall server (e.g., "https://tidewall.example.com"). */
export const serverUrl = storage.defineItem<string>("local:serverUrl", {
  defaultValue: "",
});

/** Long-lived refresh token (`rt_` prefix) obtained during registration. */
export const rtToken = storage.defineItem<string>("local:rtToken", {
  defaultValue: "",
});

/** Short-lived access token (`at_` prefix) used for guard API calls. Refreshed every 60 minutes. */
export const atToken = storage.defineItem<string>("local:atToken", {
  defaultValue: "",
});

/** Unix timestamp (ms) when the current access token expires. */
export const atExpiry = storage.defineItem<number>("local:atExpiry", {
  defaultValue: 0,
});

/** Unique device fingerprint (UUID v4) generated on first registration. Identifies this browser instance. */
export const fingerprint = storage.defineItem<string>("local:fingerprint", {
  defaultValue: "",
});

// ── Device / user identity ───────────────────────────────────────────────────

/** Human-readable device name shown in the admin console. */
export const deviceName = storage.defineItem<string>("local:deviceName", {
  defaultValue: "",
});

/** User's display name for guard API requests. */
export const userName = storage.defineItem<string>("local:userName", {
  defaultValue: "",
});

/** User's email address for guard API requests. */
export const userEmail = storage.defineItem<string>("local:userEmail", {
  defaultValue: "",
});

/**
 * Current device registration lifecycle state.
 * @see DeviceStatus in lib/types.ts
 */
export const deviceStatus = storage.defineItem<string>("local:deviceStatus", {
  defaultValue: "disconnected",
});

// ── Site mode overrides ─────���──────────────────────────────��─────────────────

/**
 * Per-site mode overrides pushed from the Tidewall server during device check.
 * Maps site alias (e.g., "chatgpt") to mode string (e.g., "block").
 */
export const siteModes = storage.defineItem<Record<string, string>>(
  "local:siteModes",
  { defaultValue: {} }
);

// ── Statistics ───────────────────────────────────���───────────────────────────

/** Total number of prompts scanned since registration. */
export const scanCount = storage.defineItem<number>("local:scanCount", {
  defaultValue: 0,
});

/** Total number of prompts blocked by guard policy. */
export const blockCount = storage.defineItem<number>("local:blockCount", {
  defaultValue: 0,
});

/** Total number of prompts transformed (e.g., PII redacted) by guard policy. */
export const transformCount = storage.defineItem<number>(
  "local:transformCount",
  { defaultValue: 0 }
);

// ── Recent activity feed ─────────────────────────────────────────────────────

/**
 * A single entry in the recent activity feed displayed in the popup.
 */
export interface ActivityEntry {
  /** Site alias (e.g., "chatgpt"). */
  site: string;
  /** Guard action taken: "allowed", "blocked", or "transformed". */
  status: string;
  /** Unix timestamp (ms) when the action occurred. */
  time: number;
}

/** Rolling list of the last 10 guard actions, newest first. */
export const recentActivity = storage.defineItem<ActivityEntry[]>(
  "local:recentActivity",
  { defaultValue: [] }
);

// ── Policy ─────────────────────────────────────��─────────────────────────────

/** Name of the active guard policy (set from the most recent guard response). */
export const policyName = storage.defineItem<string>("local:policyName", {
  defaultValue: "",
});
