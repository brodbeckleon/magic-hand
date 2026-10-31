import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  reporter: process.env.CI ? "github" : "list",
  // Hand tracking runs on real (CPU) inference; on slow CI machines one retry absorbs timing
  // hiccups. Retried tests are reported as flaky, so they stay visible.
  retries: process.env.CI ? 1 : 0,
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
    // WebKit is the engine of the macOS app (WKWebView); the camera is a canvas stream there.
    // Main-thread inference there is slower, so tests get more time.
    { name: "webkit", use: { ...devices["Desktop Safari"] }, timeout: 60_000 },
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
