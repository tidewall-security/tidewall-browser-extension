/**
 * What a refused request looks like, for BOTH transports.
 *
 * These lived apart and diverged. `fetch` returned a synthetic 403; XHR fired a
 * bare `error` event with no status at all — so the same refusal presented as
 * an HTTP response on one path and a network failure on the other, and a site
 * handling one correctly could still break on the other.
 */
export const BLOCKED_STATUS = 403;
export const BLOCKED_BODY = "Blocked by Tidewall";

/**
 * End a blocked XHR the way a refused request ends.
 *
 * The previous version dispatched a bare `error` and returned, under a comment
 * saying it aborted. Nothing aborted: `send()` never ran and `abort()` was
 * never called, so `readyState` stayed at OPENED, `status` stayed 0, and
 * `loadend` never fired.
 *
 * A bare `error` satisfies code that only listens on `onerror`. It does not
 * satisfy anything awaiting COMPLETION — which is what most XHR wrappers do,
 * settling on `loadend` or on `readystatechange` reaching DONE. Neither
 * arrived, so the promise never settled and whatever it gated stayed pending
 * until the page was reloaded.
 *
 * `abort()` is not the fix: per spec, aborting a request whose send flag is
 * unset transitions to UNSENT and fires nothing, leaving a waiting wrapper
 * exactly as stuck.
 *
 * So the request is presented as what it is — a completed HTTP 403 — which is
 * what the fetch path already returns. `readyState` and its siblings are
 * read-only accessors on the prototype, and an own property on the instance
 * shadows them.
 *
 * `load` rather than `error`, deliberately: a 403 is a completed transaction,
 * not a network failure. Firing `error` for one is how the two transports came
 * to disagree about the same refusal.
 */
export function terminateBlockedXhr(
  xhr: XMLHttpRequest & { _tidewallUrl?: string },
): void {
  const shadow = (name: string, value: unknown) => {
    try {
      Object.defineProperty(xhr, name, { value, configurable: true, writable: false });
    } catch {
      // A site may have sealed the object. The events below still fire, and an
      // event is better than the silence this replaced.
    }
  };

  shadow("readyState", 4);
  shadow("status", BLOCKED_STATUS);
  shadow("statusText", "Forbidden");
  shadow("responseText", BLOCKED_BODY);
  shadow("response", BLOCKED_BODY);
  shadow("responseURL", xhr._tidewallUrl ?? "");

  // The DOM's order: state change, then the outcome, then the one that fires
  // for every outcome. `loadend` last is the part that was missing.
  xhr.dispatchEvent(new Event("readystatechange"));
  xhr.dispatchEvent(new ProgressEvent("load"));
  xhr.dispatchEvent(new ProgressEvent("loadend"));
}
