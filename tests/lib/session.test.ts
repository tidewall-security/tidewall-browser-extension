/**
 * The session guards that no test covered.
 *
 * Each of these was deletable with all 301 tests still green: the single-flight
 * promise, the session generation, and the terminal handling of device_revoked.
 * The last is the client half of the bypass the server's refresh precedence
 * exists to close — a client that re-enrols after being told to stop undoes its
 * own revocation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock is hoisted above every top-level binding, so the shared store has to
// be created with vi.hoisted or the factory cannot see it.
const h = vi.hoisted(() => {
  const state: Record<string, unknown> = {};
  const item = (key: string, initial: unknown) => {
    state[key] = initial;
    return {
      getValue: async () => state[key],
      setValue: async (v: unknown) => {
        state[key] = v;
      },
    };
  };
  return { state, item };
});

const state = h.state;

const CREDS = {
  installationId: "11111111-1111-4111-8111-111111111111",
  deviceId: "dev-1",
  accessToken: "at_old",
  accessTokenExpiry: 0,
  refreshToken: "dr_1",
};

vi.mock("../../lib/storage", () => ({
  credentials: h.item("credentials", null),
  deviceState: h.item("deviceState", "active"),
  sessionGeneration: h.item("sessionGeneration", 0),
  siteModes: h.item("siteModes", {}),
  setCredentials: vi.fn(async (v: unknown) => {
    h.state.credentials = v;
  }),
}));

vi.mock("../../lib/api", () => ({ refreshDevice: vi.fn() }));

import * as api from "../../lib/api";
import * as store from "../../lib/storage";
import { refreshToken, resetInFlight, shouldGuard } from "../../lib/session";

function effects() {
  return {
    setBadge: vi.fn(),
    clearAlarm: vi.fn(),
    createAlarm: vi.fn(),
  };
}

beforeEach(() => {
  resetInFlight();
  vi.clearAllMocks();
  state.credentials = { ...CREDS };
  state.deviceState = "active";
  state.sessionGeneration = 0;
});

describe("single-flight refresh", () => {
  it("makes ONE request for ten concurrent callers", async () => {
    let release!: (v: unknown) => void;
    const held = new Promise((r) => (release = r));
    (api.refreshDevice as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      await held;
      return { kind: "success", accessToken: "at_new", accessTokenExpiry: Date.now() + 3_600_000 };
    });

    const fx = effects();
    const calls = Array.from({ length: 10 }, () => refreshToken(fx));
    release(null);
    await Promise.all(calls);

    expect(api.refreshDevice).toHaveBeenCalledTimes(1);
    expect(state.deviceState).toBe("active");
  });

  it("does not wedge after a failure", async () => {
    (api.refreshDevice as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("boom"));
    const fx = effects();

    await expect(refreshToken(fx)).rejects.toThrow("boom");

    // Without the finally clause the rejected promise stays cached and every
    // later refresh returns it, for the life of the worker.
    (api.refreshDevice as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      kind: "success",
      accessToken: "at_new",
      accessTokenExpiry: Date.now() + 3_600_000,
    });
    await refreshToken(fx);

    expect(api.refreshDevice).toHaveBeenCalledTimes(2);
  });
});

describe("the session generation", () => {
  it("discards a refresh that finished after a disconnect", async () => {
    let release!: (v: unknown) => void;
    const held = new Promise((r) => (release = r));
    // Signals that the refresh has read the generation and is now in flight.
    // Without waiting for this the disconnect lands BEFORE the generation is
    // captured, the refresh reads the already-bumped value, and the test proves
    // nothing at all -- which is exactly what the first version of it did.
    let entered!: () => void;
    const inFlight = new Promise<void>((r) => (entered = r));
    (api.refreshDevice as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      entered();
      await held;
      return { kind: "success", accessToken: "at_new", accessTokenExpiry: Date.now() + 3_600_000 };
    });

    const fx = effects();
    const pending = refreshToken(fx);
    await inFlight;

    // Disconnect, exactly as the background handler does it: bump first.
    await store.sessionGeneration.setValue(1);
    state.credentials = null;
    await store.deviceState.setValue("unregistered");

    release(null);
    await pending;

    expect(state.credentials).toBeNull();
    expect(state.deviceState).toBe("unregistered");
    expect(store.setCredentials).not.toHaveBeenCalled();
  });
});

describe("device_revoked is terminal", () => {
  it("stops permanently and does not re-enrol", async () => {
    (api.refreshDevice as ReturnType<typeof vi.fn>).mockResolvedValue({
      kind: "failure",
      reason: "device_revoked",
    });
    const fx = effects();

    await refreshToken(fx);

    expect(state.deviceState).toBe("disabled");
    expect(fx.clearAlarm).toHaveBeenCalled();
    // "unregistered" is the re-enrol path. Landing there after a revocation is
    // how a compliant client undoes its own revocation.
    expect(state.deviceState).not.toBe("unregistered");
  });

  it.each([
    ["device_pending", "pending"],
    ["credential_expired", "unregistered"],
    ["credential_unknown", "unregistered"],
  ])("maps %s to %s", async (reason, expected) => {
    (api.refreshDevice as ReturnType<typeof vi.fn>).mockResolvedValue({ kind: "failure", reason });
    await refreshToken(effects());
    expect(state.deviceState).toBe(expected);
  });

  it.each(["rate_limited", "transport_failure"])(
    "leaves the state alone on %s",
    async (kind) => {
      (api.refreshDevice as ReturnType<typeof vi.fn>).mockResolvedValue({ kind, detail: "x" });
      await refreshToken(effects());
      // A burst or an unreachable server is not a revoked device, and demoting
      // it here would make one look like the other.
      expect(state.deviceState).toBe("active");
    }
  );
});

describe("shouldGuard", () => {
  it("guards only an active device", () => {
    expect(shouldGuard("active")).toBe(true);
  });

  it.each(["pending", "disabled", "unregistered", null, undefined] as const)(
    "does not guard when the state is %s",
    (state) => {
      // Each of these holds no usable credential, so guarding would fail on
      // every call. The inline version of this compared against two strings
      // that no longer exist, which would have made the condition always true
      // and stopped the extension guarding anything at all.
      expect(shouldGuard(state)).toBe(false);
    }
  );
});
