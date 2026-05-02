# Security Policy

Thanks for helping keep Tidewall and its users safe.

## Supported Versions

While the project is in alpha (0.x), only the latest minor release
receives security fixes.

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security findings.**

Instead, use one of:

- GitHub Security Advisories on this repository (`Security` tab →
  `Report a vulnerability`).
- Email: `security@tidewall.ai`.

Please include:

- A description of the issue and where it lives in the code.
- Steps to reproduce, ideally with a minimal proof-of-concept.
- The impact — what an attacker could do if exploited.
- Any mitigations or workarounds you've identified.

## What to Expect

- We aim to acknowledge new reports within **3 business days**.
- We'll work with you on a fix and a coordinated disclosure timeline.
- We're happy to credit you in the advisory once the fix is public,
  unless you'd prefer to remain anonymous.

## Browser-Extension-Specific Concerns

Particular categories we're keen to hear about:

- DOM-based XSS in the popup or notification banners.
- Privilege escalation via message-passing between page and
  extension contexts.
- Token leakage from `chrome.storage.local`.
- Bypasses of the prompt-extraction or block-enforcement logic for
  any supported site.

## Out of Scope

- Issues in WXT, Vite, or other dependencies — please report upstream.
- Theoretical attacks requiring attacker control of the user's browser.
- Findings that depend on misconfiguration the documentation explicitly
  warns against.
