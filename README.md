# Tidewall Extension

Browser extension for Tidewall — monitors, redacts, and blocks prompts
sent to AI chat sites (ChatGPT, Claude, Gemini, Copilot, Perplexity,
DeepSeek, and ~32 other GenAI applications).

The extension intercepts outbound network requests in the browser,
extracts the prompt text using site-specific handlers, and routes the
prompt through a Tidewall guard server before allowing the request to
proceed. Block / transform / allow decisions are applied inline.

## Supported Browsers

| Browser | Status | Build target |
| --- | --- | --- |
| Chrome | Supported | Manifest V3 |
| Edge | Supported | Manifest V3 (uses the Chrome build) |
| Firefox | Supported | Manifest V2 fallback via WXT |
| Safari | Planned | — |

A single TypeScript codebase (powered by [WXT][wxt]) targets all browsers.
Use `npm run build` for Chrome/Edge and `npm run build:firefox` for Firefox.

[wxt]: https://wxt.dev/

## Supported Sites

37 sites at launch — full list in [`lib/constants.ts`](./lib/constants.ts).
Major sites include:

ChatGPT, Claude, Gemini, Copilot, M365 Copilot, Perplexity, DeepSeek,
Grok, Meta AI, Mistral, AI Studio (Google), Poe, You.com, Glean,
Salesforce, Character AI, Notion, iAsk, DALL-E, OpenArt, Copy AI,
Sigma, Joyland, FlowGPT, Pi, Phind, Sakura, AnonChatGPT, ChatGOT,
GPT Online, Askan AI, Kuki, Here For You, Yodayo, Charstar, DeftGPT,
Dopple.

Each site has its own handler that knows how to extract the user's
prompt from that site's specific request payload (fetch body, XHR
form data, WebSocket message, etc.).

## Quick Start

```bash
npm install
npm run build         # Chrome/Edge build → .output/chrome-mv3/
npm run build:firefox # Firefox build  → .output/firefox-mv2/
```

Load the unpacked extension into your browser:

- **Chrome / Edge**: `chrome://extensions` → Developer mode →
  "Load unpacked" → select `.output/chrome-mv3/`.
- **Firefox**: `about:debugging` → "This Firefox" → "Load Temporary
  Add-on" → select any file in `.output/firefox-mv2/`.

Once loaded, click the extension icon and register the device against
your Tidewall server URL using a registration token (`rt_*`).

## Architecture

```
            Page world                Content script           Background
        ┌─────────────────┐       ┌───────────────────┐    ┌────────────┐
HTTP →  │  capture.ts     │       │  content.ts       │    │ background │
        │  (page-injected)│       │  (extension origin)│   │ service    │
        │  patches fetch, │ event │  routes events to │ msg│ worker —   │
        │  XHR, WebSocket │ ────► │  site handlers,   │ ──►│ talks to   │
        │                 │       │  applies block /  │    │ Tidewall   │
        │                 │       │  transform        │    │ server     │
        └─────────────────┘       └───────────────────┘    └────────────┘
```

Three execution contexts cooperate:

1. **Capture script** runs in the page world (same JS context as the
   site itself). It monkey-patches `window.fetch`, `XMLHttpRequest`,
   and `WebSocket` to intercept outbound requests before they're sent.
2. **Content script** runs in an isolated extension context with
   access to extension APIs. It receives intercepted events from the
   capture script, routes them through site-specific handlers, and
   forwards prompts to the background.
3. **Background service worker** persistently holds the access token,
   makes authenticated calls to the Tidewall guard server, and pushes
   block/transform decisions back to content for inline enforcement.

## Site Handlers

Each supported site has a small handler in
[`handlers/`](./handlers) that implements the extraction interface
defined by [`handlers/base.ts`](./handlers/base.ts):

```typescript
class MySiteHandler extends SiteHandler {
  override promptHttpInput(body: unknown): string[] {
    // Parse body, return user prompts
  }

  override metaHttpInput(body: unknown): void {
    // Optional: extract user/model metadata
  }

  override logResponse(): void {
    // Optional: capture AI response after streaming finishes
  }
}
```

Handlers are unit-tested with Vitest — 200+ tests live in
[`tests/handlers/`](./tests/handlers).

## Tests

```bash
npm test            # all tests
npm run test:watch  # watch mode
```

## Modes

The extension's per-site behaviour is pushed from the Tidewall server
during device check:

| Mode | Behaviour |
| --- | --- |
| `block` | Inline guard call; block / transform applied to the prompt before it leaves the browser |
| `log` | Inline guard call; result logged but request always passes through |
| `discover` | No guard call; just track which sites the user visits |
| `disabled` | Handler is not loaded for this site |

## License

Apache License 2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Vulnerability reports go to
[SECURITY.md](./SECURITY.md).
