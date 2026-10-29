import { expect, test } from "./fixtures.ts";
import { open, waitLive } from "./helpers.ts";

test("shows the mirrored camera preview without any external request", async ({ page, externalRequests }) => {
  await open(page);
  const video = page.locator("video.camera");
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 20_000 }).toBeGreaterThan(0);
  await expect(video).toHaveCSS("transform", "matrix(-1, 0, 0, 1, 0, 0)");
  expect(externalRequests).toEqual([]);
});

test("hand tracking runs in the vision worker, off the UI thread", async ({ page }) => {
  await open(page);
  await waitLive(page);
  const state = await page.evaluate(() => {
    const s = (window as unknown as { __magicHand: { engine: { getState(): { worker: boolean; delegate: string } } } }).__magicHand.engine.getState();
    return { worker: s.worker, delegate: s.delegate };
  });
  expect(state).toEqual({ worker: true, delegate: "CPU" });
});

test("the pose model loads in the worker next to the hand model (zone step)", async ({ page }) => {
  await open(page);
  await waitLive(page);
  await page.getByTestId("open-calibrate").click(); // framing step runs the pose model on every frame
  await expect.poll(() => page.evaluate(() => (window as unknown as { __magicHand: { workerStats(): { poseMs: number } | null } }).__magicHand.workerStats()?.poseMs ?? 0), { timeout: 20_000 }).toBeGreaterThan(0);
});
