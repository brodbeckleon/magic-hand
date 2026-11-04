import { isHandOpen } from "../../src/core/features.ts";
import type { Landmark } from "../../src/core/types.ts";
import { palmLandmarks } from "../support/landmarks.ts";

/** Rotates landmarks about the vertical axis through the wrist (0° = palm to the camera). */
function turn(lms: Landmark[], deg: number, aspect = 4 / 3): Landmark[] {
  const a = (deg * Math.PI) / 180;
  const w = lms[0]!;
  return lms.map((l) => {
    const x = (l.x - w.x) * aspect;
    const z = (l.z - w.z) * aspect;
    return { x: w.x + (x * Math.cos(a) - z * Math.sin(a)) / aspect, y: l.y, z: w.z + (x * Math.sin(a) + z * Math.cos(a)) / aspect };
  });
}

/** Tilts the hand towards the camera about the horizontal axis through the wrist (90° = fingers at the camera). */
function tilt(lms: Landmark[], deg: number, aspect = 4 / 3): Landmark[] {
  const a = (deg * Math.PI) / 180;
  const w = lms[0]!;
  return lms.map((l) => {
    const y = l.y - w.y;
    const z = (l.z - w.z) * aspect;
    return { x: l.x, y: w.y + y * Math.cos(a) - z * Math.sin(a), z: w.z + (y * Math.sin(a) + z * Math.cos(a)) / aspect };
  });
}

describe("isHandOpen (fingers stretched, however the hand is turned)", () => {
  const open = palmLandmarks(0.5, 0.6, 0.15, true);
  const fist = palmLandmarks(0.5, 0.6, 0.15, false);

  it("open hand vs fist, palm to the camera", () => {
    expect(isHandOpen(open)).toBe(true);
    expect(isHandOpen(fist)).toBe(false);
  });

  it.each([45, 90, 135, 180])("turned %i° (edge or back of the hand to the camera)", (deg) => {
    expect(isHandOpen(turn(open, deg))).toBe(true);
    expect(isHandOpen(turn(fist, deg))).toBe(false);
  });

  it("fingers pointing at the camera still count as open (3D, not the 2D projection)", () => {
    expect(isHandOpen(tilt(open, 80))).toBe(true);
    expect(isHandOpen(tilt(fist, 80))).toBe(false);
  });

  it("tolerates one finger that is bent or misdetected", () => {
    const oneBent = open.map((l, i) => (i === 20 ? fist[20]! : i === 19 ? fist[19]! : l));
    expect(isHandOpen(oneBent)).toBe(true);
    const twoBent = oneBent.map((l, i) => (i === 16 ? fist[16]! : i === 15 ? fist[15]! : l));
    expect(isHandOpen(twoBent)).toBe(false);
  });

  it("a pointing hand (only the index finger stretched) is not open", () => {
    const pointing = fist.map((l, i) => ([6, 7, 8].includes(i) ? open[i]! : l));
    expect(isHandOpen(pointing)).toBe(false);
  });
});
