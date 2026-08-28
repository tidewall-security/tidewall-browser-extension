/**
 * Real server bytes, through the real client parsing.
 *
 * The fixtures in tests/contract/server-responses.json were captured from a
 * running tidewall-server, not hand-written. Everything else in this suite
 * asserts the client against responses the client's author imagined.
 *
 * REGENERATE with the server running on :8099 —
 *
 *     cd ../tidewall-server && rm -f /tmp/e2e-demo.db
 *     DB_URL="sqlite:////tmp/e2e-demo.db" \\
 *       BOOTSTRAP_KEY="ak_demo_bootstrap_key_000000000001" PREWARM=false \\
 *       uv run uvicorn app.main:app --port 8099 &
 *     uv run python ../tidewall-browser-extension/tests/contract/capture-server-responses.py
 *
 * KNOWN LIMIT: captured fixtures go stale like any snapshot. They prove the
 * client parses what the server SAID, on the day they were taken -- not what it
 * says now. Catching drift unprompted needs both halves running together, which
 * is issue #3. This is the cheap half, and it is real bytes rather than
 * imagined ones.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fixtures from "../contract/server-responses.json";

vi.mock("../../lib/storage", () => ({
  serverUrl: { getValue: async () => "http://localhost:8099" },
  rtToken: { getValue: async () => "rt_x" },
  credentials: { getValue: async () => ({ deviceId: "d", refreshToken: "dr_x" }) },
}));

import { enrolDevice, refreshDevice } from "../../lib/api";

function serve(f: { status: number; body: unknown }) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: f.status < 400, status: f.status, json: () => Promise.resolve(f.body),
  }));
}
const BODY = {
  installation_id: "11111111-1111-4111-8111-111111111111",
  device_name: "l", user_name: "j", user_email: "j@e.com",
  browser: "C", os: "m", extension_version: "1",
};

beforeEach(() => vi.clearAllMocks());

describe("real server responses through the client", () => {
  it("a pending enrolment yields credentials, a status and a code", async () => {
    serve(fixtures.enrol_pending);
    const out = await enrolDevice(BODY);
    expect(out.kind).toBe("success");
    if (out.kind !== "success") throw new Error("unreachable");
    expect(out.deviceStatus).toBe("pending");
    expect(out.confirmationCode).toMatch(/^[A-Z2-9]{8}$/);
    expect(out.credentials.refreshToken).toMatch(/^dr_/);
    expect(out.credentials.accessToken).toMatch(/^at_/);
    expect(out.credentials.accessTokenExpiry).toBeGreaterThan(Date.now());
  });

  it("a successful refresh yields an access token and NO refresh token", async () => {
    serve(fixtures.refresh_ok);
    const out = await refreshDevice("d");
    expect(out.kind).toBe("success");
    if (out.kind !== "success") throw new Error("unreachable");
    expect(out.accessToken).toMatch(/^at_/);
    expect(Object.keys(out)).not.toContain("refreshToken");
  });

  it("a revoked device is read as device_revoked, the terminal reason", async () => {
    serve(fixtures.refresh_revoked);
    expect(await refreshDevice("d")).toEqual({ kind: "failure", reason: "device_revoked" });
  });

  it("a tombstoned installation is a refusal, not credentials", async () => {
    serve(fixtures.enrol_tombstoned);
    expect(await enrolDevice(BODY)).toEqual({ kind: "failure", reason: "InstallationTombstoned" });
  });
});
