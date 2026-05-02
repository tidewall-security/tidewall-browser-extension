/**
 * Extension constants and the AI site registry.
 *
 * This module defines the master list of all 37 supported AI sites. Each entry
 * maps a canonical hostname (or wildcard pattern) to its display name, alias,
 * and Chrome extension URL match patterns. The registry is consumed by:
 *
 * - The content script to determine which handler to load for the current page
 * - The manifest (via {@link getAllUrlPatterns}) to declare content script matches
 * - The handler index to map aliases to display names
 *
 * To add a new AI site, add an entry here and create a corresponding handler
 * file in `handlers/`.
 *
 * @module lib/constants
 */

import type { SiteEntry } from "./types";

/** Current extension version string, used in device registration. */
export const EXTENSION_VERSION = "1.0.0";

/**
 * Registry of all 37 supported AI sites.
 *
 * Keys are the canonical hostname (or glob pattern like `"*.dopple.ai"`) used
 * to match the current page. Values contain the display name, alias (used as
 * handler lookup key and storage key), and Chrome URL match patterns.
 *
 * The order roughly follows priority tiers:
 * - Tier 1: Major platforms (ChatGPT, Claude, Gemini, Copilot, etc.)
 * - Tier 2: Popular alternatives (Grok, Meta AI, Mistral, Poe, etc.)
 * - Tier 3: Niche and specialized sites
 */
export const SITE_REGISTRY: Record<string, SiteEntry> = {
  "chatgpt.com": {
    name: "ChatGPT",
    alias: "chatgpt",
    urlMatch: ["*://*.chatgpt.com/*"],
  },
  "claude.ai": {
    name: "Claude",
    alias: "claude",
    urlMatch: ["*://*.claude.ai/*"],
  },
  "gemini.google.com": {
    name: "Gemini",
    alias: "gemini",
    urlMatch: ["*://*.gemini.google.com/*"],
  },
  "copilot.microsoft.com": {
    name: "Copilot",
    alias: "copilot",
    urlMatch: ["*://copilot.microsoft.com/*"],
  },
  "m365.cloud.microsoft": {
    name: "M365 Copilot",
    alias: "m365copilot",
    urlMatch: ["*://m365.cloud.microsoft/chat/*"],
  },
  "www.perplexity.ai": {
    name: "Perplexity",
    alias: "perplexity",
    urlMatch: ["*://www.perplexity.ai/*"],
  },
  "chat.deepseek.com": {
    name: "DeepSeek",
    alias: "deepseek",
    urlMatch: ["*://chat.deepseek.com/*"],
  },
  "grok.com": {
    name: "Grok",
    alias: "grok",
    urlMatch: ["*://grok.com/*"],
  },
  "www.meta.ai": {
    name: "Meta AI",
    alias: "meta",
    urlMatch: ["*://www.meta.ai/*"],
  },
  "*mistral.ai": {
    name: "Mistral",
    alias: "mistral",
    urlMatch: ["*://mistral.ai/*", "*://*.mistral.ai/*"],
  },
  "aistudio.google.com": {
    name: "Google AI Studio",
    alias: "aistudio",
    urlMatch: ["*://aistudio.google.com/*"],
  },
  "poe.com": {
    name: "Poe",
    alias: "poe",
    urlMatch: ["*://poe.com/*"],
  },
  "you.com": {
    name: "You.com",
    alias: "you",
    urlMatch: ["*://you.com/*"],
  },
  "app.glean.com": {
    name: "Glean",
    alias: "glean",
    urlMatch: ["*://app.glean.com/*"],
  },
  "*.lightning.force.com": {
    name: "Salesforce",
    alias: "salesforce",
    urlMatch: ["*://*.lightning.force.com/*"],
  },
  "character.ai": {
    name: "Character AI",
    alias: "character",
    urlMatch: ["*://character.ai/*"],
  },
  "www.notion.so": {
    name: "Notion",
    alias: "notion",
    urlMatch: ["*://www.notion.so/*"],
  },
  "iask.ai": {
    name: "iAsk",
    alias: "iask",
    urlMatch: ["*://iask.ai/*"],
  },
  "www.dall-efree.com": {
    name: "DALL-E Free",
    alias: "dalle",
    urlMatch: ["*://www.dall-efree.com/*"],
  },
  "openart.ai": {
    name: "OpenArt",
    alias: "openart",
    urlMatch: ["*://openart.ai/*"],
  },
  "app.copy.ai": {
    name: "Copy AI",
    alias: "copyai",
    urlMatch: ["*://app.copy.ai/*"],
  },
  "app.sigmabrowser.com": {
    name: "Sigma",
    alias: "sigma",
    urlMatch: ["*://app.sigmabrowser.com/*"],
  },
  "www.joyland.ai": {
    name: "Joyland",
    alias: "joyland",
    urlMatch: ["*://www.joyland.ai/*"],
  },
  "flowgpt.com": {
    name: "FlowGPT",
    alias: "flowgpt",
    urlMatch: ["*://flowgpt.com/*"],
  },
  "pi.ai": {
    name: "Pi",
    alias: "pi",
    urlMatch: ["*://pi.ai/*"],
  },
  "www.phind.com": {
    name: "Phind",
    alias: "phind",
    urlMatch: ["*://www.phind.com/*"],
  },
  "www.sakura.fm": {
    name: "Sakura",
    alias: "sakura",
    urlMatch: ["*://www.sakura.fm/*"],
  },
  "anonchatgpt.com": {
    name: "AnonChatGPT",
    alias: "anonchatgpt",
    urlMatch: ["*://anonchatgpt.com/*"],
  },
  "www.chatgot.io": {
    name: "ChatGOT",
    alias: "chatgot",
    urlMatch: ["*://*.chatgot.io/*"],
  },
  "gptonline.ai": {
    name: "GPT Online",
    alias: "gptonline",
    urlMatch: ["*://gptonline.ai/*"],
  },
  "www.askan.ai": {
    name: "Askan.ai",
    alias: "askanai",
    urlMatch: ["*://www.askan.ai/*"],
  },
  "chat.kuki.ai": {
    name: "Kuki",
    alias: "kuki",
    urlMatch: ["*://chat.kuki.ai/*"],
  },
  "www.hereforyou.app": {
    name: "Here for You",
    alias: "hereforyou",
    urlMatch: ["*://www.hereforyou.app/*"],
  },
  "yodayo.com": {
    name: "Yodayo",
    alias: "yodayo",
    urlMatch: ["*://yodayo.com/*"],
  },
  "charstar.ai": {
    name: "Charstar",
    alias: "charstar",
    urlMatch: ["*://charstar.ai/*"],
  },
  "deftgpt.com": {
    name: "DeftGPT",
    alias: "deftgpt",
    urlMatch: ["*://deftgpt.com/*"],
  },
  "*.dopple.ai": {
    name: "Dopple",
    alias: "dopple",
    urlMatch: ["*://*.dopple.ai/*"],
  },
};

/**
 * Collect all URL match patterns from every registered site into a flat array.
 *
 * Used to populate the `matches` field of the content script registration,
 * ensuring the content script runs on all supported AI site pages.
 *
 * @returns Array of Chrome extension URL match patterns (e.g., `["*://*.chatgpt.com/*", ...]`)
 */
export function getAllUrlPatterns(): string[] {
  return Object.values(SITE_REGISTRY).flatMap((entry) => entry.urlMatch);
}

/**
 * Build a reverse lookup map from site alias to registry key (hostname).
 *
 * Useful when you have a site alias (e.g., "chatgpt") and need to find
 * the corresponding registry key (e.g., "chatgpt.com").
 *
 * @returns Map of alias to registry hostname key
 */
export function getAliasMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [key, entry] of Object.entries(SITE_REGISTRY)) {
    map[entry.alias] = key;
  }
  return map;
}
