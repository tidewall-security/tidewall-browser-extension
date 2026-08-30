/**
 * The client's own HTTP layer against a running server. REAL fetch.
 *
 * Every other test stubs fetch, so the URL the client builds, the header it
 * sets and the credential prefix it chooses were only ever compared against a
 * mock built from the same belief. A trailing slash, a path-encoding difference
 * or a header casing issue would pass all of them.
 *
 * Skipped unless TIDEWALL_INTEGRATION=1 and a server is listening, so it never
 * turns an ordinary run red.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { readFileSync } from "node:fs";

const BASE = process.env.TIDEWALL_SERVER ?? "http://localhost:8099";
const ADMIN = process.env.TIDEWALL_ADMIN_KEY ?? "ak_demo_bootstrap_key_000000000001";

/**
 * Opt in explicitly. Without this the suite would fail on every ordinary run
 * and in CI, where no server is listening -- and a test that is red by default
 * gets skipped by habit rather than by decision.
 */
const ENABLED = process.env.TIDEWALL_INTEGRATION === "1";

function registrationToken(): string {
  if (process.env.TIDEWALL_RT) return process.env.TIDEWALL_RT;
  try {
    return readFileSync("/tmp/int-rt.txt", "utf8").trim();
  } catch {
    return "";
  }
}
vi.mock("../../lib/storage", () => ({
  serverUrl: { getValue: async () => process.env.TIDEWALL_SERVER ?? "http://localhost:8099" },
  rtToken: { getValue: async () => globalThis.__RT__ },
  credentials: { getValue: async () => globalThis.__CREDS__ },
}));

import { enrolDevice, refreshDevice } from "../../lib/api";

declare global {
  var __RT__: string;
  var __CREDS__: unknown;
}

const run = ENABLED ? describe : describe.skip;

run("the client against a live server (real fetch)", () => {
  const iid = crypto.randomUUID();
  let deviceId = "";
  let code = "";

  beforeAll(() => {
    globalThis.__RT__ = registrationToken();
  });

  it("enrols over real HTTP and gets a pending device", async () => {
    const out = await enrolDevice({
      installation_id: iid,
      device_name: "integration",
      user_name: "j",
      user_email: "j@example.com",
      browser: "Chrome",
      os: "macOS",
      extension_version: "1.0.0",
    });

    expect(out.kind).toBe("success");
    if (out.kind !== "success") throw new Error(JSON.stringify(out));
    expect(out.deviceStatus).toBe("pending");
    expect(out.confirmationCode).toBeTruthy();
    expect(out.credentials.refreshToken).toMatch(/^dr_/);

    deviceId = out.credentials.deviceId;
    code = out.confirmationCode!;
    globalThis.__CREDS__ = out.credentials;
  });

  it("refreshes over real HTTP once approved", async () => {
    // Approve out of band, as an administrator would.
    const approve = await fetch(`${BASE}/v1/devices/${deviceId}/approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ADMIN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation_code: code }),
    });
    expect(approve.status).toBe(200);

    const out = await refreshDevice(deviceId);

    // This is the assertion the stubs could never make: the URL the client
    // BUILDS reached the route the server actually EXPOSES.
    expect(out.kind).toBe("success");
    if (out.kind !== "success") throw new Error(JSON.stringify(out));
    expect(out.accessToken).toMatch(/^at_/);
  });

  it("reads device_revoked from a real revocation", async () => {
    await fetch(`${BASE}/v1/devices/${deviceId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${ADMIN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "revoked" }),
    });

    expect(await refreshDevice(deviceId)).toEqual({
      kind: "failure",
      reason: "device_revoked",
    });
  });

  /**
   * A server guarantee the client depends on, asserted with raw fetch because
   * the client would never make this call. `refreshDevice` sends the `dr_`;
   * the point here is that an `at_` presented to the same route is refused, so
   * a leaked access token cannot mint fresh ones indefinitely.
   *
   * Uses its own installation so it does not depend on where it sits relative
   * to the revocation below, which is terminal for the shared device.
   */
  it("refuses an at_ credential on the refresh route", async () => {
    const fresh = await enrolDevice({
      installation_id: crypto.randomUUID(),
      device_name: "at-on-refresh",
      user_name: "j",
      user_email: "j@example.com",
      browser: "Chrome",
      os: "macOS",
      extension_version: "1.0.0",
    });
    if (fresh.kind !== "success") throw new Error(JSON.stringify(fresh));

    const resp = await fetch(`${BASE}/v1/devices/${fresh.credentials.deviceId}/refresh`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${fresh.credentials.accessToken}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });

    // Pinning the code, not just the refusal: without it a later change could
    // turn this into a 500 and still look like it passes.
    expect(resp.status).toBe(401);
  });

  it("reads InstallationTombstoned from a real re-enrolment", async () => {
    const out = await enrolDevice({
      installation_id: iid,
      device_name: "integration",
      user_name: "j",
      user_email: "j@example.com",
      browser: "Chrome",
      os: "macOS",
      extension_version: "1.0.0",
    });

    expect(out).toEqual({ kind: "failure", reason: "InstallationTombstoned" });
  });

  /**
   * PendingQuotaExceeded is NOT driven here, deliberately.
   *
   * The quota is 50 per registration token and the enrolment rate limiter
   * allows 10 a minute, so reaching it over real HTTP takes five minutes --
   * and the first attempt to write it here did not fail, it silently measured
   * the rate limiter instead, because the client collapsed both 429s into
   * `rate_limited`. That conflation is now fixed and pinned in
   * tests/lib/api-429.test.ts, where the response can be constructed directly
   * rather than waited for.
   *
   * A slow job could drive it end to end. That is the remaining half of
   * issue #3, and it is a genuine one -- but it is not this file.
   */
});
