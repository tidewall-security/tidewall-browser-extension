/**
 * The client's reason unions against the server's own schema.
 *
 * `ENROL_FAILURES` and `REFRESH_FAILURES` are hand-written lists of what the
 * server can answer. Every other test compares the client against responses
 * the client's author imagined, or against fixtures captured on one day; none
 * asks whether the lists are still the server's.
 *
 * This is the check that catches a taxonomy drifting apart. It found one
 * already, from the other side: the server's refresh table carried an
 * `InactiveDevice` entry that no service produced and this client had never
 * heard of. A dead entry on either side is a claim that an outcome exists.
 *
 * BOTH DIRECTIONS, because they fail differently. A reason the server has and
 * the client lacks arrives as `transport_failure` and the user sees a
 * confusing message. A reason the client has and the server cannot send is
 * dead code that reads as coverage -- which is how `PendingQuotaExceeded` sat
 * in the list, unreachable, until it was actually exercised.
 *
 * The schema is read from a FILE, not fetched: the server sets
 * `openapi_url=None` on purpose, so unconditional auth does not leave the
 * stock docs page broken. The contract job exports the document in-process.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";

// `lib/api` imports `lib/storage`, which reaches for `chrome.runtime` on
// import. Unmocked it throws asynchronously, and vitest reports those as
// unhandled errors alongside a passing run -- "this might cause false positive
// tests" is not a warning to leave standing in a file whose entire job is to
// be trustworthy. Nothing here calls the HTTP functions; only the two
// exported reason lists are read.
vi.mock("../../lib/storage", () => ({
  serverUrl: { getValue: async () => "http://unused" },
  rtToken: { getValue: async () => "" },
  credentials: { getValue: async () => ({}) },
}));

const SCHEMA_PATH = process.env.TIDEWALL_OPENAPI;
const run = SCHEMA_PATH ? describe : describe.skip;

run("the client's reasons are the server's reasons", () => {
  const schema = JSON.parse(readFileSync(SCHEMA_PATH!, "utf8"));
  const components = schema.components.schemas;

  function reasonsOf(model: string): string[] {
    const reason = components[model].properties.reason;
    const target = reason.$ref ? components[reason.$ref.split("/").pop()!] : reason;
    const values = target.enum;
    // Without this the whole file passes vacuously if the model ever loses its
    // enum -- exactly the mutation ("make reason a free-form string") that the
    // server-side tests exist to catch.
    expect(Array.isArray(values) && values.length > 0).toBe(true);
    return values;
  }

  it("enrolment: neither side names a reason the other does not", async () => {
    const { ENROL_FAILURES } = await import("../../lib/api");
    expect([...ENROL_FAILURES].sort()).toEqual(reasonsOf("EnrolFailure").sort());
  });

  it("refresh: neither side names a reason the other does not", async () => {
    const { REFRESH_FAILURES } = await import("../../lib/api");
    expect([...REFRESH_FAILURES].sort()).toEqual(reasonsOf("RefreshFailure").sort());
  });

  it("every failure status code the schema declares is one the client can meet", () => {
    // Not a union check: a code the client has never seen falls through to
    // `transport_failure` with a message naming an HTTP status, which is the
    // least actionable thing this client can tell a user.
    const enrol = Object.keys(schema.paths["/v1/devices/enrol"].post.responses);
    const refresh = Object.keys(schema.paths["/v1/devices/{device_id}/refresh"].post.responses);

    // 422 is FastAPI's own validation response and is not part of the
    // taxonomy; the client treats it as an unrecognised outcome by design.
    expect(enrol.filter((c) => c !== "422").sort()).toEqual(["201", "403", "409", "429"]);
    expect(refresh.filter((c) => c !== "422").sort()).toEqual(["200", "202", "401", "403"]);
  });
});
