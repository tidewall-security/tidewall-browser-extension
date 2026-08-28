/**
 * The extension enrolling against a real server, in a real browser.
 *
 * This is the seam nothing else covers. The unit tests stub fetch. The fixture
 * replay proves the client parses what the server sends. The node integration
 * test proves lib/api.ts can reach it. NONE of them runs the extension: the
 * popup, the MV3 service worker, chrome.storage and the message passing between
 * them are exercised here and nowhere else.
 *
 * Skipped unless TIDEWALL_INTEGRATION=1 and a server is listening on :8099.
 * See tests/integration/README.md for how to start one.
 */
import { test, expect, chromium, type BrowserContext, type Worker } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENABLED = process.env.TIDEWALL_INTEGRATION === "1";
const BASE = process.env.TIDEWALL_SERVER ?? "http://localhost:8099";
const ADMIN = process.env.TIDEWALL_ADMIN_KEY ?? "ak_demo_bootstrap_key_000000000001";

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(here, "../../.output/chrome-mv3");

let context: BrowserContext;
let serviceWorker: Worker;
let extensionId: string;

test.skip(!ENABLED, "set TIDEWALL_INTEGRATION=1 and run a server on :8099");

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  serviceWorker =
    context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  extensionId = serviceWorker.url().split("/")[2];
});

test.afterAll(async () => {
  await context?.close();
});

test("the extension enrols against a real server and displays its code", async () => {
  const rt = readFileSync("/tmp/int-rt.txt", "utf8").trim();
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);

  // The real form, filled and submitted. Everything after this is the
  // extension's own code: popup -> message -> service worker -> fetch.
  await popup.fill("#input-server", BASE);
  await popup.fill("#input-token", rt);
  await popup.fill("#input-name", "Integration");
  await popup.fill("#input-email", "integration@example.com");
  await popup.fill("#input-device", "Playwright");
  await popup.click("#register-form button[type=submit]");

  // The service worker wrote a credential tuple, so a real request succeeded.
  const stored = await expect
    .poll(
      async () =>
        serviceWorker.evaluate(async () => {
          const v = await chrome.storage.local.get(["credentials", "deviceState", "confirmationCode"]);
          return v as Record<string, any>;
        }),
      { timeout: 15_000 }
    )
    .toMatchObject({ deviceState: "pending" })
    .then(() =>
      serviceWorker.evaluate(async () =>
        chrome.storage.local.get(["credentials", "confirmationCode"])
      )
    );

  expect(stored.credentials.deviceId).toBeTruthy();
  expect(stored.credentials.accessToken).toMatch(/^at_/);
  expect(stored.credentials.refreshToken).toMatch(/^dr_/);
  expect(stored.confirmationCode).toMatch(/^[A-Z2-9]{8}$/);

  // And the pending screen shows the code, which is the point of pending.
  await popup.reload();
  await expect(popup.locator("#pending-info")).toContainText(stored.confirmationCode);
});
