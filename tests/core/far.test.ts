import { DEFAULT_HAND_RATIO, HandRatio, palmFromPose, poseHand, shoulderPx, wristCrop } from "../../src/core/far/wrist.ts";
import { contains } from "../../src/core/zone/Zone.ts";
import type { PoseObs } from "../../src/core/types.ts";
import { person } from "../support/poses.ts";

/** Right forearm pointing up: elbow below the wrist. */
function armUp(x: number, shoulder: number, wrist: { x: number; y: number }): PoseObs {
  const p = person(x, 0.3, shoulder);
  const lms = p.landmarks.slice();
  lms[16] = { x: wrist.x, y: wrist.y, z: 0, visibility: 0.95 };
  lms[14] = { x: wrist.x, y: wrist.y + shoulder, z: 0, visibility: 0.95 };
  return { landmarks: lms };
}

describe("far-distance helpers", () => {
  it("shoulder width in pixels", () => {
    expect(shoulderPx(person(0.5, 0.3, 0.1), 640, 480)).toBeCloseTo(64, 5);
  });

  it("palm sits beyond the wrist along the forearm", () => {
    const p = palmFromPose(armUp(0.5, 0.1, { x: 0.45, y: 0.4 }), "right", 640, 480)!;
    expect(p.y).toBeLessThan(0.4); // forearm points up, so the palm is above the wrist
    expect(p.x).toBeCloseTo(0.45, 5);
    expect(p.sizePx).toBeCloseTo(DEFAULT_HAND_RATIO * 64, 5);
  });

  it("pose hand is in mirrored pixels with a size from the shoulders", () => {
    const h = poseHand(armUp(0.5, 0.1, { x: 0.45, y: 0.4 }), "right", 640, 480)!;
    expect(h.cx).toBeCloseTo((1 - 0.45) * 640, 5);
    expect(h.scale).toBeCloseTo(DEFAULT_HAND_RATIO * 64, 5);
  });

  it("no pose hand when the wrist is not clearly visible", () => {
    const p = armUp(0.5, 0.1, { x: 0.45, y: 0.4 });
    p.landmarks[16] = { ...p.landmarks[16]!, visibility: 0.2 };
    expect(poseHand(p, "right", 640, 480)).toBeNull();
  });

  it("wrist crop is a square (in pixels) containing the palm", () => {
    const pose = armUp(0.5, 0.06, { x: 0.45, y: 0.4 });
    const c = wristCrop(pose, "right", 640, 480)!;
    expect(c.w * 640).toBeCloseTo(c.h * 480, 3);
    const palm = palmFromPose(pose, "right", 640, 480)!;
    expect(contains(c, palm.x, palm.y)).toBe(true);
  });

  it("learns the hand-to-shoulder ratio and ignores implausible pairs", () => {
    const r = new HandRatio();
    for (let i = 0; i < 20; i++) r.observe(20, 100);
    expect(r.value).toBeCloseTo(0.2, 2);
    r.observe(90, 100);
    expect(r.value).toBeCloseTo(0.2, 2);
  });
});
