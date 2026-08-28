/**
 * Shared TypeScript types for the Tidewall browser extension.
 *
 * This module defines all type contracts shared between the content script,
 * background service worker, popup UI, and site handlers. Types are organized
 * into several groups:
 *
 * - **Mode/status enums** — operating modes and device lifecycle states
 * - **API request/response types** — shapes for the Tidewall guard API
 * - **Handler configuration** — options that control interception behavior
 * - **Site registry** — metadata for each supported AI site
 *
 * @module lib/types
 */

/**
 * Operating mode for an AI site.
 *
 * - `"block"` — intercept prompts and enforce guard policy (block or transform)
 * - `"log"` — intercept and scan prompts, but always pass through (audit only)
 * - `"discover"` — track site visits without scanning prompts
 * - `"disabled"` — skip all interception for this site
 */
export type SiteMode = "block" | "log" | "discover" | "disabled";


/**
 * Server-pushed site configuration mapping each site alias to its mode.
 * Received as part of the device check response.
 */
export interface SiteConfig {
  /** Map of site alias (e.g., "chatgpt") to its assigned mode. */
  sites: Record<string, SiteMode>;
}

/**
 * Shape of the access token returned inside a device check response.
 */
export interface AccessTokenResponse {
  /** The short-lived JWT or opaque access token string. */
  token: string;
  /** Token lifetime in seconds from the time of issuance. */
  expires_in: number;
}

/**
 * Why a refresh was refused.
 *
 * These four values are the complete set the server emits; success is HTTP 200
 * with `status: "ok"` and **no** `reason` field. Modelling success as a fifth
 * member would put a value in this union that the server never sends.
 *
 * Derived from `refresh_device` in the server's device service. A `switch` over
 * this union must be exhaustive, so a value added server-side fails typecheck
 * here rather than falling through to a default.
 */
export type RefreshFailureReason =
  | "device_pending"
  | "device_revoked"
  | "credential_expired"
  | "credential_unknown";

/**
 * Why an enrolment was refused.
 *
 * Every one of these arrives with `result: null`. Two of them answered HTTP 201
 * until recently, which is why the client must decide on the BODY: a status code
 * alone would have read "created" for an enrolment that created nothing, and the
 * client would have stored an empty credential tuple with no error to show.
 */
export type EnrolFailureReason =
  | "RegistrationTokenExhausted"
  | "InstallationIdAlreadyEnrolled"
  | "InstallationTombstoned"
  | "PendingQuotaExceeded";

/** Lifecycle state of this installation, as the extension sees it. */
export type DeviceState =
  | "unregistered"
  | "pending"
  | "active"
  /** Terminal. The server said stop; only a manual resume leaves this. */
  | "disabled";

/**
 * Credentials for one enrolled installation, written and read as ONE value.
 *
 * The three fields are meaningless apart. Storing them separately is what let a
 * worker terminate between two awaits and leave an access token beside another
 * token's expiry — believed valid long after it was not.
 */
export interface Credentials {
  /** Client-generated, UUID form, non-nil. The server rejects anything else. */
  installationId: string;
  /** Server-assigned. Every refresh is addressed to this device's own path. */
  deviceId: string;
  /** `at_` — short-lived, used for guard calls. */
  accessToken: string;
  /** Unix ms at which `accessToken` expires. */
  accessTokenExpiry: number;
  /** `dr_` — long-lived, reaches only this device's refresh route, never rotates. */
  refreshToken: string;
}

/** Successful enrolment. */
export interface EnrolSuccess {
  kind: "success";
  credentials: Credentials;
  deviceStatus: Extract<DeviceState, "pending" | "active">;
  /** Present only while pending. Displayed for an administrator to match. */
  confirmationCode?: string;
  config?: SiteConfig;
}

/** A refused enrolment. Carries no credentials, whatever the HTTP status was. */
export interface EnrolFailure {
  kind: "failure";
  reason: EnrolFailureReason;
}

/** The caller exceeded its allowance. Back off; do not hot-loop. */
export interface RateLimited {
  kind: "rate_limited";
}

/** The server could not be reached, or answered something unrecognised. */
export interface TransportFailure {
  kind: "transport_failure";
  detail: string;
}

export type EnrolOutcome = EnrolSuccess | EnrolFailure | RateLimited | TransportFailure;

/** A refresh that produced a new access token. Never a new refresh token. */
export interface RefreshSuccess {
  kind: "success";
  accessToken: string;
  accessTokenExpiry: number;
  config?: SiteConfig;
}

export interface RefreshFailure {
  kind: "failure";
  reason: RefreshFailureReason;
}

export type RefreshOutcome =
  | RefreshSuccess
  | RefreshFailure
  | RateLimited
  | TransportFailure;

/**
 * A single message in the guard API's chat format.
 * Role is typically "user", "assistant", or "system".
 */
export interface GuardMessage {
  /** The role of the message author (e.g., "user", "assistant", "system"). */
  role: string;
  /** The text content of the message. */
  content: string;
}

/**
 * Request payload for `POST /v1/guard_chat_completions`.
 *
 * Wraps the user's prompt (or AI output) in a chat-completions-style
 * format with metadata about the source site, user, and model.
 */
export interface GuardRequest {
  /** The messages to scan, wrapped in a guard_input envelope. */
  guard_input: { messages: GuardMessage[] };
  /** Whether this is an "input" (prompt) or "output" (AI response) or "discovery" scan. */
  event_type: string;
  /** Identifier for the user (email or name). */
  user_id: string;
  /** Unique device fingerprint (UUID) identifying this browser instance. */
  collector_instance_id: string;
  /** Site alias identifying the AI application (e.g., "chatgpt"). */
  app_id: string;
  /** AI model name (e.g., "GPT-4o", "Claude Sonnet 4"). */
  model: string;
  /** AI model version string. */
  model_version: string;
  /** Optional extra metadata for the guard evaluation. */
  extra_info?: Record<string, unknown>;
}

/**
 * The `result` object inside a guard API response.
 * Contains the policy decision and optional transformed output.
 */
export interface GuardResult {
  /** Whether the prompt was blocked by policy. */
  blocked: boolean;
  /** Whether the prompt was transformed (e.g., PII redacted). */
  transformed: boolean;
  /** Transformed messages to substitute into the request body. Null if not transformed. */
  guard_output: { messages: GuardMessage[] } | null;
  /** Name of the policy that triggered the action (empty if allowed). */
  policy: string;
  /** Map of detector names to their results (e.g., PII, toxicity scores). */
  detectors: Record<string, unknown>;
  /** Format-preserving encryption context for reversible redaction. */
  fpe_context?: unknown;
}

/**
 * Full response from `POST /v1/guard_chat_completions`.
 */
export interface GuardResponse {
  /** Server-assigned unique request identifier. */
  request_id: string;
  /** ISO timestamp when the server received the request. */
  request_time: string;
  /** ISO timestamp when the server completed processing. */
  response_time: string;
  /** High-level status string (e.g., "success"). */
  status: string;
  /** Human-readable summary of the guard decision. */
  summary: string;
  /** Detailed guard evaluation result. */
  result: GuardResult;
}

/**
 * Simplified guard result passed from the background to the content script.
 *
 * This is the return type of the `guardPrompt` message handler, stripped
 * down to the fields the content script needs to decide how to respond
 * to the capture script.
 */
export interface PromptScanResult {
  /** Whether the prompt was blocked. */
  blocked: boolean;
  /** Whether the prompt was transformed. */
  transformed: boolean;
  /** Human-readable summary for the notification banner. */
  summary: string;
  /** Transformed message contents to substitute into the request body. */
  transformedMessages?: string[];
}

/**
 * Metadata for a single AI site in the site registry.
 * Used by the content script to match hostnames and by the handler index
 * to look up display names.
 */
export interface SiteEntry {
  /** Human-readable site name (e.g., "ChatGPT"). */
  name: string;
  /** Lowercase alias used as a storage key and handler lookup key. */
  alias: string;
  /** Chrome extension URL match patterns for the manifest (e.g., `["*://*.chatgpt.com/*"]`). */
  urlMatch: string[];
}

/**
 * Configuration options passed to the {@link SiteHandler} constructor.
 *
 * These flags control which network transport(s) the handler intercepts
 * and how it behaves during blocking and logging.
 */
export interface HandlerOptions {
  /** Intercept `window.fetch()` POST requests. */
  fetch?: boolean;
  /** Intercept `window.fetch()` GET requests. */
  fetchGet?: boolean;
  /** Intercept `XMLHttpRequest.send()` calls. */
  xmlhttp?: boolean;
  /** Intercept `WebSocket.send()` (legacy v1 protocol). */
  websocket?: boolean;
  /** Intercept `WebSocket.send()` (v2 protocol with guard blocking). */
  websocketV2?: boolean;
  /** Passively monitor incoming WebSocket messages for response capture. */
  monitorWebSocket?: boolean;
  /** Read SSE stream chunks via processEvent. */
  readStream?: boolean;
  /** Call logResponse when a stream ends. */
  logOnStreamEnd?: boolean;
  /** Text to inject into blocked request bodies; false to skip injection. */
  sendBlockText?: string | boolean;
  /** Skip URL pattern filtering (intercept all matching transport requests). */
  disableFilter?: boolean;
  /** URL patterns identifying prompt submission endpoints. */
  promptUrls?: RegExp[];
  /** URL patterns for informational response endpoints. */
  infoRespUrls?: RegExp[];
  /** URL patterns for informational request endpoints. */
  infoReqUrls?: RegExp[];
}

/**
 * What extraction concluded about a request.
 *
 * `string[]` conflated "ordinary site traffic" with "a prompt request I
 * cannot read", and those need opposite handling — the first must pass, the
 * second must block. Blanket-blocking on empty bricks broad-filter sites
 * like Poe and AI Studio, which intercept nearly everything by design;
 * blanket passing is the leak.
 */
export type ExtractionOutcome =
  /** Not a prompt submission. Pass it through untouched. */
  | { kind: "notPrompt" }
  /** A prompt, extracted and rewritable. */
  | { kind: "prompt"; prompts: string[]; rewritePlan?: unknown }
  /** A prompt this adapter can read but cannot rewrite. Guard it; a clean
   *  verdict passes, a transform blocks. */
  | { kind: "unsupportedPrompt"; prompts: string[]; reason: string }
  /** Request identity says this IS a prompt submission, but no text could be
   *  extracted — so there is nothing to obtain a verdict from, and waiting
   *  for a transform verdict would never block. Blocks immediately. */
  | { kind: "uninspectablePrompt"; reason: string };
