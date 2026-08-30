/**
 * The pending quota, driven for real.
 *
 * `PendingQuotaExceeded` is the outcome that reached production answering
 * "201 Created": it was added to the service after the route's mapping and
 * never got an entry, so a client keying on the status code stored an empty
 * credential tuple and wedged.
 *
 * It is also the outcome this client reported as a plain rate limit until
 * recently, because the server maps it to 429 and the client decided on the
 * status code before reading the body.
 *
 * Both are fixed, and neither fix had ever been exercised end to end against a
 * real server -- because at the default quota of 50, with the default
 * 10-a-minute enrolment limit, reaching it takes five minutes of steady
 * requests. The first attempt to write this as a per-PR test did not fail
 * honestly; it silently measured the rate limiter and reported `null`.
 *
 * So it lives in the nightly, where the server is started with a low quota and
 * a raised limit. Both are real settings now, which is the only reason this is
 * a few seconds of requests rather than five minutes.
 *
 * NOT gated on TIDEWALL_INTEGRATION alone: the per-PR contract job sets that
 * and starts a server with default limits, where this would measure the wrong
 * mechanism. It requires the quota to be NAMED.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { readFileSync } from "node:fs";

const QUOTA = Number(process.env.TIDEWALL_MAX_PENDING ?? "");
const BASE = process.env.TIDEWALL_SERVER ?? "http://localhost:8099";
const ADMIN = process.env.TIDEWALL_ADMIN_KEY ?? "ak_demo_bootstrap_key_000000000001";

vi.mock("../../lib/storage", () => ({
  serverUrl: { getValue: async () => process.env.TIDEWALL_SERVER ?? "http://localhost:8099" },
  rtToken: { getValue: async () => globalThis.__RT__ },
  credentials: { getValue: async () => ({}) },
}));

import { enrolDevice } from "../../lib/api";

declare global {
  var __RT__: string;
}

const run = Number.isInteger(QUOTA) && QUOTA > 0 ? describe : describe.skip;

run("the pending quota, against a real server", () => {
  const META = {
    device_name: "quota",
    user_name: "j",
    user_email: "j@example.com",
    browser: "Chrome",
    os: "macOS",
    extension_version: "1.0.0",
  };

  beforeAll(async () => {
    // Its OWN registration token. The quota is per token, and exhausting the
    // shared one would break every test that runs after this file.
    const policy = await (
      await fetch(`${BASE}/v1/policies`, {
        method: "POST",
        headers: { Authorization: `Bearer ${ADMIN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: `quota-${crypto.randomUUID().slice(0, 8)}`, type: "application" }),
      })
    ).json();

    const token = await (
      await fetch(`${BASE}/v1/registration-tokens`, {
        method: "POST",
        headers: { Authorization: `Bearer ${ADMIN}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "quota",
          policy_id: policy.id,
          expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        }),
      })
    ).json();

    // Fail loudly here rather than letting every enrolment below refuse for
    // an authentication reason and look like a quota result.
    expect(typeof token.token).toBe("string");
    globalThis.__RT__ = token.token;
  });

  it("refuses the enrolment past the quota, by its own reason", async () => {
    for (let i = 0; i < QUOTA; i++) {
      const out = await enrolDevice({ installation_id: crypto.randomUUID(), ...META });
      // Asserted per iteration: if one of these refuses early the final
      // expectation would still pass, for the wrong reason.
      expect(out.kind).toBe("success");
    }

    const over = await enrolDevice({ installation_id: crypto.randomUUID(), ...META });

    // Not `rate_limited`, which is what this returned before the client
    // learned to read the body of a 429.
    expect(over).toEqual({ kind: "failure", reason: "PendingQuotaExceeded" });
  }, 120_000);
});
