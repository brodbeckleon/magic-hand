import { TraceBuilder } from "../support/traces.ts";
import { expect, test } from "./fixtures.ts";
import { open, play, sentKeys, updateSettings, waitLive } from "./helpers.ts";

test.describe("app shell", () => {
  test.beforeEach(async ({ page }) => {
    await open(page);
    await waitLive(page);
  });

  test("main view has exactly the three main buttons plus Present", async ({ page, externalRequests }) => {
    const tools = page.getByTestId("toolbar").getByRole("button");
    await expect(tools).toHaveText(["Calibrate", "Help", "Preferences"]);
    await expect(page.getByTestId("present")).toBeVisible();
    expect(externalRequests).toEqual([]);
  });

  test("event list and stats are hidden until the developer shortcut", async ({ page }) => {
    await play(page, new TraceBuilder().calibrated().move(-160, 0, 0.25).hold(0.3));
    await expect(page.getByTestId("events")).toHaveCount(0);
    await expect(page.getByTestId("dev-stats")).toHaveCount(0);
    await page.keyboard.press("Control+Shift+D");
    await expect(page.getByTestId("dev-stats")).toBeVisible();
    await expect(page.getByTestId("events")).toContainText("Next slide");
    await page.getByTestId("open-preferences").click();
    await expect(page.getByTestId("developer")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Control+Shift+D");
    await expect(page.getByTestId("dev-stats")).toHaveCount(0);
  });

  test("preferences: hand, direction and sensitivity apply immediately and persist", async ({ page }) => {
    await page.getByTestId("open-preferences").click();
    const prefs = page.getByTestId("preferences");
    await prefs.getByTestId("pref-hand").getByRole("radio", { name: "Left" }).click();
    await prefs.getByTestId("pref-direction").getByRole("radio", { name: "To the right" }).click();
    await prefs.getByTestId("pref-sensitivity").getByRole("radio", { name: "Calm" }).click();
    await expect(prefs.getByTestId("pref-hand").getByRole("radio", { name: "Left" })).toHaveAttribute("aria-checked", "true");

    // Right hand (the synthetic hand is labelled "right") no longer triggers.
    await play(page, new TraceBuilder().calibrated().move(-200, 0, 0.25).hold(0.3));
    expect(await sentKeys(page)).toEqual([]);

    await page.reload();
    await waitLive(page);
    await page.getByTestId("open-preferences").click();
    await expect(prefs.getByTestId("pref-hand").getByRole("radio", { name: "Left" })).toHaveAttribute("aria-checked", "true");
    await expect(prefs.getByTestId("pref-direction").getByRole("radio", { name: "To the right" })).toHaveAttribute("aria-checked", "true");
    await expect(prefs.getByTestId("pref-sensitivity").getByRole("radio", { name: "Calm" })).toHaveAttribute("aria-checked", "true");
  });

  test("segmented controls work with the keyboard", async ({ page }) => {
    await page.getByTestId("open-preferences").click();
    const either = page.getByTestId("pref-hand").getByRole("radio", { name: "Either" });
    await either.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("pref-hand").getByRole("radio", { name: "Right" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("pref-hand").getByRole("radio", { name: "Right" })).toBeFocused();
  });

  test("language can be switched in preferences", async ({ page }) => {
    await page.getByTestId("open-preferences").click();
    await page.getByTestId("pref-language").getByRole("radio", { name: "Deutsch" }).click();
    await expect(page.getByTestId("toolbar").getByRole("button")).toHaveText(["Kalibrieren", "Hilfe", "Einstellungen"]);
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
  });

  test("delete all saved data (MHR08) returns to defaults and clears storage", async ({ page }) => {
    await updateSettings(page, { preferredHand: "left", reverse: true });
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => localStorage.getItem("magic-hand.settings"))).not.toBeNull();
    await page.getByTestId("open-preferences").click();
    await page.getByTestId("delete-data").click();
    await page.getByTestId("delete-confirm").click();
    await expect(page.getByText("Deleted. No data is stored anymore.")).toBeVisible();
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => localStorage.getItem("magic-hand.settings"))).toBeNull();
    await expect(page.getByTestId("pref-hand").getByRole("radio", { name: "Either" })).toHaveAttribute("aria-checked", "true");
  });

  test("help: tabs, troubleshooting and privacy statement", async ({ page }) => {
    await page.getByTestId("open-help").click();
    const help = page.getByTestId("help");
    await expect(help).toContainText("Hold your hand still");
    await help.getByRole("radio", { name: "Troubleshooting" }).click();
    await help.getByText("The slide does not change").click();
    await expect(help).toContainText("Accessibility permission");
    await help.getByRole("radio", { name: "Privacy" }).click();
    await expect(help).toContainText("No images, videos or hand data are stored or transmitted");
    await page.keyboard.press("Escape");
    await expect(help).toHaveCount(0);
  });

  test("help describes the configured swipe direction", async ({ page }) => {
    await updateSettings(page, { reverse: true });
    await page.getByTestId("open-help").click();
    await expect(page.getByTestId("help")).toContainText("Swipe briskly to the right: next slide.");
  });

  test("Present collapses to the pill; gestures keep working; expand returns", async ({ page }) => {
    await page.getByTestId("present").click();
    const pill = page.getByTestId("pill");
    await expect(pill).toBeVisible();
    await expect(page.getByTestId("toolbar")).toHaveCount(0);
    await expect(pill).toContainText("Hold your hand still");
    await play(page, new TraceBuilder().calibrated().move(-160, 0, 0.25).hold(0.3));
    await expect(pill).toContainText("Ready");
    await expect(pill).toContainText("Next slide");
    expect(await sentKeys(page)).toEqual(["next"]);
    await page.getByTestId("pill-pause").click();
    await expect(pill).toContainText("Paused");
    await page.getByTestId("pill-pause").click();
    await expect(pill).toContainText("Ready");
    await page.getByTestId("pill-expand").click();
    await expect(page.getByTestId("toolbar")).toBeVisible();
  });

  test("explains an ignored diagonal swipe a few times, then stops", async ({ page }) => {
    await play(page, new TraceBuilder().calibrated().move(-120, 100, 0.25).hold(0.5));
    await expect(page.getByTestId("toast")).toContainText("swipe more horizontally");
    await updateSettings(page, { hints: { "toast.ignored_dir": 5 } });
    await play(page, new TraceBuilder().hold(0.6).move(-120, 100, 0.25).hold(0.3));
    await expect(page.getByTestId("toast")).toHaveCount(0);
  });

  test("a ring fills around the palm while holding still", async ({ page }) => {
    const done = play(page, new TraceBuilder().hold(0.7));
    await expect(page.locator(".arm-ring")).toHaveAttribute("visibility", "visible");
    await done;
  });
});
