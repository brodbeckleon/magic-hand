import { test as base, expect } from "@playwright/test";

/**
 * MHR08 checks for every test:
 *  - `externalRequests` records every request that left the app (must be none),
 *  - after each test, the in-app network guard must not have blocked anything either.
 */
export const test = base.extend<{ externalRequests: string[]; privacyGuard: void }>({
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
});

export { expect };
