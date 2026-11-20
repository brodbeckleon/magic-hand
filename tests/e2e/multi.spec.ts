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
    await expect(page.getByTestId("toast")).toContainText("Person 2 now controls the slides");
    await expect(page.locator(".person[data-active='true']")).toHaveCount(1);
    await expect(page.locator(".person[data-active='false']")).toHaveCount(1);
    // Chips: the active person "controls the slides", the other one is named by number (not raw id).
    await expect(page.locator(".person[data-active='true'] .chip-text")).toHaveText("Controls the slides");
    await expect(page.locator(".person[data-active='false'] .chip-text")).toHaveText("Person 1");

    // A swipes: ignored, explained.
    const a = new TwoPeople();
    a.t = scene.t;
    a.run(0.5, () => ({ a: swipeHand(aX, 300) })).run(0.25, (i) => ({ a: swipeHand(aX - i * 20, 300) })).run(0.4, () => ({ a: swipeHand(aX - 140, 300) }));
    await playFrames(page, a.frames);
    expect(await sentKeys(page)).toEqual([]);
    await expect(page.getByTestId("toast")).toContainText("Person 1 does not control the slides");
    await expect(page.getByTestId("reason")).toContainText("Not your turn");

    // A holds up an open palm at chest height: the claim ring fills, then A has control and can swipe.
    const claim = new TwoPeople();
    claim.t = a.t;
    claim.run(0.5, () => ({ a: openHand(0.27, 0.65) }));
    const playing = playFrames(page, claim.run(0.9, () => ({ a: openHand(0.27, 0.65) })).frames);
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

test("the presenting bar says who controls the slides, shows the take-over progress and a lost speaker", async ({ page }) => {
  await open(page);
  await waitLive(page);
  await page.getByTestId("present").click();
  const status = page.getByTestId("pill-status");
  const scene = new TwoPeople();
  scene.run(1.8, () => ({ b: swipeHand(bX, 300) }));
  await playFrames(page, scene.frames);
  await expect(status).toHaveText("Person 2 controls the slides");

  // A holds up an open palm: the ring around the status dot fills, then A has control.
  const claim = new TwoPeople();
  claim.t = scene.t;
  claim.run(0.6, () => ({ a: openHand(0.27, 0.65) }));
  const playing = playFrames(page, claim.run(0.8, () => ({ a: openHand(0.27, 0.65) })).frames);
  await expect(page.getByTestId("pill-takeover")).toHaveAttribute("visibility", "visible");
  await expect(status).toContainText("Taking over");
  await playing;
  await expect(status).toHaveText("Person 1 controls the slides", { timeout: 5000 });

  // A walks out for good: nobody has control (no "Person –").
  const gone = new TwoPeople();
  gone.t = claim.t;
  const frames = gone.run(4.5, () => ({})).frames.map((f) => ({ ...f, poses: f.poses!.slice(1) }));
  const leaving = playFrames(page, frames);
  await expect(status).toContainText("Nobody controls the slides — swipe to take over", { timeout: 10_000 });
  await expect(page.getByTestId("pill")).not.toContainText("Person –");
  await leaving;
});

test("alone in view, an open raised hand shows no take-over ring (only the calibration ring)", async ({ page }) => {
  await open(page);
  await waitLive(page);
  const { openHand } = await import("../support/multi.ts");
  const { person } = await import("../support/poses.ts");
  const frames = Array.from({ length: 30 }, (_, i) => ({
    t: 10 + i / 30, width: 640, height: 480, hands: [openHand(0.5, 0.3)], poses: [person(0.5, 0.25, 0.1)],
  }));
  const playing = playFrames(page, frames);
  await expect(page.locator(".arm-ring")).toHaveAttribute("visibility", "visible");
  await expect(page.locator(".claim-ring[visibility='visible']")).toHaveCount(0);
  await playing;
});
