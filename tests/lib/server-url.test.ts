/**
 * What the extension will and will not send a credential to.
 *
 * The cases that matter are the near-misses. A check that accepts `localhost`
 * and rejects `example.com` is easy; the ones that decide whether this is worth
 * having are the strings built to look like loopback and not be it.
 */
import { describe, it, expect } from "vitest";
import { checkServerUrl } from "../../lib/server-url";

const ON = true;
const OFF = false;

describe("https is always fine", () => {
  it.each([
    "https://guard.example.com",
    "https://guard.example.com:8443/base",
    "https://localhost:8080",
  ])("%s", (url) => {
    expect(checkServerUrl(url, OFF)).toEqual({ ok: true, insecure: false });
  });
});

describe("plaintext loopback needs the opt-in", () => {
  it.each(["http://localhost:8080", "http://127.0.0.1:8080", "http://[::1]:8080"])(
    "%s is refused without it",
    (url) => {
      const v = checkServerUrl(url, OFF);
      expect(v.ok).toBe(false);
    },
  );

  it.each(["http://localhost:8080", "http://127.0.0.1:8080", "http://[::1]:8080"])(
    "%s is allowed with it, and reported insecure",
    (url) => {
      expect(checkServerUrl(url, ON)).toEqual({ ok: true, insecure: true });
    },
  );
});

describe("the near-misses, which are the point", () => {
  it.each([
    // A name that merely CONTAINS or ends with a loopback-looking label.
    ["http://localhost.attacker.example", "a name that starts with localhost"],
    ["http://notlocalhost", "a name that contains it"],
    ["http://127.0.0.1.attacker.example", "a name that starts with the address"],
    // Subdomains of localhost resolve to loopback in some resolvers. Not
    // accepted: the decision is on the literal text, and this is not it.
    ["http://foo.localhost", "a subdomain of localhost"],
    // Outside 127.0.0.0/8 despite looking numeric and close.
    ["http://128.0.0.1", "the adjacent /8"],
    ["http://10.0.0.1", "a private address that is not loopback"],
    // Octet that is not an octet.
    ["http://127.0.0.999", "a fourth field over 255"],
  ])("refuses %s (%s) even with the opt-in on", (url) => {
    expect(checkServerUrl(url, ON).ok).toBe(false);
  });
});

describe("the forms URL normalisation resolves for us", () => {
  // These all ARE loopback, and a check written against the typed text rather
  // than the parsed hostname would not recognise them. `http://127.0.0` was in
  // the refusal list above until this was checked: the parser turns it into
  // 127.0.0.0, which is loopback, and the test was wrong rather than the code.
  it.each([
    ["http://127.1", "127.0.0.1"],
    ["http://2130706433", "127.0.0.1 in decimal"],
    ["http://0x7f.1", "127.0.0.1 in hex"],
    ["http://127.0.0", "127.0.0.0"],
    ["http://LOCALHOST", "case"],
    ["http://localhost.", "the root label"],
    ["http://[0:0:0:0:0:0:0:1]", "uncompressed IPv6"],
  ])("%s is loopback (%s) and allowed with the opt-in", (url) => {
    expect(checkServerUrl(url, ON)).toEqual({ ok: true, insecure: true });
  });

  it.each(["http://127.1", "http://2130706433", "http://localhost."])(
    "%s is still refused without the opt-in",
    (url) => {
      expect(checkServerUrl(url, OFF).ok).toBe(false);
    },
  );
});

describe("things that are not a server address", () => {
  it("refuses credentials embedded in the URL", () => {
    // Reads as guard.example.com to a human; goes to attacker.example.
    const v = checkServerUrl("https://guard.example.com@attacker.example", OFF);
    expect(v.ok).toBe(false);
  });

  it.each(["file:///etc/passwd", "javascript:alert(1)", "chrome-extension://abc/x", "not a url", ""])(
    "refuses %s",
    (url) => {
      expect(checkServerUrl(url, ON).ok).toBe(false);
    },
  );
});

describe("the reason is shown to a person", () => {
  it("says what to do, not what failed", () => {
    const v = checkServerUrl("http://guard.example.com", OFF);
    if (v.ok) throw new Error("unreachable");
    expect(v.reason).toContain("https");
  });

  it("names the opt-in when that is the only thing missing", () => {
    const v = checkServerUrl("http://localhost:8080", OFF);
    if (v.ok) throw new Error("unreachable");
    expect(v.reason).toContain("insecure local server");
  });
});
