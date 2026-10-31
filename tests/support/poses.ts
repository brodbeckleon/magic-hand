import type { PoseObs } from "../../src/core/types.ts";

/** A standing person: 33 landmarks spread over a box, shoulders at 11/12. */
export function person(cx: number, top: number, shoulder: number): PoseObs {
  const lms = Array.from({ length: 33 }, (_, i) => ({
    x: cx + ((i % 5) - 2) * shoulder * 0.3,
    y: top + (i / 32) * shoulder * 4,
    z: 0,
    visibility: 0.9,
  }));
  lms[11] = { x: cx + shoulder / 2, y: top + shoulder, z: 0, visibility: 0.9 };
  lms[12] = { x: cx - shoulder / 2, y: top + shoulder, z: 0, visibility: 0.9 };
  return { landmarks: lms };
}
