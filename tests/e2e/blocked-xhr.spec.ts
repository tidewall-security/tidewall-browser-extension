import { test, expect, chromium, type BrowserContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * A blocked XHR must END, in a real browser.
 *
 * This is the first test of anything in the page-world capture layer, and it
 * has to be an e2e one: the defect is about `XMLHttpRequest` lifecycle
 * semantics — which events fire, in what order, and what `readyState` reads —
 * and a hand-rolled double would just re-state whatever the author believed.
 * jsdom reimplements XHR and would prove the reimplementation.
 *
 * The bug: the block path dispatched a bare `error` and returned, under a
 * comment claiming it aborted. `send()` never ran, so `loadend` never fired,
 * and any wrapper awaiting completion hung until the page was reloaded.
 */

let context: BrowserContext;

/** The shipped function, evaluated in the page. */
const SOURCE = readFileSync(resolve("lib/blocked-request.ts"), "utf8")
  .replace(/export /g, "")
  .replace(/:\s*XMLHttpRequest\s*&\s*\{[^}]*\}/g, "")
  .replace(/:\s*(void|string|unknown|number)\b/g, "")
  .replace(/^import[^\n]*\n/gm, "");

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext("", { channel: "chromium", headless: true });
});
test.afterAll(async () => context?.close());

async function blockedXhr(evaluate: string) {
  const page = await context.newPage();
  // A real origin, so a relative URL resolves. Nothing is ever requested --
  // `send()` is never called on the blocked XHR, which is the point -- but
  // `open()` still parses the URL against the document.
  await page.route("**/fixture", (r) =>
    r.fulfill({ contentType: "text/html", body: "<title>fixture</title>" }));
  await page.goto("https://tidewall.test/fixture");
  const out = await page.evaluate(`(async () => { ${SOURCE}\n${evaluate} })()`);
  await page.close();
  return out;
}

test("a wrapper awaiting loadend settles, which is the whole bug", async () => {
  const settled = await blockedXhr(`
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/never-sent");
    const done = new Promise((resolve) => {
      xhr.addEventListener("loadend", () => resolve("loadend"));
    });
    const timeout = new Promise((r) => setTimeout(() => r("HUNG"), 1500));
    terminateBlockedXhr(xhr);
    return Promise.race([done, timeout]);
  `);

  expect(settled).toBe("loadend");
});

test("the request reads as a completed 403, not as an open one", async () => {
  const state = await blockedXhr(`
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/never-sent");
    terminateBlockedXhr(xhr);
    return {
      readyState: xhr.readyState,
      status: xhr.status,
      statusText: xhr.statusText,
      body: xhr.responseText,
    };
  `);

  // readyState 1 and status 0 are what the old path left behind.
  expect(state).toEqual({
    readyState: 4,
    status: 403,
    statusText: "Forbidden",
    body: "Blocked by Tidewall",
  });
});

test("the events fire in the DOM's order", async () => {
  const order = await blockedXhr(`
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/never-sent");
    const seen = [];
    for (const name of ["readystatechange", "load", "loadend", "error", "abort"]) {
      xhr.addEventListener(name, () => seen.push(name));
    }
    terminateBlockedXhr(xhr);
    return seen;
  `);

  // No `error`: a 403 is a completed transaction, not a network failure, and
  // that is what the fetch path already returns for the same refusal.
  expect(order).toEqual(["readystatechange", "load", "loadend"]);
});

test("a wrapper that settles on readystatechange reaching DONE also settles", async () => {
  // The other common shape. It observed readyState 1 forever.
  const settled = await blockedXhr(`
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/never-sent");
    const done = new Promise((resolve) => {
      xhr.onreadystatechange = () => { if (xhr.readyState === 4) resolve(xhr.status); };
    });
    const timeout = new Promise((r) => setTimeout(() => r("HUNG"), 1500));
    terminateBlockedXhr(xhr);
    return Promise.race([done, timeout]);
  `);

  expect(settled).toBe(403);
});

test("the old behaviour hangs, so the test above can fail", async () => {
  // The guard on the guard. Without this, all four tests above would pass
  // against a `terminateBlockedXhr` that did the right thing for the wrong
  // reason -- or against a browser that fires `loadend` on its own.
  const settled = await blockedXhr(`
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/never-sent");
    const done = new Promise((resolve) => {
      xhr.addEventListener("loadend", () => resolve("loadend"));
    });
    const timeout = new Promise((r) => setTimeout(() => r("HUNG"), 1000));
    xhr.dispatchEvent(new Event("error"));   // what the code used to do
    return Promise.race([done, timeout]);
  `);

  expect(settled).toBe("HUNG");
});
