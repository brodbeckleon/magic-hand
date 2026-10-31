import { bX, swipeHand, TwoPeople } from "../support/multi.ts";
import { TraceBuilder } from "../support/traces.ts";
import { expect, test } from "./fixtures.ts";
import { open, play, playFrames, waitLive } from "./helpers.ts";

test.describe("hints", () => {
  test.beforeEach(async ({ page }) => {
    await open(page);
    await waitLive(page);
  });

  test("a key sent while Magic Hand has the focus explains where keys go; 'Got it' stops it for good", async ({ page }) => {
    await play(page, new TraceBuilder().calibrated().move(-160, 0, 0.25).hold(0.3));
    await expect(page.getByTestId("hint-focus")).toContainText("Click into your presentation");
    await page.getByTestId("hint-ok").click();
    await expect(page.getByTestId("hint-focus")).toHaveCount(0);
    await page.reload();
    await waitLive(page);
    await play(page, new TraceBuilder().calibrated().move(-160, 0, 0.25).hold(0.3));
    await page.waitForTimeout(500);
    await expect(page.getByTestId("hint-focus")).toHaveCount(0);
  });

  test("several people in view: explains how to take over", async ({ page }) => {
    await playFrames(page, new TwoPeople().run(0.6, () => ({ b: swipeHand(bX, 300) })).frames);
    await expect(page.getByTestId("hint-takeover")).toContainText("raise an open hand");
  });

  test("no hints in the developer view (events are listed instead)", async ({ page }) => {
    await page.keyboard.press("Control+Shift+D");
    await play(page, new TraceBuilder().calibrated().move(-160, 0, 0.25).hold(0.3));
    await page.waitForTimeout(300);
    await expect(page.locator("[data-testid^='hint-']").filter({ hasNot: page.getByTestId("hint-ok") })).toHaveCount(0);
  });
});
