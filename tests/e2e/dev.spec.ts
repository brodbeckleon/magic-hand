import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { parseRecording } from "../../src/core/recording/format.ts";
import { TraceBuilder } from "../support/traces.ts";
import { expect, test } from "./fixtures.ts";
import { open, play, sentKeys, unlockDev, waitLive } from "./helpers.ts";

test.describe("developer tools", () => {
  test.beforeEach(async ({ page }) => {
    await open(page);
    await waitLive(page);
  });

  test("hidden by default, shown with Ctrl/Cmd+Shift+D", async ({ page }) => {
    await expect(page.getByTestId("dev-panel")).toHaveCount(0);
    await page.keyboard.press("Control+Shift+D");
    await expect(page.getByTestId("dev-metrics")).toBeVisible();
    await expect(page.getByTestId("dev-metrics")).toContainText("worker");
  });

  test("metrics show trigger latency; sliders change parameters live", async ({ page }) => {
    await unlockDev(page);
    await play(page, new TraceBuilder().calibrated().move(-160, 0, 0.25).hold(0.3));
    await expect(page.getByTestId("dev-metrics")).toContainText("n=1");
    await page.getByTestId("dev-tabs").getByRole("radio", { name: "Parameters" }).click();
    const slider = page.getByTestId("param-distance");
    await slider.focus();
    for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowRight");
    const s = await page.evaluate(() => (window as never as { __magicHand: { settings: { getState(): { swipe: { distance: number }; sensitivity: string } } } })
      .__magicHand.settings.getState());
    expect(s.swipe.distance).toBeCloseTo(3.5, 5);
    expect(s.sensitivity).toBe("custom");
    // A swipe that was enough before is now too short.
    await play(page, new TraceBuilder().hold(1.5).move(-120, 0, 0.25).hold(0.3));
    expect(await sentKeys(page)).toEqual(["next"]);
  });

  test("record (landmarks only, needs consent) -> save -> replay gives the same events", async ({ page }) => {
    await unlockDev(page);
    await page.getByTestId("dev-tabs").getByRole("radio", { name: "Recording" }).click();
    await expect(page.getByTestId("rec-start")).toBeDisabled();
    await page.getByTestId("rec-consent").check();
    await page.getByTestId("rec-start").click();
    await expect(page.getByTestId("rec-badge")).toBeVisible();

    await play(page, new TraceBuilder().calibrated().move(-160, 0, 0.25).hold(1.2).move(160, 0, 0.25).hold(0.4));
    await page.keyboard.press("m");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("rec-save").click()]);
    await expect(page.getByTestId("rec-badge")).toHaveCount(0);
    expect(download.suggestedFilename()).toMatch(/^magic_hand_\d{8}_\d{6}\.jsonl\.gz$/);
    const path = await download.path();
    const text = gunzipSync(readFileSync(path)).toString("utf8");
    const rec = parseRecording(text);
    expect(rec.header.settings.swipe.distance).toBe(2.5);
    expect(rec.frames.length).toBeGreaterThan(50);
    expect(rec.events.filter((e) => e.event === "trigger").map((e) => e.command)).toEqual(["next", "prev"]);
    expect(rec.marks.map((m) => m.kind)).toEqual(["missed"]);
    expect(text).not.toMatch(/data:image|base64|"pixels"|"image"/);
    const keysBefore = (await sentKeys(page)).length;

    await page.getByTestId("replay-file").setInputFiles(path);
    await expect(page.getByTestId("replay-status")).toContainText("Same events as live", { timeout: 20_000 });
    expect((await sentKeys(page)).length).toBe(keysBefore); // replay never sends keys
    await page.getByRole("button", { name: "Back to the camera" }).click();
    await waitLive(page);
  });
});
