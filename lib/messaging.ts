/**
 * Extension messaging protocol definition.
 *
 * Defines the typed message protocol between content scripts, the popup UI,
 * and the background service worker using `@webext-core/messaging`. Each
 * message type is a key in the {@link ProtocolMap} with a tuple of
 * `[RequestData, ResponseData]`.
 *
 * **Message flows:**
 * - Content script --> Background: `guardPrompt`, `guardOutput`, `trackSite`
 * - Popup UI --> Background: `getStatus`, `register`, `disconnect`
 *
 * The exported `sendMessage` and `onMessage` functions are fully typed —
 * calling `sendMessage("guardPrompt", data)` enforces the correct request
 * shape and returns the correct response type.
 *
 * @module lib/messaging
 */

import { defineExtensionMessaging } from "@webext-core/messaging";
import type { PromptScanResult } from "./types";

/** Request payload for the `guardPrompt` message (content --> background). */
interface GuardPromptData {
  /** The user's prompt text (multiple prompts joined with `---` separator). */
  text: string;
  /** Site alias identifying the AI application. */
  site: string;
  /** Optional user identifier override. */
  userId?: string;
  /** Optional AI model name. */
  model?: string;
  /** Optional AI model version. */
  modelVersion?: string;
}

/** Request payload for the `guardOutput` message (content --> background). */
interface GuardOutputData {
  /** The AI's response text to scan. */
  text: string;
  /** Site alias identifying the AI application. */
  site: string;
}

/** Request payload for the `trackSite` message (content --> background). */
interface TrackSiteData {
  /** Site alias identifying the AI application. */
  site: string;
  /** Full URL of the visited page. */
  url: string;
}

/** Response payload for the `getStatus` message (background --> popup). */
interface StatusResult {
  /** Total number of prompts scanned since registration. */
  scanCount: number;
  /** Total number of prompts blocked. */
  blockCount: number;
  /** Total number of prompts transformed. */
  transformCount: number;
  /** Current device registration state. */
  deviceStatus: string;
  /** Name of the active guard policy. */
  policyName: string;
  /** Last 10 guard actions for the activity feed. */
  recentActivity: Array<{ site: string; status: string; time: number }>;
}

/** Request payload for the `register` message (popup --> background). */
interface RegisterData {
  /** Base URL of the Tidewall server (e.g., "https://tidewall.example.com"). */
  serverUrl: string;
  /**
   * Whether the person ticked "allow an insecure local server".
   *
   * Travels with the URL rather than being read from storage by the worker,
   * because it is a property of THIS registration decision. Storing it as a
   * standing preference would let a later registration inherit an exemption
   * nobody granted for it.
   */
  allowInsecureLoopback: boolean;
  /** Long-lived refresh token from the admin console. */
  rtToken: string;
  /** Human-readable device name for the admin console. */
  deviceName: string;
  /** User's display name. */
  userName: string;
  /** User's email address. */
  userEmail: string;
  /** Device fingerprint (generated on first registration). */
  fingerprint: string;
}

/** Response payload for the `register` message (background --> popup). */
interface RegisterResult {
  /** Whether registration succeeded. */
  success: boolean;
  /** Error message if registration failed. */
  error?: string;
}

/**
 * Protocol map defining all extension messages.
 *
 * Each key is a message type, and the value is a tuple of
 * `[RequestData, ResponseData]`. This enables full type safety for
 * both `sendMessage` (caller) and `onMessage` (handler).
 */
/**
 * The message contract, in METHOD syntax.
 *
 * Not `name: [Request, Response]`. The library resolves each entry by shape: a
 * function contributes its argument and its return type, a `ProtocolWithReturn`
 * contributes both, and **anything else contributes itself as the request and
 * `void` as the response**. A tuple is "anything else", so writing one is not a
 * type error -- it silently types every handler's `data` as the whole tuple and
 * every response as `void`, which is how this file came to promise checking it
 * was not performing.
 */
interface ProtocolMap {
  /** Content --> Background: scan an outgoing prompt against the guard policy. */
  guardPrompt(data: GuardPromptData): PromptScanResult;

  /** Content --> Background: fire-and-forget AI output text for output scanning. */
  guardOutput(data: GuardOutputData): void;

  /** Content --> Background: discovery-mode site visit tracking. */
  trackSite(data: TrackSiteData): void;

  /** A redaction was applied AND verified. Accounting follows the act. */
  redactionApplied(data: { site: string }): void;

  /** Popup --> Background: retrieve current scan/block/transform stats. */
  getStatus(): StatusResult;

  /** Popup --> Background: register device with the Tidewall server. */
  register(data: RegisterData): RegisterResult;

  /** Popup --> Background: clear all state and disconnect the device. */
  disconnect(): void;
}

/**
 * Typed messaging functions for the extension protocol.
 *
 * - `sendMessage(type, data)` — send a message and await the typed response
 * - `onMessage(type, handler)` — register a handler for a message type
 */
export const { sendMessage, onMessage } =
  defineExtensionMessaging<ProtocolMap>();
