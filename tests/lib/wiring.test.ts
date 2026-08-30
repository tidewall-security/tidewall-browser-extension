/**
 * That the checks are CALLED, not merely written.
 *
 * `checkServerUrl` has thorough tests of its own, and they would all pass while
 * nothing invoked it — which is exactly the defect this project keeps finding:
 * a reaper that was never scheduled, a route that never passed its configured
 * quota, a listed failure reason that could never arrive.
 *
 * These read the source. That is weaker than exercising the behaviour, and the
 * weakness is specific: they prove a call is present, not that its result is
 * honoured. They are here because the alternative — importing a service worker
 * entry point that registers listeners on import — tests the harness more than
 * the code. Where the behaviour CAN be exercised it is, in server-url.test.ts
 * and api-429.test.ts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8");

describe("the server URL check is enforced where the credential lives", () => {
  const background = read("entrypoints/background.ts");

  it("the background worker calls it", () => {
    // Not the popup: a message handler must not trust its sender's checks, and
    // the worker is what holds the token and makes the request.
    expect(background).toContain("checkServerUrl(data.serverUrl, data.allowInsecureLoopback)");
  });

  it("and refuses on a bad verdict rather than logging and continuing", () => {
    const at = background.indexOf("checkServerUrl(data.serverUrl");
    expect(at).toBeGreaterThan(-1);
    const after = background.slice(at, at + 400);
    expect(after).toContain("if (!verdict.ok)");
    expect(after).toContain("return { success: false");
  });

  it("refuses BEFORE the URL or the token is written to storage", () => {
    // Storing first and refusing afterwards would leave the registration token
    // on disk for a server we just declined to talk to.
    const check = background.indexOf("checkServerUrl(data.serverUrl");
    const store = background.indexOf("store.serverUrl.setValue(data.serverUrl)");
    const token = background.indexOf("store.rtToken.setValue(data.rtToken)");
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(store);
    expect(check).toBeLessThan(token);
  });

  it("the popup calls it too, so a person sees the reason", () => {
    expect(read("entrypoints/popup/main.ts")).toContain("checkServerUrl(");
  });

  it("the opt-in is not checked by default in the markup", () => {
    const html = read("entrypoints/popup/index.html");
    const at = html.indexOf('id="input-allow-insecure"');
    expect(at).toBeGreaterThan(-1);
    // `checked` anywhere in that tag would make plaintext the default.
    const tag = html.slice(html.lastIndexOf("<", at), html.indexOf(">", at));
    expect(tag).not.toContain("checked");
  });
});

describe("every authenticated request refuses redirects", () => {
  const api = read("lib/api.ts");

  it("all three call sites set it", () => {
    // A redirect re-sends the Authorization header to the location the server
    // names. The Python agent has refused them since it was written.
    const calls = api.split("await fetch(").length - 1;
    const refusals = api.split('redirect: "error"').length - 1;
    expect(calls).toBeGreaterThanOrEqual(3);
    expect(refusals).toBe(calls);
  });

  it("each one is inside the fetch options, not merely nearby", () => {
    // Anchored on the `await fetch(` sites themselves. Searching for the path
    // strings found the DOCSTRING above enrolDevice first, which mentions the
    // route and is nowhere near the options object -- a test that failed for
    // the right reason and would have passed for the wrong one had the
    // docstring happened to sit closer.
    const sites = [...api.matchAll(/await fetch\(/g)].map((m) => m.index!);
    expect(sites.length).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < sites.length; i++) {
      // Bounded by the NEXT call site rather than by a character count. A
      // fixed window failed here for a boring reason -- the first call carries
      // the shared rationale comment and pushed the option past it -- and the
      // fix for that must not be "make the window bigger until it passes",
      // which would eventually let a later call's option satisfy an earlier
      // call's assertion.
      const region = api.slice(sites[i], sites[i + 1] ?? api.length);
      expect(region).toContain('redirect: "error"');
    }
  });
});
