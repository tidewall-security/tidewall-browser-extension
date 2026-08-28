/**
 * Tidewall server API client.
 *
 * Three calls, each with its own credential:
 * - {@link enrolDevice} — `rt_` registration token. Creates only.
 * - {@link refreshDevice} — `dr_` refresh token. Renews the access token.
 * - {@link guardChat} — `at_` access token. Scans prompts and outputs.
 *
 * The three are not interchangeable and the server enforces that: an `rt_` is
 * accepted at enrol and nowhere else, a `dr_` at its own device's refresh route
 * and nowhere else, and a `dr_` carries no API role at all.
 *
 * The enrol and refresh calls return a discriminated outcome rather than
 * throwing. The server distinguishes several refusals that call for different
 * client behaviour — poll, stop permanently, re-enrol — and an exception erases
 * which one it was.
 *
 * @module lib/api
 */

import type {
  Credentials,
  EnrolFailureReason,
  EnrolOutcome,
  GuardRequest,
  GuardResponse,
  RefreshFailureReason,
  RefreshOutcome,
} from "./types";
import { serverUrl, rtToken, credentials } from "./storage";

/** Refusals the server can return from enrolment. Every one has `result: null`. */
const ENROL_FAILURES: readonly EnrolFailureReason[] = [
  "RegistrationTokenExhausted",
  "InstallationIdAlreadyEnrolled",
  "InstallationTombstoned",
  "PendingQuotaExceeded",
];

/** Refusals the server can return from refresh. Success carries no reason. */
const REFRESH_FAILURES: readonly RefreshFailureReason[] = [
  "device_pending",
  "device_revoked",
  "credential_expired",
  "credential_unknown",
];

/**
 * Retrieve the configured Tidewall server base URL from extension storage.
 *
 * @returns The server URL string, or empty string if not configured
 */
async function getServerUrl(): Promise<string> {
  return (await serverUrl.getValue()) ?? "";
}

/**
 * Enrol this installation with the Tidewall server.
 *
 * `POST /v1/devices/enrol`, authenticated with the `rt_` registration token.
 * Creates only — it never adopts an existing device, because the only values a
 * caller can offer at this point prove nothing about owning one.
 *
 * Enrolment normally yields a PENDING device: it receives credentials and cannot
 * call the guard until an administrator approves it against the confirmation
 * code in the response.
 *
 * **Decides on the body, not the status code.** Two refusals answered HTTP 201
 * until recently, so a client reading the code would have treated "nothing was
 * created" as success and stored empty credentials.
 */
export async function enrolDevice(body: {
  installation_id: string;
  device_name: string;
  user_name: string;
  user_email: string;
  browser: string;
  os: string;
  extension_version: string;
  fingerprint?: string;
  recovery_secret?: string;
}): Promise<EnrolOutcome> {
  const base = await getServerUrl();
  const token = (await rtToken.getValue()) ?? "";

  let resp: Response;
  try {
    resp = await fetch(`${base}/v1/devices/enrol`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { kind: "transport_failure", detail: String(err) };
  }

  if (resp.status === 429) return { kind: "rate_limited" };

  let payload: Record<string, unknown>;
  try {
    payload = (await resp.json()) as Record<string, unknown>;
  } catch (err) {
    return { kind: "transport_failure", detail: `unparseable body: ${String(err)}` };
  }

  const status = payload.status as string | undefined;

  if (ENROL_FAILURES.includes(status as EnrolFailureReason)) {
    return { kind: "failure", reason: status as EnrolFailureReason };
  }

  const result = payload.result as Record<string, any> | null | undefined;
  if (status !== "Success" || !result) {
    // Includes the case that mattered: a 2xx whose body says nothing was
    // created. Never fall through to success on a null result.
    return {
      kind: "transport_failure",
      detail: `unrecognised enrolment outcome: ${String(status)} (HTTP ${resp.status})`,
    };
  }

  const creds: Credentials = {
    installationId: body.installation_id,
    deviceId: result.device_id,
    accessToken: result.access_token.token,
    accessTokenExpiry: Date.now() + result.access_token.expires_in * 1000,
    refreshToken: result.refresh_token.token,
  };

  return {
    kind: "success",
    credentials: creds,
    deviceStatus: result.device_status,
    confirmationCode: result.confirmation_code,
    config: result.config,
  };
}

/**
 * Renew this device's access token.
 *
 * `POST /v1/devices/{deviceId}/refresh`, authenticated with the **`dr_` refresh
 * token** — never the access token, which the server now refuses here. That was
 * the previous contract, and accepting it would have preserved the one-hour
 * lockout this credential exists to remove.
 *
 * Nothing rotates: a lost response is retried with the same `dr_` token, and the
 * response never contains a new one.
 */
export async function refreshDevice(deviceId: string): Promise<RefreshOutcome> {
  const base = await getServerUrl();
  const stored = await credentials.getValue();
  const token = stored?.refreshToken ?? "";

  let resp: Response;
  try {
    resp = await fetch(`${base}/v1/devices/${encodeURIComponent(deviceId)}/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });
  } catch (err) {
    return { kind: "transport_failure", detail: String(err) };
  }

  if (resp.status === 429) return { kind: "rate_limited" };

  let payload: Record<string, unknown>;
  try {
    payload = (await resp.json()) as Record<string, unknown>;
  } catch (err) {
    return { kind: "transport_failure", detail: `unparseable body: ${String(err)}` };
  }

  const reason = payload.reason as string | undefined;
  if (reason && REFRESH_FAILURES.includes(reason as RefreshFailureReason)) {
    return { kind: "failure", reason: reason as RefreshFailureReason };
  }

  const result = payload.result as Record<string, any> | null | undefined;
  if (payload.status !== "ok" || !result) {
    return {
      kind: "transport_failure",
      detail: `unrecognised refresh outcome: ${String(payload.status)} (HTTP ${resp.status})`,
    };
  }

  return {
    kind: "success",
    accessToken: result.access_token.token,
    accessTokenExpiry: Date.now() + result.access_token.expires_in * 1000,
    config: result.config,
  };
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
  // From the credential tuple, not a standalone item: the access token and its
  // expiry are written together so they can never disagree.
  const token = (await credentials.getValue())?.accessToken ?? "";

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
