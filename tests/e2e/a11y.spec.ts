import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { TraceBuilder } from "../support/traces.ts";
import { expect, test } from "./fixtures.ts";
import { open, play, unlockDev, waitLive } from "./helpers.ts";

/** WCAG 2.1 AA; the live camera image itself is decorative. */
async function audit(page: Page, what: string) {
  // Measure the settled UI: elements fading in have partial opacity, which axe would report as
  // low contrast. Infinite animations (spinners, the breathing silhouette) are ignored.
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity));
  await page.waitForTimeout(300); // JS-driven (motion) transitions
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).exclude("video").analyze();
  const serious = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${what}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(" ")} - ${v.help}`)).toEqual([]);
}

test.describe("accessibility (axe, WCAG 2.1 AA)", () => {
  test.beforeEach(async ({ page }) => {
    await open(page);
    await waitLive(page);
    await play(page, new TraceBuilder().calibrated().hold(0.2));
  });

  test("main view", async ({ page }) => audit(page, "main"));

  test("preferences, incl. developer section", async ({ page }) => {
    await unlockDev(page);
    await page.getByTestId("open-preferences").click();
    await page.getByTestId("pref-speaker").getByRole("radio", { name: "Automatic" }).click();
    await audit(page, "preferences");
  });

  test("help, every tab", async ({ page }) => {
    await page.getByTestId("open-help").click();
    for (const tab of ["Getting started", "Troubleshooting", "Privacy", "About"]) {
      await page.getByTestId("help-tabs").getByRole("radio", { name: tab }).click();
      await audit(page, `help/${tab}`);
    }
  });

  test("calibration wizard", async ({ page }) => {
    await page.getByTestId("open-calibrate").click();
    await audit(page, "wizard/framing");
  });

  test("pill", async ({ page }) => {
    await page.getByTestId("present").click();
    await audit(page, "pill");
  });

  test("developer panel", async ({ page }) => {
    await unlockDev(page);
    for (const tab of ["Metrics", "Parameters", "Speakers", "Recording"]) {
      await page.getByTestId("dev-tabs").getByRole("radio", { name: tab }).click();
      await audit(page, `dev/${tab}`);
    }
  });
});

test("closing a sheet returns the keyboard focus to the button that opened it", async ({ page }) => {
  await open(page);
  await waitLive(page);
  for (const [id, sheet] of [["open-preferences", "preferences"], ["open-help", "help"]] as const) {
    await page.getByTestId(id).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId(sheet)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId(id)).toBeFocused();
  }
});

test("with reduced motion, sheets open without sliding in", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  await waitLive(page);
  await page.getByTestId("open-preferences").click();
  // No spring: the sheet is in place right away (a slide takes ~300 ms).
  await page.waitForTimeout(60);
  const t = await page.getByTestId("preferences").evaluate((el) => getComputedStyle(el).transform);
  expect(t === "none" || /matrix\(1, 0, 0, 1, 0, 0\)/.test(t)).toBe(true);
});
