/**
 * 429 is two different answers, and the client used to give one reply to both.
 *
 * `PendingQuotaExceeded` is listed in `ENROL_FAILURES`, so the client declares
 * it as a reason it handles -- but the enrolment route maps that outcome to
 * 429, and the client returned `rate_limited` on the status code before the
 * body was read. The listed entry was dead: the only outcome that can produce
 * it never reached the branch that handles it.
 *
 * It is the one enrolment reason that shares a code with a different failure,
 * which is why it is the one that broke.
 *
 * The difference matters to the person reading the message. "Rate limited"
 * says wait, and waiting clears a rate limit. Nothing the user does clears a
 * full pending quota -- an administrator has to approve devices -- so the
 * retry it invites can never succeed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/storage", () => ({
  serverUrl: { getValue: async () => "http://server" },
  rtToken: { getValue: async () => "rt_x" },
  credentials: { getValue: async () => ({ deviceId: "d", refreshToken: "dr_x" }) },
}));

import { enrolDevice, refreshDevice } from "../../lib/api";

const BODY = {
  installation_id: "11111111-1111-4111-8111-111111111111",
  device_name: "d",
  user_name: "u",
  user_email: "u@example.com",
  browser: "C",
  os: "m",
  extension_version: "1",
};

function answer(status: number, body: unknown, { json = true } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status < 400,
      status,
      json: json ? () => Promise.resolve(body) : () => Promise.reject(new Error("not JSON")),
    }),
  );
}

beforeEach(() => vi.clearAllMocks());

describe("the two 429s are told apart", () => {
  it("a pending quota is a failure with its reason, not a rate limit", async () => {
    answer(429, { status: "PendingQuotaExceeded", reason: "PendingQuotaExceeded", result: null });

    expect(await enrolDevice(BODY)).toEqual({
      kind: "failure",
      reason: "PendingQuotaExceeded",
    });
  });

  it("the rate limiter is still a rate limit", async () => {
    // The limiter's real body, which carries no `status` at all.
    answer(429, { detail: "Too many requests" });

    expect(await enrolDevice(BODY)).toEqual({ kind: "rate_limited" });
  });

  it("a 429 that is not JSON is a rate limit, not a transport failure", async () => {
    // An intermediary -- proxy, WAF, load balancer -- answers 429 with HTML.
    // Reading the body first must not turn that into an unparseable-body error.
    answer(429, null, { json: false });

    expect(await enrolDevice(BODY)).toEqual({ kind: "rate_limited" });
  });

  it("an unrecognised 429 outcome on enrol is reported, not swallowed", async () => {
    // The gap a mutation found. With the body parsed first, ENROL_FAILURES
    // catches the four listed reasons regardless of what the 429 condition
    // says -- so nothing was pinning the condition itself. This is the case
    // that needs it: a status the client has never heard of, on a 429.
    // Reporting it as "rate limited" would invite the same forever-retry the
    // quota bug caused, for an outcome nobody has even named yet.
    answer(429, { status: "SomethingNobodyMapped", reason: "SomethingNobodyMapped", result: null });

    const out = await enrolDevice(BODY);
    expect(out.kind).toBe("transport_failure");
    if (out.kind !== "transport_failure") throw new Error("unreachable");
    expect(out.detail).toContain("SomethingNobodyMapped");
  });

  it("refresh keeps the same order, though nothing maps to 429 there yet", async () => {
    answer(429, { detail: "Too many requests" });
    expect(await refreshDevice("d")).toEqual({ kind: "rate_limited" });

    // The shape a future refresh outcome mapped to 429 would arrive in. It is
    // not in REFRESH_FAILURES, so it must NOT be reported as a failure -- but
    // it must reach the unrecognised-outcome path rather than be swallowed.
    //
    // This one drove the design. Matching only the reasons already listed
    // would have fixed PendingQuotaExceeded and left the NEXT 429 outcome
    // silently collapsed into "rate limited" -- the same defect, one step
    // out. So the discriminator is whether the body carries an application
    // status at all, which the rate limiter's never does.
    answer(429, { status: "SomethingNew", reason: "SomethingNew", result: null });
    const out = await refreshDevice("d");
    expect(out.kind).toBe("transport_failure");
  });
});
