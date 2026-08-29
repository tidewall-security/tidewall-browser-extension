/**
 * `chrome` inside `evaluate()` callbacks.
 *
 * These tests drive a real MV3 service worker through Playwright. The bodies of
 * `serviceWorker.evaluate(...)` are serialised and run INSIDE the extension,
 * where `chrome` is a global — so TypeScript is right that it does not exist in
 * the test file's own scope, and wrong to conclude the code is broken.
 *
 * Declared here rather than by installing `@types/chrome`, because the
 * extension itself never uses `chrome`: it goes through wxt's `browser`
 * polyfill, and pulling the full Chrome typings in for three storage calls in
 * two test files invites a conflict with those for no benefit.
 *
 * Only what the tests actually touch is declared. If a test reaches for
 * something else, it should fail here first and be added deliberately.
 */
declare const chrome: {
  storage: {
    local: {
      get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
    };
  };
};
