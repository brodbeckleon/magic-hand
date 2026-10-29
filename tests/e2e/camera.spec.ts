import { expect, test } from "./fixtures.ts";
import { open } from "./helpers.ts";

test("shows the mirrored camera preview without any external request", async ({ page, externalRequests }) => {
  await open(page);
  const video = page.locator("video.camera");
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 20_000 }).toBeGreaterThan(0);
  await expect(video).toHaveCSS("transform", "matrix(-1, 0, 0, 1, 0, 0)");
  expect(externalRequests).toEqual([]);
});
