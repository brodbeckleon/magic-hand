import { test as base, expect } from "@playwright/test";

/**
 * MHR08 checks for every test:
 *  - `externalRequests` records every request that left the app (must be none),
 *  - after each test, the in-app network guard must not have blocked anything either.
 */
export const test = base.extend<{ externalRequests: string[]; privacyGuard: void; visionErrors: void }>({
  externalRequests: async ({ page, baseURL }, use) => {
    const external: string[] = [];
    page.on("request", (r) => {
      const url = r.url();
      if (!url.startsWith(baseURL!) && !url.startsWith("data:") && !url.startsWith("blob:")) external.push(url);
    });
    await use(external);
  },
  privacyGuard: [
    async ({ page }, use) => {
      await use();
      const blocked = await page
        .evaluate(() => (window as unknown as { __magicHand?: { blocked(): string[] } }).__magicHand?.blocked() ?? [])
        .catch(() => []);
      expect(blocked, "requests blocked by the privacy guard").toEqual([]);
    },
    { auto: true },
  ],
  /** The vision worker must never report errors (e.g. a model that fails to load), unless a test expects them. */
  visionErrors: [
    async ({ page }, use, testInfo) => {
      // Playwright's WebKit has no WebGL in workers (like Safari < 17): falling back to the main
      // thread is the expected behaviour there, not an error.
      const fallbackOk = testInfo.project.name === "webkit";
      const errors: string[] = [];
      page.on("console", (m) => {
        const text = m.text();
        if (fallbackOk && /unavailable, using the main thread/.test(text)) return;
        if (/vision worker|frame failed|unavailable, using the main thread/.test(text)) errors.push(text);
      });
      await use();
      if (!testInfo.annotations.some((a) => a.type === "vision-errors-expected")) expect(errors, "vision worker errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
