# Contributing to the Tidewall Extension

Thanks for your interest in contributing. Issues, pull requests, and
new site handlers are all welcome.

## Code of Conduct

Be respectful and constructive. Personal attacks, harassment, or
discriminatory behaviour are not tolerated. By participating, you
agree to abide by the
[Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).

## Reporting Bugs

Open an issue with:

- A short title that names the symptom.
- The site and exact prompt that reproduces the issue.
- What you expected vs what actually happened.
- Browser and version, OS, extension version.
- Any console errors (open DevTools → Console).

## Development Setup

```bash
git clone https://github.com/tidewall-security/tidewall-browser-extension
cd tidewall-browser-extension
npm install
npm run dev          # auto-reloads on file change
```

The dev mode launches a Chrome instance with the extension installed.
For Firefox: `npm run dev:firefox`.

## Adding a New Site Handler

1. Create `handlers/<sitename>.ts` extending `SiteHandler` from
   `handlers/base.ts`.
2. Implement at minimum:
   - The constructor with `super()` setting transport flags
     (`fetch: true`, `xmlhttp: true`, etc.) and the `promptUrls`
     regex array for matching the site's API endpoints.
   - `promptHttpInput()` (or `promptWsInput()`) returning extracted
     prompt text.
3. Register the handler in `handlers/index.ts`.
4. Add the site to `lib/constants.ts`.
5. Write a test in `tests/handlers/<sitename>.test.ts`.

See `handlers/chatgpt.ts` and `tests/handlers/chatgpt.test.ts` for a
canonical example.

## Pull Requests

1. Fork the repo and create a topic branch from `main`.
2. Keep the diff focused. Multiple unrelated changes belong in
   separate PRs.
3. Add or update tests for any behavioural change.
4. Update README / handler list when adding a site.
5. Make sure `npm test` and `npm run build` both pass.
6. Open the PR with a clear description.

## Style

- Strict TypeScript — no `any` without a comment justifying why.
- Single-purpose handlers — extraction logic only, no policy decisions.
- Comments explain *why*, not *what*.

## Security Findings

Don't open a public issue for a security vulnerability — see
[SECURITY.md](./SECURITY.md).
