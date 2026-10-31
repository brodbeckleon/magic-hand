import { person } from "../support/poses.ts";
import { TraceBuilder } from "../support/traces.ts";
import { expect, test } from "./fixtures.ts";
import { open, play, sentKeys, waitLive } from "./helpers.ts";

/** Waits until a wizard step is mounted (its heading is shown), not just selected: steps start
 *  listening to the camera when they mount, so frames played earlier would be missed. */
const stepShown = (page: import("@playwright/test").Page, heading: string) =>
  expect(page.locator(".wizard .step-title")).toHaveText(heading);

type Hooks = { __magicHand: { settings: { getState(): Record<string, unknown> } } };
const settings = (page: import("@playwright/test").Page) =>
  page.evaluate(() => JSON.parse(JSON.stringify((window as never as Hooks).__magicHand.settings.getState())));

test.describe("first-run wizard", () => {
  test("opens on first start and walks through direction, zone and arming", async ({ page }) => {
    await open(page, "/", "&firstRun=1");
    const wizard = page.getByTestId("wizard-firstRun");
    await expect(wizard).toBeVisible({ timeout: 30_000 });
    await expect(wizard).toContainText("Welcome to Magic Hand");
    await page.getByTestId("wizard-next").click();

    // Direction: trying a swipe highlights it; picking "right" sets reverse.
    await expect(wizard).toContainText("Which direction feels natural?");
    await play(page, new TraceBuilder().hold(0.3).move(200, 0, 0.3).hold(0.3));
    await expect(page.getByTestId("direction-right")).toContainText("tried 1×");
    await page.getByTestId("direction-right").click();
    await page.getByTestId("wizard-next").click();

    // Zone: a presenter is "seen" (synthetic pose) -> proposed zone with handles.
    await stepShown(page, "Your presenting area");
    await play(page, new TraceBuilder().hold(3.4), { poses: [person(0.5, 0.25, 0.12)] });
    await expect(page.getByTestId("zone-editor")).toBeVisible();
    await expect(page.getByTestId("zone-mask")).toBeVisible();
    await page.getByTestId("zone-confirm").click();

    // Arm: holding still completes it and moves on (the step resets calibration when it appears).
    await stepShown(page, "Hold your hand still");
    await expect(wizard).toContainText("Hold your hand still");
    await play(page, new TraceBuilder().hold(1.4));
    await expect(wizard).toContainText("All set");
    expect(await sentKeys(page)).toEqual([]);
    await page.getByTestId("done-stay").click();
    await expect(wizard).toHaveCount(0);

    const s = await settings(page);
    expect(s.reverse).toBe(true);
    expect(s.firstRunDone).toBe(true);
    const zone = s.zone as { x: number; w: number };
    expect(zone.x).toBeLessThan(0.5);
    expect(zone.x + zone.w).toBeGreaterThan(0.5);
  });

  test("can be skipped entirely and does not come back", async ({ page }) => {
    await open(page, "/", "&firstRun=1");
    await page.getByTestId("wizard-skip-all").click({ timeout: 30_000 });
    await expect(page.getByTestId("wizard-firstRun")).toHaveCount(0);
    await expect(page.getByTestId("toolbar")).toBeVisible();
    await page.reload();
    await waitLive(page);
    await page.waitForTimeout(500);
    await expect(page.getByTestId("wizard-firstRun")).toHaveCount(0);
  });

  test("Help > Show the introduction again reopens it", async ({ page }) => {
    await open(page);
    await waitLive(page);
    await page.getByTestId("open-help").click();
    await page.getByTestId("replay-onboarding").click();
    await expect(page.getByTestId("wizard-firstRun")).toBeVisible();
  });
});

test.describe("calibration wizard", () => {
  test.beforeEach(async ({ page }) => {
    await open(page);
    await waitLive(page);
    await page.getByTestId("open-calibrate").click();
  });

  test("framing checks, zone without anyone in view, arm, practice, auto-tune", async ({ page }) => {
    const wizard = page.getByTestId("wizard-calibrate");
    await expect(wizard).toContainText("Are you in the picture?");
    await expect(page.getByTestId("silhouette")).toBeVisible();
    await expect(page.getByTestId("framing-checks")).toContainText("Light");
    await page.getByTestId("wizard-next").click();
    await stepShown(page, "Your presenting area");

    // Nobody in view: the user is told and can still confirm (whole picture).
    await play(page, new TraceBuilder().hold(3.4));
    await expect(wizard).toContainText("Nobody was in view");
    await page.getByTestId("zone-confirm").click();
    await stepShown(page, "Hold your hand still");

    await play(page, new TraceBuilder().hold(1.4));
    await expect(wizard).toContainText("Practice round");

    // Practice: 3 swipes each way (wide and fast) -> no keys sent.
    const t = new TraceBuilder().hold(0.3);
    for (let i = 0; i < 3; i++) t.move(-220, 6, 0.28).hold(0.5).move(220, -6, 0.28).hold(0.5);
    await play(page, t);
    await expect(page.locator(".pip[data-on='true']")).toHaveCount(6);
    expect(await sentKeys(page)).toEqual([]);
    await page.getByTestId("wizard-next").click();

    await expect(page.getByTestId("summary-table")).toBeVisible();
    await page.getByTestId("summary-use").click();
    await expect(wizard).toHaveCount(0);
    const s = await settings(page);
    expect(s.sensitivity).toBe("custom");
    expect((s.swipe as { distance: number }).distance).toBeGreaterThan(2.5);
    expect(s.zone).toBeNull();
  });

  test("diagonal practice swipes are explained and not counted", async ({ page }) => {
    await page.getByTestId("wizard-next").click(); // framing
    await stepShown(page, "Your presenting area");
    await play(page, new TraceBuilder().hold(3.4));
    await page.getByTestId("zone-confirm").click();
    await stepShown(page, "Hold your hand still");
    await play(page, new TraceBuilder().hold(1.4));
    await expect(page.getByTestId("practice")).toBeVisible();
    await play(page, new TraceBuilder().hold(0.3).move(-90, 170, 0.3).hold(0.4));
    await expect(page.getByText("Too diagonal")).toBeVisible();
    await expect(page.locator(".pip[data-on='true']")).toHaveCount(0);
  });

  test("Escape closes it and gestures work again", async ({ page }) => {
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("wizard-calibrate")).toHaveCount(0);
    await play(page, new TraceBuilder().calibrated().move(-160, 0, 0.25).hold(0.3));
    expect(await sentKeys(page)).toEqual(["next"]);
  });
});

test("zone editor: keyboard moves the zone", async ({ page }) => {
  await open(page);
  await waitLive(page);
  await page.getByTestId("open-calibrate").click();
  await page.getByTestId("wizard-next").click();
  await stepShown(page, "Your presenting area");
  await play(page, new TraceBuilder().hold(3.4), { poses: [person(0.5, 0.25, 0.1)] });
  const rect = page.locator(".zone-rect");
  const before = Number(await rect.getAttribute("x"));
  await rect.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => Number(await rect.getAttribute("x"))).toBeGreaterThan(before);
});
