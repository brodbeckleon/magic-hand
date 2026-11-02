import { expect, test } from "./fixtures.ts";
import { open, waitLive } from "./helpers.ts";

test("shows the mirrored camera preview without any external request", async ({ page, externalRequests }) => {
  await open(page);
  const video = page.locator("video.camera");
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 20_000 }).toBeGreaterThan(0);
  await expect(video).toHaveCSS("transform", "matrix(-1, 0, 0, 1, 0, 0)");
  expect(externalRequests).toEqual([]);
});

test("hand tracking runs in the vision worker where the engine allows it", async ({ page }, testInfo) => {
  await open(page);
  await waitLive(page);
  const state = await page.evaluate(() => {
    const s = (window as unknown as { __magicHand: { engine: { getState(): { worker: boolean; delegate: string } } } }).__magicHand.engine.getState();
    return { worker: s.worker, delegate: s.delegate };
  });
  // WebKit without WebGL in workers (Safari < 17) runs the same analysis on the main thread.
  expect(state).toEqual({ worker: testInfo.project.name !== "webkit", delegate: "CPU" });
});

test("refuses to run hand tracking without a hardware GPU (no CPU fallback)", async ({ page }, testInfo) => {
  // WebKit always names its renderer "Apple GPU" (every Mac has one); only Chromium (WebView2 on
  // Windows) reveals software WebGL, which headless Chromium has.
  test.skip(testInfo.project.name === "webkit", "WebKit masks the WebGL renderer");
  testInfo.annotations.push({ type: "vision-errors-expected" });
  await page.goto("/"); // no ?delegate=CPU: the app's real choice
  const error = page.getByTestId("camera-error");
  await expect(error).toBeVisible({ timeout: 30_000 });
  await expect(error.getByRole("heading")).toHaveText(/graphics card/);
  expect(await page.evaluate(() => (window as unknown as { __magicHand: { engine: { getState(): { delegate: string | null } } } }).__magicHand.engine.getState().delegate)).toBeNull();
});

test("the pose model loads next to the hand model (zone step)", async ({ page }) => {
  await open(page);
  await waitLive(page);
  await page.getByTestId("open-calibrate").click(); // framing step runs the pose model on every frame
  await expect.poll(() => page.evaluate(() => (window as unknown as { __magicHand: { workerStats(): { poseMs: number } | null } }).__magicHand.workerStats()?.poseMs ?? 0), { timeout: 20_000 }).toBeGreaterThan(0);
});
