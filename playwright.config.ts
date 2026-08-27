import { defineConfig } from "@playwright/test";

/**
 * Browser tests for the extension.
 *
 * These load the real built extension into Chromium. Unit tests cannot see
 * the things that break here: a service worker that fails to start, a capture
 * script that never injects, a page-world script that throws before it patches
 * anything. All of those pass every vitest assertion in this repo.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  workers: 1,           // one persistent browser context, shared
  reporter: "line",
  use: { trace: "retain-on-failure" },
});
