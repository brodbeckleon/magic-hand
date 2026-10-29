import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://localhost:1420", trace: "retain-on-failure" },
  // E2E_PROD=1 tests a production bundle (worker + wasm loading as shipped), with test hooks.
  webServer: {
    command: process.env.E2E_PROD
      ? "pnpm exec vite build --mode e2e --outDir dist-e2e && pnpm exec vite preview --outDir dist-e2e --port 1420 --strictPort"
      : "pnpm exec vite --mode e2e",
    url: "http://localhost:1420",
    reuseExistingServer: !process.env.CI && !process.env.E2E_PROD,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
        },
      },
    },
  ],
});
