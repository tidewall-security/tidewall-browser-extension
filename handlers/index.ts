/**
 * Handler registry and factory for all 37 supported AI sites.
 *
 * This module imports every site handler and exposes them through a single
 * factory function {@link getHandler}. The content script calls `getHandler`
 * with a site alias and mode to get the appropriate handler instance.
 *
 * Handlers are organized into three tiers by usage priority:
 * - **Tier 1** (7): ChatGPT, Claude, Gemini, Copilot, M365 Copilot, Perplexity, DeepSeek
 * - **Tier 2** (8): Grok, Meta AI, Mistral, AI Studio, Poe, You.com, Glean, Salesforce
 * - **Tier 3** (22): All remaining niche and specialized AI sites
 *
 * @module handlers/index
 */

import type { SiteMode } from "../lib/types";
import type { SiteHandler } from "./base";

// Tier 1 (7 handlers)
import { ChatGPTHandler } from "./chatgpt";
import { ClaudeHandler } from "./claude";
import { GeminiHandler } from "./gemini";
import { CopilotHandler } from "./copilot";
import { M365CopilotHandler } from "./m365copilot";
import { PerplexityHandler } from "./perplexity";
import { DeepSeekHandler } from "./deepseek";

// Tier 2 (8 handlers)
import { GrokHandler } from "./grok";
import { MetaHandler } from "./meta";
import { MistralHandler } from "./mistral";
import { AIStudioHandler } from "./aistudio";
import { PoeHandler } from "./poe";
import { YouHandler } from "./you";
import { GleanHandler } from "./glean";
import { SalesforceHandler } from "./salesforce";

// Tier 3 (22 handlers)
import { CharacterHandler } from "./character";
import { NotionHandler } from "./notion";
import { IAskHandler } from "./iask";
import { DalleHandler } from "./dalle";
import { OpenArtHandler } from "./openart";
import { CopyAIHandler } from "./copyai";
import { SigmaHandler } from "./sigma";
import { JoylandHandler } from "./joyland";
import { FlowGPTHandler } from "./flowgpt";
import { PiHandler } from "./pi";
import { PhindHandler } from "./phind";
import { SakuraHandler } from "./sakura";
import { AnonChatGPTHandler } from "./anonchatgpt";
import { ChatGOTHandler } from "./chatgot";
import { GPTOnlineHandler } from "./gptonline";
import { AskanAIHandler } from "./askanai";
import { KukiHandler } from "./kuki";
import { HereForYouHandler } from "./hereforyou";
import { YodayoHandler } from "./yodayo";
import { CharstarHandler } from "./charstar";
import { DeftGPTHandler } from "./deftgpt";
import { DoppleHandler } from "./dopple";

/**
 * Factory function type that creates a handler instance given a display name and mode.
 */
type HandlerFactory = (name: string, mode: SiteMode) => SiteHandler;

/**
 * Internal registry mapping site aliases to their handler factory functions.
 * Each factory constructs the appropriate handler subclass.
 */
const registry: Record<string, HandlerFactory> = {
  // Tier 1
  chatgpt: (n, m) => new ChatGPTHandler(n, m),
  claude: (n, m) => new ClaudeHandler(n, m),
  gemini: (n, m) => new GeminiHandler(n, m),
  copilot: (n, m) => new CopilotHandler(n, m),
  m365copilot: (n, m) => new M365CopilotHandler(n, m),
  perplexity: (n, m) => new PerplexityHandler(n, m),
  deepseek: (n, m) => new DeepSeekHandler(n, m),
  // Tier 2
  grok: (n, m) => new GrokHandler(n, m),
  meta: (n, m) => new MetaHandler(n, m),
  mistral: (n, m) => new MistralHandler(n, m),
  aistudio: (n, m) => new AIStudioHandler(n, m),
  poe: (n, m) => new PoeHandler(n, m),
  you: (n, m) => new YouHandler(n, m),
  glean: (n, m) => new GleanHandler(n, m),
  salesforce: (n, m) => new SalesforceHandler(n, m),
  // Tier 3
  character: (n, m) => new CharacterHandler(n, m),
  notion: (n, m) => new NotionHandler(n, m),
  iask: (n, m) => new IAskHandler(n, m),
  dalle: (n, m) => new DalleHandler(n, m),
  openart: (n, m) => new OpenArtHandler(n, m),
  copyai: (n, m) => new CopyAIHandler(n, m),
  sigma: (n, m) => new SigmaHandler(n, m),
  joyland: (n, m) => new JoylandHandler(n, m),
  flowgpt: (n, m) => new FlowGPTHandler(n, m),
  pi: (n, m) => new PiHandler(n, m),
  phind: (n, m) => new PhindHandler(n, m),
  sakura: (n, m) => new SakuraHandler(n, m),
  anonchatgpt: (n, m) => new AnonChatGPTHandler(n, m),
  chatgot: (n, m) => new ChatGOTHandler(n, m),
  gptonline: (n, m) => new GPTOnlineHandler(n, m),
  askanai: (n, m) => new AskanAIHandler(n, m),
  kuki: (n, m) => new KukiHandler(n, m),
  hereforyou: (n, m) => new HereForYouHandler(n, m),
  yodayo: (n, m) => new YodayoHandler(n, m),
  charstar: (n, m) => new CharstarHandler(n, m),
  deftgpt: (n, m) => new DeftGPTHandler(n, m),
  dopple: (n, m) => new DoppleHandler(n, m),
};

/**
 * Look up and instantiate the handler for a given site alias.
 *
 * Returns null if no handler is registered for the alias (the site may
 * still be tracked in discover mode without a handler).
 *
 * @param alias - Lowercase site alias (e.g., "chatgpt", "claude")
 * @param mode - Operating mode to initialize the handler with
 * @returns A new handler instance, or null if the alias is not registered
 */
export function getHandler(alias: string, mode: SiteMode = "block"): SiteHandler | null {
  const factory = registry[alias];
  if (!factory) return null;

  const names: Record<string, string> = {
    // Tier 1
    chatgpt: "ChatGPT",
    claude: "Claude",
    gemini: "Gemini",
    copilot: "Copilot",
    m365copilot: "M365 Copilot",
    perplexity: "Perplexity",
    deepseek: "Deepseek",
    // Tier 2
    grok: "Grok",
    meta: "Meta AI",
    mistral: "Mistral",
    aistudio: "Google AI Studio",
    poe: "Poe",
    you: "You.com",
    glean: "Glean",
    salesforce: "Salesforce",
    // Tier 3
    character: "Character AI",
    notion: "Notion",
    iask: "Ask AI",
    dalle: "DALL-E",
    openart: "OpenArt AI",
    copyai: "Copy AI",
    sigma: "Sigma",
    joyland: "Joyland AI",
    flowgpt: "FlowGPT",
    pi: "Pi AI",
    phind: "Phind",
    sakura: "Sakura",
    anonchatgpt: "AnonChatGPT",
    chatgot: "ChatGOT",
    gptonline: "GPT Online",
    askanai: "askan.ai",
    kuki: "Kuki AI",
    hereforyou: "Here for You",
    yodayo: "Yodayo",
    charstar: "Charstar AI",
    deftgpt: "DeftGPT",
    dopple: "Dopple.ai",
  };

  return factory(names[alias] ?? alias, mode);
}
