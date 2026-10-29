import { TraceBuilder } from "../support/traces.ts";
import { expect, test } from "./fixtures.ts";
import { open, play, sentKeys, waitLive } from "./helpers.ts";

test.describe("live view (synthetic hand)", () => {
  test.beforeEach(async ({ page }) => {
    await open(page);
    await waitLive(page);
  });

  test("calibrate, swipe left -> next slide key, arrow and event list", async ({ page, externalRequests }) => {
    await expect(page.getByTestId("mode")).toHaveText("Calibrating");
    await play(page, new TraceBuilder().calibrated().move(-160, 0, 0.25).hold(0.4));
    await expect(page.getByTestId("mode")).toHaveText("Active");
    await expect(page.getByTestId("events")).toContainText("Next slide");
    await expect(page.getByTestId("events")).toContainText("Calibrated, gestures active");
    expect(await sentKeys(page)).toEqual(["next"]);
    expect(externalRequests).toEqual([]);
  });

  test("shows the big arrow when a slide changes", async ({ page }) => {
    const done = play(page, new TraceBuilder().calibrated().move(160, 0, 0.25).hold(0.3));
    await expect(page.getByTestId("arrow-flash")).toHaveAttribute("data-kind", "prev");
    await done;
    expect(await sentKeys(page)).toEqual(["prev"]);
  });

  test("no key before calibration (MHR01)", async ({ page }) => {
    await play(page, new TraceBuilder().move(-160, 0, 0.25).move(160, 0, 0.25).move(-160, 0, 0.25));
    expect(await sentKeys(page)).toEqual([]);
    await expect(page.getByTestId("mode")).toHaveText("Calibrating");
  });

  test("the return movement is ignored and listed with its reason", async ({ page }) => {
    await play(page, new TraceBuilder().calibrated().move(-160, 0, 0.25).move(160, 0, 0.3).hold(0.3));
    expect(await sentKeys(page)).toEqual(["next"]);
    await expect(page.getByTestId("events")).toContainText("Ignored: return time");
  });

  test("reverse setting swaps the command", async ({ page }) => {
    await page.evaluate(() => (window as never as { __magicHand: { settings: { getState(): { update(p: object): void } } } })
      .__magicHand.settings.getState().update({ reverse: true }));
    await play(page, new TraceBuilder().calibrated().move(-160, 0, 0.25).hold(0.3));
    expect(await sentKeys(page)).toEqual(["prev"]);
  });

  test("p pauses detection, k recalibrates", async ({ page }) => {
    await play(page, new TraceBuilder().calibrated().hold(0.2));
    await page.keyboard.press("p");
    await expect(page.getByTestId("mode")).toHaveText("Paused");
    await play(page, new TraceBuilder().hold(0.2).move(-160, 0, 0.25).hold(0.3));
    expect(await sentKeys(page)).toEqual([]);
    await page.keyboard.press("p");
    await page.keyboard.press("k");
    await expect(page.getByTestId("mode")).toHaveText("Calibrating");
  });

  test("m/f mark missed and false triggers; e exports the prototype CSV", async ({ page }) => {
    await play(page, new TraceBuilder().calibrated().move(-160, 0, 0.25).hold(0.3));
    await page.keyboard.press("m");
    await page.keyboard.press("f");
    await expect(page.getByTestId("events")).toContainText("Missed (logged)");
    await expect(page.getByTestId("events")).toContainText("False trigger (logged)");
    const [download] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("e")]);
    const csv = await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString("utf8"));
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("zeit,ereignis,richtung,wischrichtung,strecke_handlaengen,reaktion_ms,verarbeitung_ms");
    expect(lines.map((l) => l.split(",")[1])).toEqual(["ereignis", "calibrated", "ausgeloest", "verpasst", "fehlausloesung"]);
    const trigger = lines[2]!.split(",");
    expect(trigger.slice(2, 4)).toEqual(["next", "links"]);
    expect(Number(trigger[5])).toBeGreaterThan(0);
    expect(Number(trigger[5])).toBeLessThan(500); // MHR06 (synthetic: no camera latency)
  });
});

test.describe("German UI", () => {
  test.use({ locale: "de-CH" });

  test("uses the OS language", async ({ page }) => {
    await open(page);
    await waitLive(page);
    await expect(page.getByTestId("mode")).toHaveText("Kalibrieren");
    await play(page, new TraceBuilder().calibrated().move(-160, 0, 0.25).hold(0.3));
    await expect(page.getByTestId("events")).toContainText("Nächste Folie");
  });
});
