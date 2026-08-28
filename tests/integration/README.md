# Running the live-server integration test

`live-server.test.ts` drives the real client HTTP layer against a running
`tidewall-server`. It is the only test here that makes a real request — every
other one stubs `fetch`, so the URL the client builds, the header it sets and the
credential prefix it chooses are compared against a mock built from the same
belief. A trailing slash, a path-encoding difference or a header casing issue
passes all of them.

It is **skipped unless `TIDEWALL_INTEGRATION=1`**, because no server is listening
in CI and a test that is red by default gets skipped by habit rather than by
decision.

## Run it

```bash
# 1. a clean server on :8099
cd ../tidewall-server
rm -f /tmp/int.db
DB_URL="sqlite:////tmp/int.db" \
  BOOTSTRAP_KEY="ak_demo_bootstrap_key_000000000001" \
  PREWARM=false \
  uv run uvicorn app.main:app --port 8099 &

# 2. seed a policy and a registration token, writing it to /tmp/int-rt.txt
uv run python ../tidewall-browser-extension/tests/integration/seed.py

# 3. run it
cd ../tidewall-browser-extension
TIDEWALL_INTEGRATION=1 npx vitest run tests/integration/live-server.test.ts
```

`TIDEWALL_SERVER`, `TIDEWALL_RT` and `TIDEWALL_ADMIN_KEY` override the defaults.

## What it proves, and what it does not

**Proves:** the client's own HTTP layer reaches the routes the server exposes.
Mutation-tested — a trailing slash on the refresh URL, sending `at_` where `dr_`
is required, and dropping the `Bearer` prefix each turn it red.

**Does not prove:** anything about the extension *in a browser*. Storage, the
background worker and the alarms are not exercised here; this imports
`lib/api.ts` into node. That half is issue #3.
