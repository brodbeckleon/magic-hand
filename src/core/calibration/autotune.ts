import { clamp } from "../geometry.ts";
import { DEFAULT_SWIPE_PARAMS, type SwipeParams } from "../swipe/params.ts";
import type { Movement } from "./practice.ts";

export const AUTOTUNE_BOUNDS = {
  distance: [1.8, 4.0],
  window: [0.35, 0.8],
  maxSlope: [0.6, 1.4],
} as const;

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export interface AutotuneResult {
  params: Pick<SwipeParams, "distance" | "window" | "maxSlope">;
  /** How many practice swipes were usable. */
  used: number;
}

/**
 * Derives swipe thresholds from the presenter's own practice swipes:
 *  - distance: 60 % of their typical swipe, so a normal swipe clears it comfortably,
 *  - window: 1.3x the time they typically need to cover that distance,
 *  - maxSlope: 1.3x their most diagonal swipe (they are not perfectly horizontal).
 * Each value stays within safe bounds; with fewer than 2 swipes the defaults are kept.
 */
export function autotune(swipes: readonly Movement[]): AutotuneResult {
  const B = AUTOTUNE_BOUNDS;
  // Same limit as the practice step: anything steeper is not a swipe.
  const usable = swipes.filter((s) => Math.abs(s.dx) > 0 && Math.abs(s.dy) <= B.maxSlope[1] * Math.abs(s.dx));
  if (usable.length < 2) {
    const { distance, window, maxSlope } = DEFAULT_SWIPE_PARAMS;
    return { params: { distance, window, maxSlope }, used: usable.length };
  }
  const distance = clamp(round(0.6 * median(usable.map((s) => Math.abs(s.dx))), 0.1), B.distance[0], B.distance[1]);
  const times = usable.map((s) => s.timeTo(distance)).filter((t): t is number => t !== null);
  const window = clamp(round(1.3 * (times.length ? median(times) : DEFAULT_SWIPE_PARAMS.window), 0.05), B.window[0], B.window[1]);
  const maxSlope = clamp(round(1.3 * Math.max(...usable.map((s) => Math.abs(s.dy / s.dx))), 0.05), B.maxSlope[0], B.maxSlope[1]);
  return { params: { distance, window, maxSlope }, used: usable.length };
}

const round = (v: number, step: number) => Number((Math.round(v / step) * step).toFixed(2));
