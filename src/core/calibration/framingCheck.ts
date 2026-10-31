import type { PoseObs } from "../types.ts";
import { poseBox } from "../zone/proposeZone.ts";

export type Check = "ok" | "low" | "high" | "unknown";

export interface FramingResult {
  light: Check;
  distance: Check;
  hand: Check;
}

export const FRAMING_LIMITS = {
  /** Mean luma 0..255 below which hands are hard to track. */
  minLuma: 60,
  maxLuma: 235,
  /** Shoulder width as a share of the frame width. */
  minShoulder: 0.07,
  maxShoulder: 0.45,
  /** Hand length in pixels at the analysed resolution. */
  minHandPx: 18,
};

/** Mean luma of an RGBA pixel buffer (e.g. a 32x24 downscaled frame). */
export function meanLuma(rgba: ArrayLike<number>): number {
  let sum = 0;
  const n = rgba.length / 4;
  for (let i = 0; i < rgba.length; i += 4) sum += 0.2126 * rgba[i]! + 0.7152 * rgba[i + 1]! + 0.0722 * rgba[i + 2]!;
  return n ? sum / n : 0;
}

/**
 * Live checks for the framing step: enough light, presenter neither too far nor too close, and a
 * hand large enough to track. "unknown" means there is nothing to judge yet (nobody in view).
 */
export function checkFraming(luma: number | null, poses: readonly PoseObs[] | null, handPx: number | null): FramingResult {
  const L = FRAMING_LIMITS;
  const light: Check = luma === null ? "unknown" : luma < L.minLuma ? "low" : luma > L.maxLuma ? "high" : "ok";
  let distance: Check = "unknown";
  const shoulders = (poses ?? []).map((p) => poseBox(p)?.shoulder).filter((s): s is number => s !== undefined);
  if (shoulders.length) {
    const s = Math.max(...shoulders); // the closest person is the presenter
    distance = s < L.minShoulder ? "low" : s > L.maxShoulder ? "high" : "ok";
  }
  const hand: Check = handPx === null ? "unknown" : handPx < L.minHandPx ? "low" : "ok";
  return { light, distance, hand };
}
