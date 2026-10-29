import { TraceBuilder } from "../support/traces.ts";
import { expect, test } from "./fixtures.ts";
import { open, play, sentKeys, unlockDev, waitLive } from "./helpers.ts";

test("study mode: prompts alternate, swipes are scored live, no key reaches the presentation", async ({ page }) => {
  await open(page);
  await waitLive(page);
  await play(page, new TraceBuilder().calibrated().hold(0.2));
  await unlockDev(page);
  await page.getByTestId("dev-tabs").getByRole("radio", { name: "Study" }).click();
  await page.getByTestId("dev-study").getByRole("radio", { name: "5" }).click();
  await page.getByTestId("dev-study").getByRole("radio", { name: "60 s" }).click();
  await page.getByTestId("study-start").click();
  const overlay = page.getByTestId("study-overlay");
  await expect(overlay).toHaveAttribute("data-phase", "prompt", { timeout: 5000 });
  await expect(overlay).toContainText("next slide");

  // First prompt (next): swipe left; second prompt (prev): swipe right.
  await play(page, new TraceBuilder().hold(0.1).move(-160, 0, 0.25).hold(0.2));
  await expect(overlay).toContainText("recognised");
  await expect(overlay).toContainText("previous slide", { timeout: 5000 });
  await play(page, new TraceBuilder(30, 20).at(160, 240).hold(0.1).move(160, 0, 0.25).hold(0.2));
  await expect(overlay).toContainText("Trial 3 of 10", { timeout: 5000 });
  expect(await sentKeys(page)).toEqual([]); // nothing reaches the presentation

  await page.getByTestId("study-stop").click();
  await expect(overlay).toHaveCount(0);
});
