import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/storage", () => ({
  serverUrl: { getValue: vi.fn().mockResolvedValue("http://localhost:8080") },
  rtToken: { getValue: vi.fn().mockResolvedValue("rt_test123") },
  atToken: { getValue: vi.fn().mockResolvedValue("at_test456") },
}));

import { guardChat, deviceCheck } from "../../lib/api";

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

describe("deviceCheck", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("sends POST to devices/check with rt_ token", async () => {
    const mockResp = {
      ok: true,
      status: 200,
      json: () => Promise.resolve({ status: "Success", result: null }),
    };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResp);

    await deviceCheck({ fingerprint: "fp123", user_name: "Jon" });

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:8080/v1/devices/check",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer rt_test123",
        }),
      })
    );
  });
});
