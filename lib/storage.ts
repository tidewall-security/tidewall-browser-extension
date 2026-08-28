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

import type { Credentials, DeviceState } from "./types";

// ── Server / authentication ───────────────────���──────────────────────────────

/** Base URL of the Tidewall server (e.g., "https://tidewall.example.com"). */
export const serverUrl = storage.defineItem<string>("local:serverUrl", {
  defaultValue: "",
});

/**
 * REGISTRATION token (`rt_` prefix), supplied by an administrator.
 *
 * Not a refresh token, despite what this used to be called. It is accepted at
 * `/v1/devices/enrol` and nowhere else. Retained after enrolment because a later
 * re-enrolment needs it.
 */
export const rtToken = storage.defineItem<string>("local:rtToken", {
  defaultValue: "",
});

/**
 * This installation's credentials, written and read as ONE value.
 *
 * The fields are meaningless apart, and storing them separately is a live
 * defect: a worker terminated between two awaits leaves an access token beside
 * another token's expiry, believed valid long after it is not. Never write a
 * component on its own — see `setCredentials`.
 */
export const credentials = storage.defineItem<Credentials | null>(
  "local:credentials",
  { defaultValue: null }
);

/**
 * The ONLY way to write credentials.
 *
 * Every field goes in one `setValue`, so a worker terminated mid-write leaves
 * either the whole previous tuple or the whole new one — never an access token
 * beside another token's expiry. Call sites that update one field read, spread
 * and write the whole value.
 */
export async function setCredentials(next: Credentials): Promise<void> {
  await credentials.setValue(next);
}

/** Clear credentials as one value. Used by disconnect. */
export async function clearCredentials(): Promise<void> {
  await credentials.setValue(null);
}

/**
 * Confirmation code to display while enrolment is pending.
 *
 * The administrator matches it against the pending row before activating. It is
 * returned once, at enrolment, and never appears in any listing.
 */
export const confirmationCode = storage.defineItem<string>(
  "local:confirmationCode",
  { defaultValue: "" }
);

/**
 * ADVISORY metadata only. Sent for diagnostics.
 *
 * It is not unique server-side, never identifies this device and never
 * authorises anything. It used to be both identity and proof of ownership,
 * which is what allowed any registration-token holder who learned a fingerprint
 * to take over the device it named.
 */
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
 * Current lifecycle state of this installation.
 *
 * Typed rather than free text: every failure used to collapse into one `error`
 * string, and `disabled` in particular must be distinguishable because it is
 * terminal — the server has said stop, and a client that re-enrols there undoes
 * its own revocation.
 */
export const deviceState = storage.defineItem<DeviceState>("local:deviceState", {
  defaultValue: "unregistered",
});

/**
 * Bumped by disconnect BEFORE it clears anything.
 *
 * An enrol or refresh already in flight captures this when it starts and
 * verifies it is unchanged before committing. Without it a request that started
 * before a disconnect can land afterwards and write the old device back as
 * active — silently reconnecting an extension the user disconnected.
 */
export const sessionGeneration = storage.defineItem<number>(
  "local:sessionGeneration",
  { defaultValue: 0 }
);

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
