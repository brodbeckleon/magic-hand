import { dist } from "./geometry.ts";
import type { Hand, Landmark } from "./types.ts";

export const WRIST = 0;
export const MIDDLE_MCP = 9;
export const PALM = [0, 5, 9, 13, 17] as const;

/** Palm centre and hand length (wrist -> middle finger MCP) in pixels; x mirrored like the view. */
export function handFeatures(landmarks: readonly Landmark[], width: number, height: number, mirror = true): Hand {
  const xs = landmarks.map((lm) => (mirror ? 1 - lm.x : lm.x) * width);
  const ys = landmarks.map((lm) => lm.y * height);
  let cx = 0;
  let cy = 0;
  for (const i of PALM) {
    cx += xs[i]!;
    cy += ys[i]!;
  }
  cx /= PALM.length;
  cy /= PALM.length;
  const scale = Math.max(dist(xs[WRIST]!, ys[WRIST]!, xs[MIDDLE_MCP]!, ys[MIDDLE_MCP]!), 1.0);
  return { cx, cy, scale };
}
