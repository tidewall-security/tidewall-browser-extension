import { test, expect, chromium, type BrowserContext, type Worker } from "@playwright/test";
import { resolve } from "node:path";

/**
 * The extension, in a real browser.
 *
 * Everything else in this repo tests handlers in isolation. None of it can
 * see a service worker that fails to start, a capture script that never
 * injects, or a page-world script that throws before patching anything —
 * and inspection now happens in the page world, so "did it arrive and did it
 * know where it was" is the difference between a guard and a placebo.
 */

let context: BrowserContext;
let serviceWorker: Worker;
let extensionId: string;
const backgroundErrors: string[] = [];

const FIXTURE_HTML =
  "<!doctype html><html><head><title>fixture</title></head><body>ok</body></html>";

test.beforeAll(async () => {
  const extensionPath = resolve(".output/chrome-mv3");
  context = await chromium.launchPersistentContext("", {
    // MV3 service workers need the Chromium channel: the bundled
    // Chrome-for-Testing build never registers one, so `waitForEvent` hangs.
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });
  serviceWorker =
    context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  extensionId = new URL(serviceWorker.url()).host;
  serviceWorker.on("console", (m) => {
    if (m.type() === "error") backgroundErrors.push(m.text());
  });
});

test.afterAll(async () => {
  await context?.close();
});

/** Is `window.fetch` still the native one? Asked without a test-only global. */
const fetchIsPatched = (page: import("@playwright/test").Page) =>
  page.evaluate(() => !window.fetch.toString().includes("native code"));

async function setDeviceStatus(status: string | null) {
  // WXT's `local:` prefix selects the storage AREA; the stored key is what
  // follows it.
  await serviceWorker.evaluate(async (value) => {
    if (value === null) await chrome.storage.local.remove("deviceStatus");
    else await chrome.storage.local.set({ deviceStatus: value });
  }, status);
}

test("the MV3 service worker starts without crashing", async () => {
  expect(serviceWorker.url()).toBe(`chrome-extension://${extensionId}/background.js`);
  expect(backgroundErrors).toEqual([]);
});

test("the popup renders without a page error", async () => {
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.getByText("Tidewall").first()).toBeVisible();

  expect(errors).toEqual([]);
  await page.close();
});

test("the capture script is NOT injected when the device is not connected", async () => {
  // The fail-safe direction: no guard configured means no interception, not
  // interception that silently passes everything.
  await setDeviceStatus(null);
  const page = await context.newPage();
  await page.route("https://chatgpt.com/**", (r) =>
    r.fulfill({ status: 200, contentType: "text/html", body: FIXTURE_HTML }));

  await page.goto("https://chatgpt.com/fixture");
  await page.waitForTimeout(500);

  expect(await fetchIsPatched(page)).toBe(false);
  await page.close();
});

test("the capture script injects into the page world and patches fetch", async () => {
  await setDeviceStatus("connected");
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://chatgpt.com/**", (r) =>
    r.fulfill({ status: 200, contentType: "text/html", body: FIXTURE_HTML }));

  await page.goto("https://chatgpt.com/fixture");

  await expect.poll(() => fetchIsPatched(page), { timeout: 10_000 }).toBe(true);
  expect(errors).toEqual([]);
  await page.close();
});

test("the page world is told which site and mode it is guarding", async () => {
  // Inspection happens in the page world now, so it builds its own handler
  // from this. Without it the script loads and guards nothing — which would
  // look exactly like a working extension.
  await setDeviceStatus("connected");
  const page = await context.newPage();
  await page.route("https://chatgpt.com/**", (r) =>
    r.fulfill({ status: 200, contentType: "text/html", body: FIXTURE_HTML }));

  await page.goto("https://chatgpt.com/fixture");
  await expect.poll(() => fetchIsPatched(page), { timeout: 10_000 }).toBe(true);

  const config = await page.evaluate(() => {
    const el = document.querySelector<HTMLScriptElement>("script[data-tidewall]");
    return el ? JSON.parse(el.dataset.tidewall!) : null;
  });

  expect(config).not.toBeNull();
  expect(config.alias).toBe("chatgpt");
  expect(typeof config.channel).toBe("string");
  expect(config.channel.length).toBeGreaterThan(10);
  await page.close();
});
