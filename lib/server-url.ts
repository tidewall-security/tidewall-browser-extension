/**
 * Is this server URL safe to send a credential to?
 *
 * The Python agent refuses a plaintext guard URL before opening a connection,
 * because the bearer token and the prompt travel in that request. This client
 * sends the same two things to the same server and, until now, checked nothing:
 * the popup's text box went straight to storage.
 *
 * WHY LOOPBACK IS NOT SIMPLY EXEMPT. The obvious argument -- loopback traffic
 * never leaves the machine, so there is nothing to intercept -- addresses only
 * confidentiality. TLS also authenticates the endpoint. A malicious local
 * process that binds the port first receives the `rt_` registration token, then
 * the 30-day `dr_` refresh token, then every prompt, and loopback offers nothing
 * against that. "Machine" is not a stable boundary either: containers, WSL and
 * port-forwards all make `localhost` mean something other than what the person
 * typing it believes.
 *
 * So plaintext loopback is an OPT-IN, not an exemption. A person ticking a
 * labelled box has made an informed decision; a person clicking through a
 * browser certificate warning has been taught a habit worth not teaching.
 */

/**
 * Literal hosts only. Never resolve a name to decide this.
 *
 * Resolving opens a rebinding window between the check and the connection --
 * the name answers 127.0.0.1 when validated and something else when fetched --
 * and browser JavaScript cannot observe which address `fetch` finally used. So
 * the decision is made on the text, where it is stable.
 *
 * `localhost.attacker.example` and anything matching `startsWith("127.")` as a
 * string rather than as an address must both fail.
 */
function isLiteralLoopback(raw: string): boolean {
  // A single trailing dot is the root label: `localhost.` is the fully
  // qualified spelling of `localhost` and resolves identically. Stripped so it
  // is accepted deliberately rather than rejected by accident.
  const hostname = raw.endsWith(".") ? raw.slice(0, -1) : raw;

  // `URL` has already done more than it looks. It lowercases (`LOCALHOST`),
  // brackets and compresses IPv6 (`[0:0:0:0:0:0:0:1]` -> `[::1]`), and
  // normalises every IPv4 shorthand to four octets:
  //
  //     127.1        -> 127.0.0.1
  //     2130706433   -> 127.0.0.1     (decimal)
  //     0x7f.1       -> 127.0.0.1     (hex)
  //
  // Those are the forms a hand-rolled string check gets wrong -- in the unsafe
  // direction if it is deciding what to REFUSE, and in this direction it would
  // simply fail to recognise a genuine loopback address. Comparing the parsed
  // hostname rather than the typed text is what makes the octet test below
  // sufficient.
  if (hostname === "localhost") return true;
  if (hostname === "[::1]") return true;

  // 127.0.0.0/8, as four decimal octets and nothing else. Not a prefix test:
  // "127.0.0.1.attacker.example" starts with "127." and is a name.
  const octets = hostname.split(".");
  if (octets.length !== 4) return false;
  if (!octets.every((o) => /^\d{1,3}$/.test(o) && Number(o) <= 255)) return false;
  return octets[0] === "127";
}

export type ServerUrlVerdict =
  | { ok: true; insecure: boolean }
  | { ok: false; reason: string };

/**
 * @param raw - the URL as typed
 * @param allowInsecureLoopback - the opt-in, off unless the person turned it on
 */
export function checkServerUrl(raw: string, allowInsecureLoopback: boolean): ServerUrlVerdict {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "That is not a URL." };
  }

  // Credentials in the URL are never sent anywhere useful and hide the real
  // host from a reader: `https://guard.example.com@attacker.example` is a
  // request to attacker.example.
  if (url.username || url.password) {
    return { ok: false, reason: "Remove the username or password from the URL." };
  }

  if (url.protocol === "https:") return { ok: true, insecure: false };

  if (url.protocol !== "http:") {
    return { ok: false, reason: `Use https. ${url.protocol} is not a server address.` };
  }

  if (!isLiteralLoopback(url.hostname)) {
    return {
      ok: false,
      reason:
        "Use https. Over plain http the server is not authenticated, and this " +
        "device's credential and your prompts would be readable in transit.",
    };
  }

  if (!allowInsecureLoopback) {
    return {
      ok: false,
      reason:
        "This is a local address over plain http, which does not authenticate " +
        "the server. Tick “allow an insecure local server” if you are " +
        "running Tidewall on this machine for development.",
    };
  }

  return { ok: true, insecure: true };
}
