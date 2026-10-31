import { aX, bX, openHand, swipeHand, TwoPeople } from "../support/multi.ts";
import { expect, test } from "./fixtures.ts";
import { open, playFrames, sentKeys, unlockDev, waitLive } from "./helpers.ts";

test.describe("several presenters", () => {
  test.beforeEach(async ({ page }) => {
    await open(page);
    await waitLive(page);
  });

  test("halo on the speaker, others dimmed; only the speaker changes slides; open hand takes over", async ({ page }) => {
    const scene = new TwoPeople();
    // B arms (holds still) and gets control.
    scene.run(1.8, () => ({ b: swipeHand(bX, 300) }));
    await playFrames(page, scene.frames);
    await expect(page.getByTestId("toast")).toContainText("now changes the slides");
    await expect(page.locator(".person[data-active='true']")).toHaveCount(1);
    await expect(page.locator(".person[data-active='false']")).toHaveCount(1);

    // A swipes: ignored, explained.
    const a = new TwoPeople();
    a.t = scene.t;
    a.run(0.5, () => ({ a: swipeHand(aX, 300) })).run(0.25, (i) => ({ a: swipeHand(aX - i * 20, 300) })).run(0.4, () => ({ a: swipeHand(aX - 140, 300) }));
    await playFrames(page, a.frames);
    expect(await sentKeys(page)).toEqual([]);
    await expect(page.getByTestId("toast")).toContainText("is not the speaker");

    // A raises an open hand: the claim ring fills, then A has control and can swipe.
    const claim = new TwoPeople();
    claim.t = a.t;
    claim.run(0.5, () => ({ a: openHand(0.27, 0.3) }));
    const playing = playFrames(page, claim.run(0.9, () => ({ a: openHand(0.27, 0.3) })).frames);
    await expect(page.locator(".claim-ring[visibility='visible']")).toHaveCount(1);
    await playing;
    const swipe = new TwoPeople();
    swipe.t = claim.t;
    swipe.run(0.6, () => ({ a: swipeHand(aX, 300) })).run(0.25, (i) => ({ a: swipeHand(aX - i * 20, 300) })).run(0.3, () => ({ a: swipeHand(aX - 140, 300) }));
    await playFrames(page, swipe.frames);
    expect(await sentKeys(page)).toEqual(["next"]);
  });

  test("developer view lists the tracked people", async ({ page }) => {
    await unlockDev(page);
    await page.getByTestId("dev-tabs").getByRole("radio", { name: "Speakers" }).click();
    const scene = new TwoPeople().run(1.8, () => ({ b: swipeHand(bX, 300) }));
    await playFrames(page, scene.frames);
    await expect(page.getByTestId("dev-speakers").locator("tbody tr")).toHaveCount(2);
    await expect(page.getByTestId("dev-speakers")).toContainText("★");
  });
});
