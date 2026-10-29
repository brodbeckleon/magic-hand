import { clamp, dist, upperMedian } from "../geometry.ts";
import type { Hand } from "../types.ts";
import { DEFAULT_SWIPE_PARAMS, type SwipeParams } from "./params.ts";

export type SwipeEvent = "calibrated" | "next" | "prev" | "ignored_dir" | "ignored_return";

export interface HistoryEntry {
  readonly t: number;
  readonly hand: Hand;
}

/**
 * 1:1 port of the prototype's SwipeDetector (prototype/magic_hand.py). Golden fixtures generated
 * from the Python code (tests/fixtures/golden) guard the equivalence; change behaviour only together
 * with them.
 *
 * Separates deliberate swipes from explaining gestures (MHR07):
 *   - a wide movement (at least `distance` hand lengths, so independent of camera distance, MHR03)
 *     within at most `window` seconds; hand shape does not matter,
 *   - mostly horizontal,
 *   - followed by a return period of `returnTime` seconds in which movements (typically bringing
 *     the hand back) trigger nothing, not even the opposite direction.
 *
 * Robustness:
 *   - gaps without a detected hand up to `maxGap` seconds do not interrupt a swipe,
 *   - if the palm jumps faster than a hand can move (e.g. switching to the other hand), the
 *     swipe starts over.
 *
 * Next/prev refer to the mirrored view: swiping left (dx < 0) is "next", like on a phone.
 */
export class SwipeDetector {
  params: SwipeParams;

  calibrated = false;
  /** -1..1 share of the threshold reached by the current movement; sign = direction. */
  progress = 0;
  lastDx = 0;
  /** Start of the most recently triggered movement (for the reaction time). */
  onset = 0;

  private _history: HistoryEntry[] = [];
  private calibStart: number | null = null;
  private calibAnchor: [number, number] | null = null;
  private blockedUntil = 0;
  /** End of the return period, null = none active. */
  private returnUntil: number | null = null;
  private lastSeen = -Infinity;

  constructor(params: Partial<SwipeParams> = {}) {
    this.params = { ...DEFAULT_SWIPE_PARAMS, ...params };
    this.resetCalibration();
  }

  /** Palm positions of the current movement, oldest first (the overlay draws them as a trail). */
  get history(): readonly HistoryEntry[] {
    return this._history;
  }

  setParams(patch: Partial<SwipeParams>): void {
    this.params = { ...this.params, ...patch };
  }

  resetCalibration(): void {
    this.calibrated = false;
    this._history = [];
    this.calibStart = null;
    this.calibAnchor = null;
    this.blockedUntil = 0;
    this.returnUntil = null;
    this.lastSeen = -Infinity;
    this.progress = 0;
    this.lastDx = 0;
    this.onset = 0;
  }

  /** Marks the detector as calibrated without the hold-still step (e.g. armed by a palm claim). */
  forceCalibrated(t: number): void {
    this.calibrated = true;
    this.calibStart = null;
    this.blockedUntil = Math.max(this.blockedUntil, t + 0.5);
    this._history = [];
  }

  /** Starts a return period, e.g. because the other hand just triggered (shared cooldown). */
  enterReturn(t: number): void {
    this.returnUntil = t + this.params.returnTime;
    this._history = [];
    this.progress = 0;
  }

  isBlocked(t: number): boolean {
    return t < this.blockedUntil;
  }

  isReturning(t: number): boolean {
    return this.returnUntil !== null && t < this.returnUntil;
  }

  /** Seconds left in the return period, 0 if none. */
  returnRemaining(t: number): number {
    return this.isReturning(t) ? this.returnUntil! - t : 0;
  }

  calibProgress(t: number): number {
    if (this.calibrated || this.calibStart === null) return 0;
    return Math.min(1, (t - this.calibStart) / this.params.calibTime);
  }

  update(t: number, hand: Hand | null): SwipeEvent | null {
    const p = this.params;
    this.progress = 0;
    if (this.returnUntil !== null && t >= this.returnUntil) {
      this.returnUntil = null;
      this._history = []; // do not carry the return movement into the next swipe
    }
    if (hand === null) {
      if (t - this.lastSeen > p.maxGap) {
        this._history = [];
        this.calibStart = null;
      }
      return null;
    }
    this.lastSeen = t;

    if (!this.calibrated) return this.calibrate(t, hand);

    if (this.isBlocked(t)) {
      this._history = [];
      return null;
    }

    const prevEntry = this._history[this._history.length - 1];
    if (prevEntry) {
      const prev = prevEntry.hand;
      const allowed = Math.max(p.maxJump, p.maxSpeed * (t - prevEntry.t)) * prev.scale;
      if (dist(hand.cx, hand.cy, prev.cx, prev.cy) > allowed) this._history = [];
    }

    this._history.push({ t, hand });
    let drop = 0;
    while (t - this._history[drop]!.t > p.window) drop++;
    if (drop) this._history.splice(0, drop);
    if (this._history.length < 3) return null;

    const first = this._history[0]!.hand;
    const dx = hand.cx - first.cx;
    const dy = hand.cy - first.cy;
    const ref = upperMedian(this._history.map((e) => e.hand.scale));
    const threshold = p.distance * ref;
    this.progress = clamp(dx / threshold, -1, 1);

    if (Math.hypot(dx, dy) < threshold) return null;

    const swipe = this._history;
    this._history = [];
    this.progress = 0;
    if (this.isReturning(t)) return "ignored_return";
    if (Math.abs(dy) > p.maxSlope * Math.abs(dx)) {
      this.blockedUntil = t + 0.3;
      return "ignored_dir";
    }
    this.returnUntil = t + p.returnTime;
    this.lastDx = dx / ref;
    this.onset = SwipeDetector.findOnset(swipe, threshold);
    return dx < 0 ? "next" : "prev"; // swipe left = next slide
  }

  private calibrate(t: number, hand: Hand): SwipeEvent | null {
    const p = this.params;
    if (
      this.calibStart === null ||
      dist(hand.cx, hand.cy, this.calibAnchor![0], this.calibAnchor![1]) > p.calibStill * hand.scale
    ) {
      this.calibStart = t;
      this.calibAnchor = [hand.cx, hand.cy];
      return null;
    }
    if (t - this.calibStart >= p.calibTime) {
      this.calibrated = true;
      this.blockedUntil = t + 0.5;
      return "calibrated";
    }
    return null;
  }

  /** Last frame before the hand noticeably (10 % of the threshold) started to move. */
  private static findOnset(swipe: readonly HistoryEntry[], threshold: number): number {
    const h0 = swipe[0]!.hand;
    for (let i = 1; i < swipe.length; i++) {
      const h = swipe[i]!.hand;
      if (Math.hypot(h.cx - h0.cx, h.cy - h0.cy) > 0.1 * threshold) return swipe[i - 1]!.t;
    }
    return swipe[0]!.t;
  }
}
