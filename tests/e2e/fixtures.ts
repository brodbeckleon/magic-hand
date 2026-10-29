import { test as base, expect } from "@playwright/test";

/** Records every request that does not go to the app itself (MHR08: there must be none). */
export const test = base.extend<{ externalRequests: string[] }>({
  externalRequests: async ({ page, baseURL }, use) => {
    const external: string[] = [];
    page.on("request", (r) => {
      const url = r.url();
      if (!url.startsWith(baseURL!) && !url.startsWith("data:") && !url.startsWith("blob:")) external.push(url);
    });
    await use(external);
  },
});

export { expect };
