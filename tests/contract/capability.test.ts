import { describe, it, expect, beforeEach } from "vitest";
import { SITE_REGISTRY } from "../../lib/constants";
import { getHandler } from "../../handlers/index";
import { capabilityOf, REDACTING_SITES } from "../../lib/capabilities";
import { roundTrip } from "./round-trip";
import { FIXTURES } from "./fixtures";

const aliases = [...new Set(Object.values(SITE_REGISTRY).map((e) => e.alias))];

// Several extractors read the DOM for model metadata — AI Studio reads the
// model selector — and in the page world there is always one. Without a stub
// they throw, classify as `notPrompt`, and the round trip reports a fixture
// problem that is really an environment problem.
beforeEach(() => {
  (globalThis as unknown as { document: unknown }).document = {
    querySelector: () => null,
    querySelectorAll: () => [],
  };
});

describe("the registry and the handlers agree", () => {
  it("scanned a real registry, not an empty one", () => {
    // Without this the whole file passes vacuously if the import breaks.
    expect(aliases.length).toBeGreaterThan(20);
  });

  it("every registered site has a handler", () => {
    const missing = aliases.filter((a) => !getHandler(a, "block"));
    expect(missing).toEqual([]);
  });

  it("every site claimed as redacting is actually registered", () => {
    const unknown = [...REDACTING_SITES].filter((a) => !aliases.includes(a));
    expect(unknown).toEqual([]);
  });
});

/**
 * The declaration is proven by RUNNING, never by inspecting the class. The
 * base supplies a no-op write-back, so `typeof handler.promptHttpOutput ===
 * "function"` is true for all 37 sites and proves nothing at all.
 */
describe("capability declarations are true", () => {
  const declared = aliases.filter((a) => capabilityOf(a) === "redact");

  it("every site declared `redact` has a fixture to prove it with", () => {
    const undocumented = declared.filter((a) => !FIXTURES[a]);
    expect(undocumented).toEqual([]);
  });

  it.each(declared.length ? declared : ["(none declared yet)"])(
    "%s survives a redaction round trip", async (alias) => {
      if (alias === "(none declared yet)") return;
      const result = await roundTrip(alias, FIXTURES[alias]);
      expect(result.ok, result.why).toBe(true);
    });

  it.each(Object.keys(FIXTURES))(
    "%s is declared `redact`, since it has a fixture", (alias) => {
      // The other direction: a fixture without a declaration means a site
      // that can redact but is reported as block-only.
      expect(capabilityOf(alias)).toBe("redact");
    });
});

describe("block-only sites really cannot redact", () => {
  it.each(aliases.filter((a) => capabilityOf(a) === "block-only").slice(0, 12))(
    "%s fails the round trip, which is why it blocks", async (alias) => {
      // A site claiming block-only that actually rewrites is under-reported;
      // more importantly a site whose write-back half-works would pass the
      // proof at runtime while being documented as unable to.
      const fixture = FIXTURES[alias];
      if (!fixture) return;                    // no fixture: nothing to assert
      const result = await roundTrip(alias, fixture);
      expect(result.ok).toBe(false);
    });
});
