# Browser tests

`npm run build && npm run e2e`

They load `.output/chrome-mv3` into a real Chromium and assert the things unit
tests structurally cannot reach:

- the MV3 service worker starts and logs no errors
- the popup renders without a page error
- the capture script is injected into the PAGE WORLD and patches `window.fetch`
- it is NOT injected when the device is not connected
- the page world receives its configuration on the script tag

The fourth and fifth matter most: inspection now happens in the page world, so
"did the script arrive, and did it know which site it was on" is the difference
between a working guard and a silent one.

`npm run e2e:install` fetches the browser binary. CI does this itself.

## First-run check with the real guard

`first-run.spec.ts` verifies dashboard sign-in and the sandbox's PII,
injection, and clean-request presets. It checks desktop and mobile sandbox
layouts, then registers the built extension through its popup, approves its
confirmation code, and waits for the extension's normal token refresh.
Finally it verifies that clean text reaches a simulated chat destination,
injection never reaches it, and PII reaches it only after redaction. Guard
requests use the real server and its default policy; the chat destination is
intercepted locally by Playwright.

Start a disposable server in a separate terminal:

```bash
cd ../tidewall-server
test_dir=$(mktemp -d)
DB_URL="sqlite:///$test_dir/tidewall.db" \
  HOST=127.0.0.1 PORT=8099 \
  BOOTSTRAP_KEY=ak_demo_bootstrap_key_000000000001 \
  uv run python -m app
```

Then, from the extension repository:

```bash
npm run build
TIDEWALL_INTEGRATION=1 TIDEWALL_SERVER=http://127.0.0.1:8099 \
  npx playwright test tests/e2e/first-run.spec.ts
```

For a server bootstrapped with a different key, set `TIDEWALL_ADMIN_KEY` too.
The test creates its own registration token and removes its device and revokes
the token afterwards. Desktop and mobile screenshots are written under
`test-results/`. Stop the server with Ctrl-C when finished. The test is skipped
unless `TIDEWALL_INTEGRATION=1`; it needs no AI-provider credentials.

CI runs this check as **First run (real guard)** against a pinned compatible
server revision. It requires one executed, passing test with no skips and
uploads the screenshots, JSON report, and server log as
`first-run-browser-results`. Server CI also runs the test against its current
server code and a pinned extension revision.
