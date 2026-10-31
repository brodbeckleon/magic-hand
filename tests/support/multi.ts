import type { FrameObs, HandObs, Landmark, PoseObs } from "../../src/core/types.ts";
import { landmarksFor, palmLandmarks } from "./landmarks.ts";
import { person } from "./poses.ts";

export const W = 640;
export const H = 480;
const DT = 1 / 30;

/** A person at normalised (unmirrored) x whose right wrist is at `wrist`. */
export function presenter(x: number, wrist: Landmark): PoseObs {
  const p = person(x, 0.25, 0.1);
  const lms = p.landmarks.slice();
  lms[16] = { ...wrist, visibility: 0.95 };
  lms[15] = { x: x + 0.05, y: 0.7, z: 0, visibility: 0.95 };
  return { landmarks: lms };
}

/** Hand landmarks for a palm at mirrored-pixel position (cx, cy). */
export const swipeHand = (cx: number, cy: number): HandObs => ({ landmarks: landmarksFor({ cx, cy, scale: 40 }, W, H), side: "right", sideScore: 0.9 });
export const openHand = (x: number, y: number): HandObs => ({ landmarks: palmLandmarks(x, y, 0.07, true), side: "right", sideScore: 0.9 });

/** In the mirrored view, person A (x = 0.3) is on the right, B (x = 0.7) on the left. */
export const aX = (1 - 0.25) * W;
export const bX = (1 - 0.65) * W;

/** Builds frames for two presenters A and B; poses follow the hands' wrists. */
export class TwoPeople {
  t = 10;
  frames: FrameObs[] = [];
  run(seconds: number, hands: (i: number) => { a?: HandObs; b?: HandObs }): this {
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      const h = hands(i);
      const wristOf = (o: HandObs | undefined, fallback: Landmark) => (o ? o.landmarks[0]! : fallback);
      this.frames.push({
        t: this.t, width: W, height: H,
        hands: [h.a, h.b].filter((x): x is HandObs => !!x),
        poses: [presenter(0.3, wristOf(h.a, { x: 0.25, y: 0.7, z: 0 })), presenter(0.7, wristOf(h.b, { x: 0.65, y: 0.7, z: 0 }))],
      });
      this.t += DT;
    }
    return this;
  }
}
