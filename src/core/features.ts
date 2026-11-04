import { dist } from "./geometry.ts";
import type { Hand, Landmark } from "./types.ts";

export const WRIST = 0;
export const MIDDLE_MCP = 9;
export const PALM = [0, 5, 9, 13, 17] as const;

/**
 * Palm centre and hand length (wrist -> middle finger MCP) in pixels; x mirrored like the view.
 * `depth` = false measures the length in the image plane only, like the prototype.
 */
export function handFeatures(landmarks: readonly Landmark[], width: number, height: number, mirror = true, depth = true): Hand {
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
  // In 3D (MediaPipe's z has the scale of x): the projected length shrinks whenever the hand tilts,
  // which made small movements look like whole swipes.
  const dz = depth ? ((landmarks[WRIST]!.z ?? 0) - (landmarks[MIDDLE_MCP]!.z ?? 0)) * width : 0;
  const scale = Math.max(Math.hypot(dist(xs[WRIST]!, ys[WRIST]!, xs[MIDDLE_MCP]!, ys[MIDDLE_MCP]!), dz), 1.0);
  return { cx, cy, scale };
}

const TIPS = [8, 12, 16, 20];
const PIPS = [6, 10, 14, 18];
const MCPS = [5, 9, 13, 17];

/**
 * Open hand = the four fingers stretched, whichever way the hand is turned (palm, back or edge
 * towards the camera). In 3D, so fingers pointing at the camera still count: a stretched finger's
 * tip is clearly farther from its knuckle than its middle joint is, a curled one folds back.
 * MediaPipe's z has roughly the scale of x (frame width), so x and z get the aspect ratio.
 * The thumb does not count: it is often tucked in a relaxed open hand.
 */
export function isHandOpen(lms: readonly Landmark[], aspect = 4 / 3): boolean {
  const d = (a: Landmark, b: Landmark) => Math.hypot((a.x - b.x) * aspect, a.y - b.y, (a.z - b.z) * aspect);
  const wrist = lms[WRIST]!;
  let stretched = 0;
  for (let i = 0; i < 4; i++) {
    const mcp = lms[MCPS[i]!]!;
    const tip = lms[TIPS[i]!]!;
    const pip = lms[PIPS[i]!]!;
    // A curled finger also brings its tip back towards the wrist; both must agree.
    if (d(tip, mcp) > 1.3 * d(pip, mcp) && d(tip, wrist) > d(pip, wrist)) stretched++;
  }
  // One finger may be misdetected (motion blur, occlusion) or slightly bent.
  return stretched >= 3;
}
