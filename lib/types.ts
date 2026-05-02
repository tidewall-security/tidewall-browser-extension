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
 * Device registration lifecycle state.
 *
 * - `"registered"` — device check succeeded (alias for connected in some flows)
 * - `"pending"` — device registered but awaiting admin approval
 * - `"connected"` — fully authenticated with valid access token
 * - `"disconnected"` — no registration or explicitly disconnected
 * - `"error"` — registration or authentication failed
 */
export type DeviceStatus =
  | "registered"
  | "pending"
  | "connected"
  | "disconnected"
  | "error";

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
 * Response from `POST /v1/devices/check`.
 *
 * On success, contains a fresh access token and optional site configuration.
 * On inactive device, result is null and the extension enters "pending" state.
 */
export interface DeviceCheckResponse {
  /** `"Success"` when the device is active, `"InactiveDevice"` when pending admin approval. */
  status: "Success" | "InactiveDevice";
  /** Access token and config payload. Null when status is `"InactiveDevice"`. */
  result: {
    access_token: AccessTokenResponse;
    config: SiteConfig;
  } | null;
}

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
