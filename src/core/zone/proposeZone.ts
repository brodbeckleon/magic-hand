import type { PoseObs } from "../types.ts";
import { clampRect, union, type Rect } from "./Zone.ts";

const VISIBLE = 0.5;
const L_SHOULDER = 11;
const R_SHOULDER = 12;

/** Bounding box of a pose's visible landmarks plus its shoulder width (all normalised). */
export function poseBox(pose: PoseObs): { box: Rect; shoulder: number } | null {
  const pts = pose.landmarks.filter((l) => (l.visibility ?? 1) >= VISIBLE);
  if (pts.length < 5) return null;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const ls = pose.landmarks[L_SHOULDER];
  const rs = pose.landmarks[R_SHOULDER];
  const shoulder = ls && rs ? Math.hypot(ls.x - rs.x, ls.y - rs.y) : (Math.max(...xs) - x) / 2;
  return { box: { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }, shoulder };
}

/**
 * Presenter zone from the people seen during the zone step: the union of their bodies, widened by
 * 1.5 shoulder widths on each side so a full swipe still fits, raised by one shoulder width for arm
 * reach above the head, and extended down to the bottom of the frame (hands often go below a
 * seated presenter's visible body). Returns null if nobody was seen.
 */
export function proposeZone(observations: readonly (readonly PoseObs[])[]): Rect | null {
  let zone: Rect | null = null;
  const shoulders: number[] = [];
  for (const poses of observations) {
    for (const p of poses) {
      const b = poseBox(p);
      if (!b) continue;
      zone = zone ? union(zone, b.box) : b.box;
      shoulders.push(b.shoulder);
    }
  }
  if (!zone) return null;
  shoulders.sort((a, b) => a - b);
  const s = shoulders[Math.floor(shoulders.length / 2)]!;
  const x = zone.x - 1.5 * s;
  const y = zone.y - 1.0 * s;
  return clampRect({ x, y, w: zone.w + 3 * s, h: 1 - y });
}
