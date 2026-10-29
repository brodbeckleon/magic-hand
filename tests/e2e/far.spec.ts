import type { FrameObs, PoseObs } from "../../src/core/types.ts";
import { person } from "../support/poses.ts";
import { expect, test } from "./fixtures.ts";
import { open, playFrames, sentKeys, waitLive } from "./helpers.ts";

function farPose(wx: number): PoseObs {
  const p = person(0.5, 0.3, 0.08);
  const lms = p.landmarks.slice();
  lms[16] = { x: wx, y: 0.45, z: 0, visibility: 0.95 };
  lms[14] = { x: wx, y: 0.53, z: 0, visibility: 0.95 };
  return { landmarks: lms };
}

test("a presenter far away (hand too small for the hand model) can still change slides", async ({ page }) => {
  await open(page);
  await waitLive(page);
  const hand = 0.24 * 0.08 * 640;
  const xs = [...Array(60).fill(0.4), ...Array.from({ length: 9 }, (_, i) => 0.4 + ((i + 1) * 4.5 * hand) / 9 / 640), ...Array(15).fill(0.4 + (4.5 * hand) / 640)];
  const frames: FrameObs[] = xs.map((wx, i) => ({ t: 10 + i / 30, width: 640, height: 480, hands: [], poses: [farPose(wx)] }));
  const playing = playFrames(page, frames);
  await expect(page.getByTestId("pose-hands")).toHaveAttribute("d", /a/);
  await playing;
  expect(await sentKeys(page)).toEqual(["next"]);
});
