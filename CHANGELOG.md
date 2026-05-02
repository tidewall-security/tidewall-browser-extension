# Changelog

All notable changes to the Tidewall Extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-05-02

### Added

- Initial release of the Tidewall Extension.
- 37 site handlers covering ChatGPT, Claude, Gemini, Copilot, M365 Copilot,
  Perplexity, DeepSeek, Grok, Meta AI, Mistral, AI Studio, Poe, You.com,
  Glean, Salesforce, Character AI, Notion, iAsk, DALL-E, OpenArt, Copy AI,
  Sigma, Joyland, FlowGPT, Pi, Phind, Sakura, AnonChatGPT, ChatGOT,
  GPT Online, Askan AI, Kuki, Here For You, Yodayo, Charstar, DeftGPT,
  and Dopple.
- Three-context architecture: page-world capture, content script, background.
- Fetch / XMLHttpRequest / WebSocket interception, all supporting inline
  block and transform decisions.
- Per-site mode pushed from the Tidewall server: `block`, `log`,
  `discover`, `disabled`.
- 200+ unit tests for handler extraction logic.
- Manifest V3 build (Chrome / Edge) and Firefox MV2 build via WXT.

[Unreleased]: https://github.com/tidewall-security/tidewall-browser-extension/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/tidewall-security/tidewall-browser-extension/releases/tag/v0.1.0
