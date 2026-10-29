import type { Hand, Landmark, PoseObs, Side } from "../types.ts";
import type { Rect } from "../zone/Zone.ts";

/** MediaPipe pose indices for the person's own left/right arm. */
export const ARM: Record<Side, { shoulder: number; elbow: number; wrist: number }> = {
  left: { shoulder: 11, elbow: 13, wrist: 15 },
  right: { shoulder: 12, elbow: 14, wrist: 16 },
};

/** Presenters whose shoulders are narrower than this (in pixels) count as far away (~2 m+ at 640 px). */
export const FAR_SHOULDER_PX = 100;
/** Hands smaller than this (wrist -> middle MCP, pixels) are hard for the hand model. */
export const SMALL_HAND_PX = 18;
/** Typical hand length (wrist -> middle finger MCP) relative to the shoulder width. */
export const DEFAULT_HAND_RATIO = 0.24;

const visible = (l: Landmark & { visibility?: number } | undefined, min = 0.6): l is Landmark =>
  !!l && (l.visibility ?? 1) >= min;

export function shoulderPx(pose: PoseObs, width: number, height: number): number | null {
  const l = pose.landmarks[11];
  const r = pose.landmarks[12];
  if (!visible(l, 0.5) || !visible(r, 0.5)) return null;
  return Math.hypot((l.x - r.x) * width, (l.y - r.y) * height);
}

/**
 * Estimated palm centre: a bit beyond the wrist along the forearm (elbow -> wrist), in normalised
 * source coordinates. Null if the wrist is not clearly visible.
 */
export function palmFromPose(pose: PoseObs, side: Side, width: number, height: number, handRatio = DEFAULT_HAND_RATIO): { x: number; y: number; sizePx: number } | null {
  const arm = ARM[side];
  const w = pose.landmarks[arm.wrist];
  const e = pose.landmarks[arm.elbow];
  const sh = shoulderPx(pose, width, height);
  if (!visible(w) || sh === null) return null;
  const sizePx = handRatio * sh;
  let dx = 0;
  let dy = 0;
  if (visible(e, 0.5)) {
    const fx = (w.x - e.x) * width;
    const fy = (w.y - e.y) * height;
    const len = Math.hypot(fx, fy) || 1;
    dx = (fx / len) * 0.5 * sizePx;
    dy = (fy / len) * 0.5 * sizePx;
  }
  return { x: w.x + dx / width, y: w.y + dy / height, sizePx };
}

/** A "hand" from the pose alone (mirrored pixels like handFeatures), for far-away presenters. */
export function poseHand(pose: PoseObs, side: Side, width: number, height: number, handRatio = DEFAULT_HAND_RATIO): Hand | null {
  const p = palmFromPose(pose, side, width, height, handRatio);
  if (!p) return null;
  return { cx: (1 - p.x) * width, cy: p.y * height, scale: Math.max(p.sizePx, 1) };
}

/**
 * Square region around a wrist where the hand must be, for running the hand model on an enlarged
 * crop (far away the palm detector misses tiny hands in the full picture). Normalised source rect.
 */
export function wristCrop(pose: PoseObs, side: Side, width: number, height: number, handRatio = DEFAULT_HAND_RATIO): Rect | null {
  const p = palmFromPose(pose, side, width, height, handRatio);
  if (!p) return null;
  const sidePx = Math.min(Math.max(p.sizePx * 4.5, 48), width, height);
  const w = sidePx / width;
  const h = sidePx / height;
  // Shift (not shrink) into the frame so the crop stays square.
  return { x: Math.min(1 - w, Math.max(0, p.x - w / 2)), y: Math.min(1 - h, Math.max(0, p.y - h / 2)), w, h };
}

/** Learns a person's hand-to-shoulder ratio whenever both a real hand and their pose are visible. */
export class HandRatio {
  value = DEFAULT_HAND_RATIO;
  private n = 0;

  observe(handScalePx: number, shoulder: number): void {
    if (shoulder <= 0) return;
    const r = handScalePx / shoulder;
    if (r < 0.1 || r > 0.5) return; // implausible: wrong hand/pose pairing or a foreshortened hand
    this.n = Math.min(this.n + 1, 30);
    this.value += (r - this.value) / this.n;
  }
}
