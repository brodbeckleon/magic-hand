import type { Page } from "@playwright/test";
import { TraceBuilder } from "../support/traces.ts";
import { expect, test } from "./fixtures.ts";
import { open, play, updateSettings, waitLive } from "./helpers.ts";

type Box = { name: string; x: number; y: number; width: number; height: number };

/** Bounding boxes of the floating controls that are visible right now. */
async function controlBoxes(page: Page): Promise<Box[]> {
  const ids = ["status", "toolbar", "swipe-bar", "present", "preview-notice"];
  const boxes: Box[] = [];
  for (const id of ids) {
    const el = page.getByTestId(id);
    if ((await el.count()) === 0 || !(await el.isVisible())) continue;
    const b = await el.boundingBox();
    if (b) boxes.push({ name: id, ...b });
  }
  return boxes;
}

function overlaps(a: Box, b: Box): boolean {
  // One pixel of tolerance for anti-aliased edges.
  return a.x + a.width > b.x + 1 && b.x + b.width > a.x + 1 && a.y + a.height > b.y + 1 && b.y + b.height > a.y + 1;
}

async function expectNoOverlap(page: Page, label: string): Promise<void> {
  const boxes = await controlBoxes(page);
  const hits: string[] = [];
  boxes.forEach((a, i) => boxes.slice(i + 1).forEach((b) => overlaps(a, b) && hits.push(`${a.name} × ${b.name}`)));
  const offscreen = boxes.filter((b) => b.x < 0 || b.y < 0 || b.x + b.width > page.viewportSize()!.width + 1).map((b) => b.name);
  expect(hits, `${label}: overlapping controls`).toEqual([]);
  expect(offscreen, `${label}: controls outside the window`).toEqual([]);
}

// The window can be made as small as 640×480 (tauri.conf.json minWidth/minHeight).
for (const { width, height } of [
  { width: 640, height: 480 },
  { width: 800, height: 560 },
  { width: 1024, height: 720 },
]) {
  for (const language of ["en", "de"]) {
    test(`main view controls do not overlap at ${width}×${height} (${language})`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await open(page);
      await waitLive(page);
      await updateSettings(page, { language });
      await page.waitForTimeout(400); // Present button enter animation
      await expectNoOverlap(page, "calibrating");
      await play(page, new TraceBuilder().calibrated().hold(0.2));
      await expect(page.getByTestId("mode")).not.toHaveText(/Calibrating|Kalibrier/);
      await expectNoOverlap(page, "active");
    });
  }
}
