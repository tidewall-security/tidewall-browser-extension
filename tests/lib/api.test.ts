import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/storage", () => ({
  serverUrl: { getValue: vi.fn().mockResolvedValue("http://localhost:8080") },
  rtToken: { getValue: vi.fn().mockResolvedValue("rt_test123") },
  atToken: { getValue: vi.fn().mockResolvedValue("at_test456") },
  credentials: {
    getValue: vi.fn().mockResolvedValue({
      installationId: "11111111-1111-4111-8111-111111111111",
      deviceId: "dev-1",
      accessToken: "at_test456",
      accessTokenExpiry: 0,
      refreshToken: "dr_test789",
    }),
  },
}));

import { guardChat, enrolDevice, refreshDevice } from "../../lib/api";

describe("guardChat", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("sends POST to guard endpoint with Bearer auth", async () => {
    const mockResp = {
      ok: true,
      status: 200,
      json: () => Promise.resolve({ result: { blocked: false } }),
    };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResp);

    await guardChat({
      guard_input: { messages: [{ role: "user", content: "test" }] },
      event_type: "input",
      user_id: "user",
      collector_instance_id: "fp",
      app_id: "chatgpt",
      model: "gpt-4o",
      model_version: "",
    });

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:8080/v1/guard_chat_completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer at_test456",
          "Content-Type": "application/json",
        }),
      })
    );
  });

  it("throws ACCESS_TOKEN_EXPIRED on 401", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 401,
    });

    await expect(
      guardChat({
        guard_input: { messages: [] },
        event_type: "input",
        user_id: "",
        collector_instance_id: "",
        app_id: "",
        model: "",
        model_version: "",
      })
    ).rejects.toThrow("ACCESS_TOKEN_EXPIRED");
  });

  it("throws on non-401 error", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    await expect(
      guardChat({
        guard_input: { messages: [] },
        event_type: "input",
        user_id: "",
        collector_instance_id: "",
        app_id: "",
        model: "",
        model_version: "",
      })
    ).rejects.toThrow("500");
  });
});


// ── Enrolment ────────────────────────────────────────────────────────────────

const ENROL_BODY = {
  installation_id: "11111111-1111-4111-8111-111111111111",
  device_name: "d",
  user_name: "u",
  user_email: "u@example.com",
  browser: "Chrome",
  os: "macOS",
  extension_version: "1.0.0",
};

function respond(status: number, body: unknown) {
  (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
  });
}

describe("enrolDevice", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));

  it("posts to /v1/devices/enrol with the rt_ registration token", async () => {
    respond(201, {
      status: "Success",
      result: {
        device_id: "dev-1",
        device_status: "pending",
        access_token: { token: "at_new", expires_in: 3600 },
        refresh_token: { token: "dr_new", expires_in: 2592000 },
        confirmation_code: "K7M2QXBD",
      },
    });

    const out = await enrolDevice(ENROL_BODY);

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:8080/v1/devices/enrol",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer rt_test123" }),
      })
    );
    expect(out.kind).toBe("success");
    if (out.kind !== "success") throw new Error("unreachable");
    expect(out.credentials.refreshToken).toBe("dr_new");
    expect(out.deviceStatus).toBe("pending");
    expect(out.confirmationCode).toBe("K7M2QXBD");
  });

  it.each([
    ["InstallationTombstoned", 403],
    ["PendingQuotaExceeded", 429],
    ["RegistrationTokenExhausted", 403],
    ["InstallationIdAlreadyEnrolled", 409],
  ])("treats %s as a refusal, not credentials", async (reason, status) => {
    // 429 is checked before the body, so exercise the body path for the others.
    respond(status, { status: reason, reason, result: null });
    const out = await enrolDevice(ENROL_BODY);
    expect(out.kind).not.toBe("success");
  });

  it("refuses a 201 whose body says nothing was created", async () => {
    // The server answered exactly this for two outcomes until recently. A
    // client keying on the status code would have stored empty credentials and
    // reported success, with nothing to show the user.
    respond(201, { status: "InstallationTombstoned", result: null });

    const out = await enrolDevice(ENROL_BODY);

    expect(out.kind).toBe("failure");
  });

  it("never produces credentials from a null result, whatever the status", async () => {
    respond(200, { status: "Success", result: null });
    const out = await enrolDevice(ENROL_BODY);
    expect(out.kind).not.toBe("success");
  });
});

// ── Refresh ──────────────────────────────────────────────────────────────────

describe("refreshDevice", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));

  it("posts to the device's own path with the dr_ token, never at_", async () => {
    respond(200, {
      status: "ok",
      result: { access_token: { token: "at_fresh", expires_in: 3600 } },
    });

    await refreshDevice("dev-1");

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:8080/v1/devices/dev-1/refresh",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer dr_test789" }),
      })
    );
  });

  it.each([
    ["device_pending", 202],
    ["device_revoked", 403],
    ["credential_expired", 401],
    ["credential_unknown", 401],
  ])("maps %s to a failure carrying that reason", async (reason, status) => {
    respond(status, { status: reason, reason, result: null });

    const out = await refreshDevice("dev-1");

    expect(out).toEqual({ kind: "failure", reason });
  });

  it("reports rate limiting distinctly so the caller can back off", async () => {
    respond(429, { detail: "Too many requests" });
    expect((await refreshDevice("dev-1")).kind).toBe("rate_limited");
  });

  it("does not treat an unrecognised body as success", async () => {
    respond(200, { status: "something-new", result: null });
    expect((await refreshDevice("dev-1")).kind).toBe("transport_failure");
  });
});
