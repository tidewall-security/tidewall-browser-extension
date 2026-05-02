/**
 * Base handler for all AI site interceptors.
 *
 * The extension supports 37 AI sites (ChatGPT, Claude, Gemini, etc.), each with
 * a handler subclass that knows how to extract prompts from that site's specific
 * request format. This base class defines the handler contract.
 *
 * **Lifecycle:**
 * 1. Content script instantiates the handler for the current site
 * 2. bindMessaging() connects it to the background script's guard API
 * 3. When a network request is intercepted (fetch/XHR/WebSocket):
 *    a. promptHttpInput(body) or promptWsInput(data) extracts the user's prompt
 *    b. processRequestBody(prompts) sends it to Tidewall for guard evaluation
 *    c. Based on the result: pass, block (show banner), or transform
 * 4. After the AI responds, logResponse() captures the output for logging
 *
 * **Transport types:**
 * - fetch: true — intercepts window.fetch() (most sites)
 * - xmlhttp: true — intercepts XMLHttpRequest (Gemini, DeepSeek, etc.)
 * - websocketV2: true — intercepts WebSocket.send() (Copilot, M365, etc.)
 *
 * **Modes:** block, log, discover, disabled
 *
 * This architecture follows the established collector pattern used by major AI security platforms.
 *
 * @module handlers/base
 */

import type { SiteMode, HandlerOptions, PromptScanResult } from "../lib/types";

// ── DOM utility ──────────────────────────────────────────────────────────────

/**
 * Set of HTML tag names considered block-level for text extraction.
 * Used by {@link extractText} to insert newline separators between blocks.
 */
const BLOCK_TAGS = new Set(["DIV", "P", "LI", "BR", "HR", "H1", "H2", "H3", "H4", "H5", "H6"]);

/**
 * Walk the DOM tree rooted at `node` and return visible text.
 * Block-level elements and HR tags contribute a newline separator.
 * Anchor tags include their href in parentheses.
 */
export function extractText(node: Node): string {
  const parts: string[] = [];

  function walk(n: Node): void {
    if (n.nodeType === Node.TEXT_NODE) {
      const text = n.textContent ?? "";
      if (text) parts.push(text);
      return;
    }

    if (n.nodeType !== Node.ELEMENT_NODE) return;

    const el = n as Element;
    const tag = el.tagName.toUpperCase();

    if (BLOCK_TAGS.has(tag)) {
      parts.push("\n");
    }

    if (tag === "A") {
      const href = el.getAttribute("href");
      for (const child of Array.from(el.childNodes)) walk(child);
      if (href) parts.push(` (${href})`);
      return;
    }

    for (const child of Array.from(el.childNodes)) {
      walk(child);
    }

    if (BLOCK_TAGS.has(tag)) {
      parts.push("\n");
    }
  }

  walk(node);

  // Collapse runs of whitespace / blank lines and trim
  return parts
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── Callback types ────────────────────────────────────────────────────────────

/**
 * Callback that sends extracted prompt strings to the background script's
 * guard API for evaluation. Returns the scan result (block, transform, or pass).
 */
type SendGuardCallback = (prompts: string[]) => Promise<PromptScanResult>;

/**
 * Callback that forwards AI response text to the background script for
 * output logging and analysis. Fire-and-forget (no return value).
 */
type SendOutputCallback = (text: string) => void;

// ── Base handler ──────────────────────────────────────────────────────────────

/**
 * Abstract base class for all AI site handlers.
 *
 * Each supported AI site (ChatGPT, Claude, Gemini, etc.) extends this class
 * to implement site-specific prompt extraction, response capture, and
 * body transformation logic. The content script instantiates the appropriate
 * handler based on the current hostname and delegates all interception
 * events to it.
 *
 * Subclasses typically override:
 * - {@link promptHttpInput} or {@link promptWsInput} to extract prompt text
 * - {@link logResponse} to capture AI output from the DOM
 * - {@link processEvent} to handle SSE stream chunks
 * - {@link runOnBlock} to clean up UI after blocking a prompt
 */
export abstract class SiteHandler {
  /** Display name of the AI site (e.g., "ChatGPT", "Claude"). */
  readonly name: string;

  /** Lowercase, underscore-delimited alias used as a storage key and site identifier. */
  readonly alias: string;

  /** Current operating mode: block, log, discover, or disabled. */
  mode: SiteMode;

  /** URL patterns that identify prompt submission endpoints. Only matching URLs trigger prompt extraction. */
  promptUrls: RegExp[];

  /** URL patterns for informational response endpoints (e.g., model config). Matched responses are passed to {@link metaHttpInput}. */
  infoRespUrls: RegExp[];

  /** URL patterns for informational request endpoints. Reserved for future use. */
  infoReqUrls: RegExp[];

  /** Whether to intercept `window.fetch()` POST requests. */
  captureFetch: boolean;

  /** Whether to intercept `window.fetch()` GET requests (rare; used by AnonChatGPT). */
  captureGet: boolean;

  /** Whether to intercept `XMLHttpRequest.send()` calls. */
  captureXmlHttp: boolean;

  /** Whether to intercept `WebSocket.send()` messages (legacy v1 protocol). */
  captureWebSocket: boolean;

  /** Whether to intercept `WebSocket.send()` messages (v2 protocol with guard blocking). */
  captureWebSocketV2: boolean;

  /** Whether to passively monitor incoming WebSocket messages for response capture. */
  monitorWebSocket: boolean;

  /** Whether the handler reads SSE stream chunks via {@link processEvent}. */
  readStream: boolean;

  /** Whether to call {@link logResponse} when a stream ends (streamDone event). */
  logOnStreamEnd: boolean;

  /**
   * Text to inject into the blocked request body when blocking in-flight.
   * Set to a space `" "` for sites that require non-empty bodies to avoid errors.
   * `false` means no text injection on block.
   */
  sendBlockText: string | boolean;

  /** When true, skip URL filtering and intercept all requests matching the transport type. */
  disableFilter: boolean;

  /** AI model name extracted from the request or page (e.g., "GPT-4o", "Claude Sonnet 4"). */
  modelName: string;

  /** AI model version string extracted from the request or page (e.g., "gpt-4o-2024-08-06"). */
  modelVersion: string;

  /** The most recently captured request body. Used by subclasses for redaction/transformation. */
  body: unknown;

  /** MutationObserver watching for AI response completion in the DOM. Created by handlers that scrape responses. */
  responseObserver: MutationObserver | null;

  /** Bound callback to send prompts to the guard API. Injected by {@link bindMessaging}. */
  protected _sendGuard: SendGuardCallback | null = null;

  /** Bound callback to send AI output text for logging. Injected by {@link bindMessaging}. */
  protected _sendOutput: SendOutputCallback | null = null;

  /**
   * Create a new site handler.
   *
   * @param name - Human-readable site name (e.g., "ChatGPT")
   * @param mode - Initial operating mode
   * @param options - Transport flags, URL filters, and behavior toggles
   */
  constructor(name: string, mode: SiteMode, options: HandlerOptions = {}) {
    this.name = name;
    this.alias = name.toLowerCase().replace(/\s+/g, "_");
    this.mode = mode;

    this.promptUrls = options.promptUrls ?? [];
    this.infoRespUrls = options.infoRespUrls ?? [];
    this.infoReqUrls = options.infoReqUrls ?? [];

    this.captureFetch = options.fetch ?? false;
    this.captureGet = options.fetchGet ?? false;
    this.captureXmlHttp = options.xmlhttp ?? false;
    this.captureWebSocket = options.websocket ?? false;
    this.captureWebSocketV2 = options.websocketV2 ?? false;
    this.monitorWebSocket = options.monitorWebSocket ?? false;
    this.readStream = options.readStream ?? false;
    this.logOnStreamEnd = options.logOnStreamEnd ?? false;
    this.sendBlockText = options.sendBlockText ?? false;
    this.disableFilter = options.disableFilter ?? false;

    this.modelName = "";
    this.modelVersion = "";
    this.body = null;
    this.responseObserver = null;
  }

  // ── Messaging injection ───────────────────────────────────────────────────

  /**
   * Called by the content script to inject the messaging callbacks so the
   * handler can communicate back to the background service worker.
   */
  bindMessaging(
    sendGuard: SendGuardCallback,
    sendOutput: SendOutputCallback
  ): void {
    this._sendGuard = sendGuard;
    this._sendOutput = sendOutput;
  }

  // ── URL filtering ─────────────────────────────────────────────────────────

  /** Returns true if `url` matches any pattern in promptUrls. */
  filterRequestUrl(url: string): boolean {
    if (this.promptUrls.length === 0) return true;
    return this.promptUrls.some((re) => re.test(url));
  }

  /** Returns true if `url` matches any pattern in infoRespUrls. */
  filterInfoRespUrl(url: string): boolean {
    if (this.infoRespUrls.length === 0) return false;
    return this.infoRespUrls.some((re) => re.test(url));
  }

  // ── Metadata helpers ──────────────────────────────────────────────────────

  /**
   * Build metadata payload for guard API requests.
   *
   * @returns Object containing application name, model name, and model version
   */
  getMetaData(): { application: string; modelName: string; modelVersion: string } {
    return {
      application: this.name,
      modelName: this.modelName,
      modelVersion: this.getModelVersion(),
    };
  }

  /** Overridable — subclasses can derive the version from captured responses. */
  getModelVersion(): string {
    return this.modelVersion;
  }

  // ── Override stubs ────────────────────────────────────────────────────────

  /**
   * Extract user prompt text from an intercepted HTTP request body.
   *
   * Subclasses parse the site-specific JSON/FormData structure to find the
   * user's message. Also extracts model metadata when available.
   *
   * @param _body - The raw request body (typically a JSON string or FormData)
   * @returns Array of extracted prompt strings, or empty array if none found
   */
  promptHttpInput(_body: unknown): string[] { return []; }

  /**
   * Redact the user prompt in the captured HTTP request body.
   *
   * Called when the extension needs to transform the outgoing request
   * (e.g., replacing sensitive content with "[redacted]").
   *
   * @param _body - The raw request body to redact
   */
  promptHttpOutput(_body: unknown): void {}

  /**
   * Extract user prompt text from an intercepted WebSocket message.
   *
   * Used by sites that communicate over WebSocket (Copilot, M365, Character.AI, etc.).
   *
   * @param _data - The raw WebSocket message data (typically a JSON string)
   * @returns Array of extracted prompt strings, or empty array if none found
   */
  promptWsInput(_data: unknown): string[] { return []; }

  /**
   * Redact the user prompt in the captured WebSocket message.
   *
   * @param _data - The raw WebSocket message data to redact
   */
  promptWsOutput(_data: unknown): void {}

  /**
   * Capture the AI's response text after generation completes.
   *
   * Most handlers implement this by scraping the DOM after a delay or by
   * observing DOM mutations for a "streaming complete" signal.
   *
   * @param _text - Optional context (e.g., URL) passed by the caller
   */
  logResponse(_text: string): void {}

  /**
   * Process a streaming event (SSE chunk or WebSocket message).
   *
   * Called for each data chunk during a streaming response. Handlers use this
   * to detect stream completion (e.g., `data: [DONE]`) or extract model metadata.
   *
   * @param _event - The raw event data (typically a string containing SSE lines)
   */
  processEvent(_event: unknown): void {}

  /**
   * Process an incoming WebSocket message when passive monitoring is enabled.
   *
   * Unlike {@link processEvent}, this is specifically for WebSocket handlers
   * that set `monitorWebSocket: true` to watch for response-complete signals.
   *
   * @param _data - The raw WebSocket message data
   */
  monitorWsResponse(_data: unknown): void {}

  /**
   * Clean up the page UI after a prompt has been blocked.
   *
   * Some sites show error states or retry buttons when a request fails.
   * Handlers override this to remove those elements for a cleaner UX.
   */
  runOnBlock(): void {}

  /**
   * Process response data from informational endpoints (non-prompt URLs).
   *
   * Used to extract metadata like model configuration or user identity
   * from auxiliary API responses.
   *
   * @param _body - The parsed response body from an info endpoint
   */
  metaHttpInput(_body: unknown): void {}

  // ── Messaging helpers ─────────────────────────────────────────────────────

  /**
   * Send extracted prompts to the background for guard scanning.
   * Returns the scan result (or a safe default if messaging isn't bound yet).
   */
  async processRequestBody(prompts: string[]): Promise<PromptScanResult> {
    if (!this._sendGuard) {
      console.warn(`[Tidewall][${this.name}] sendGuard not bound`);
      return { blocked: false, transformed: false, summary: "" };
    }
    return this._sendGuard(prompts);
  }

  /**
   * Forward an AI response text to the background for output scanning.
   */
  sendAiResponse(text: string): void {
    if (!this._sendOutput) {
      console.warn(`[Tidewall][${this.name}] sendOutput not bound`);
      return;
    }
    this._sendOutput(text);
  }
}
