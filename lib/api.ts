/**
 * Tidewall server API client.
 *
 * Provides two API calls that all extension communication flows through:
 * - {@link deviceCheck} — authenticates the device and obtains access tokens
 * - {@link guardChat} — scans prompts/outputs against the guard policy
 *
 * Both functions read the server URL and tokens from extension storage,
 * construct authenticated requests, and return typed response objects.
 * The guard API uses a short-lived access token (`at_` prefix) that is
 * refreshed periodically, while device check uses the long-lived refresh
 * token (`rt_` prefix) obtained during registration.
 *
 * @module lib/api
 */

import type { DeviceCheckResponse, GuardRequest, GuardResponse } from "./types";
import { serverUrl, rtToken, atToken } from "./storage";

/**
 * Retrieve the configured Tidewall server base URL from extension storage.
 *
 * @returns The server URL string, or empty string if not configured
 */
async function getServerUrl(): Promise<string> {
  return (await serverUrl.getValue()) ?? "";
}

/**
 * Authenticate the device with the Tidewall server.
 *
 * Calls `POST /v1/devices/check` using the long-lived refresh token.
 * On success, the response contains a fresh access token and optional
 * site configuration. On inactive device, returns status "InactiveDevice"
 * with null result.
 *
 * @param body - Device metadata (fingerprint, user name, email, device name, etc.)
 * @returns The device check response with access token and config
 * @throws Error if the HTTP request fails (non-2xx status)
 */
export async function deviceCheck(
  body: Record<string, unknown>
): Promise<DeviceCheckResponse> {
  const base = await getServerUrl();
  const token = (await rtToken.getValue()) ?? "";

  const resp = await fetch(`${base}/v1/devices/check`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    throw new Error(`deviceCheck failed: ${resp.status} ${resp.statusText}`);
  }

  return resp.json() as Promise<DeviceCheckResponse>;
}

/**
 * Scan a prompt or AI output against the Tidewall guard policy.
 *
 * Calls `POST /v1/guard_chat_completions` using the short-lived access token.
 * The guard evaluates the content against configured detectors (PII, toxicity,
 * prompt injection, etc.) and returns a block, transform, or pass decision.
 *
 * @param body - Guard request payload with messages, event type, and metadata
 * @returns The guard response with evaluation result and summary
 * @throws Error with message `"ACCESS_TOKEN_EXPIRED"` on HTTP 401 (triggers token refresh)
 * @throws Error if the HTTP request fails with any other non-2xx status
 */
export async function guardChat(body: GuardRequest): Promise<GuardResponse> {
  const base = await getServerUrl();
  const token = (await atToken.getValue()) ?? "";

  const resp = await fetch(`${base}/v1/guard_chat_completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (resp.status === 401) {
    throw new Error("ACCESS_TOKEN_EXPIRED");
  }

  if (!resp.ok) {
    throw new Error(`guardChat failed: ${resp.status} ${resp.statusText}`);
  }

  return resp.json() as Promise<GuardResponse>;
}
