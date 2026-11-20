import { isHandOpen } from "../features.ts";
import { dist } from "../geometry.ts";
import type { Hand, Landmark } from "../types.ts";

const TIPS = [8, 12, 16, 20];
const PIPS = [6, 10, 14, 18];

/** All four fingers stretched: each fingertip clearly farther from the wrist than its middle joint. */
export function isOpenPalm(lms: readonly Landmark[], aspect = 4 / 3): boolean {
  const w = lms[0]!;
  const d = (a: Landmark) => Math.hypot((a.x - w.x) * aspect, a.y - w.y);
  return TIPS.every((tip, i) => d(lms[tip]!) > 1.1 * d(lms[PIPS[i]!]!));
}

/**
 * How far the middle fingertip must be above the wrist, in hand lengths (wrist to middle knuckle).
 * A stretched hand pointing straight up reaches about 1.9; 1.0 still allows a tilt of roughly 55°.
 */
export const UPRIGHT = 1.0;

/**
 * Hand upright: fingers pointing up, at any height (in front of the chest is fine; nobody has to
 * raise an arm above the shoulders). Distances are aspect-corrected, in frame heights.
 */
export function isRaised(lms: readonly Landmark[], aspect = 4 / 3): boolean {
  const wrist = lms[0]!;
  const knuckle = lms[9]!;
  const length = Math.hypot((knuckle.x - wrist.x) * aspect, knuckle.y - wrist.y);
  return length > 0 && wrist.y - lms[12]!.y >= UPRIGHT * length;
}

export const CLAIM_TIME = 1.0;
const STILL = 0.5; // hand lengths
/**
 * Frames that do not look like an open, raised hand are tolerated this long (s). On real recordings
 * a held-up open hand failed the shape check on many single frames, and resetting on each of them
 * meant the claim almost never completed.
 */
const DROPOUT = 0.3;

/**
 * "Show an open palm, fingers up, for about a second" = take over as presenter. Tracks one hand:
 * progress grows while the hand is open, upright and roughly still. It resets when the hand moves,
 * or stops looking open and upright for longer than a short dropout.
 */
export class ClaimDetector {
  private start: number | null = null;
  private anchor: [number, number] | null = null;
  private lastOk = -Infinity;
  progress = 0;

  reset(): void {
    this.start = null;
    this.anchor = null;
    this.lastOk = -Infinity;
    this.progress = 0;
  }

  /** Returns true once, when the claim completes. */
  update(t: number, lms: readonly Landmark[] | null, hand: Hand | null, aspect = 4 / 3): boolean {
    // Open: the 2D check (palm to the camera) or the 3D one (any turn, three fingers are enough).
    const ok = !!lms && !!hand && (isOpenPalm(lms, aspect) || isHandOpen(lms, aspect)) && isRaised(lms, aspect);
    if (!ok) {
      if (this.start === null || t - this.lastOk > DROPOUT) this.reset();
      return false;
    }
    this.lastOk = t;
    if (this.start === null || !this.anchor || dist(hand.cx, hand.cy, this.anchor[0], this.anchor[1]) > STILL * hand.scale) {
      this.start = t;
      this.anchor = [hand.cx, hand.cy];
    }
    this.progress = Math.min(1, (t - this.start) / CLAIM_TIME);
    if (this.progress >= 1) {
      this.reset();
      return true;
    }
    return false;
  }

  /** When the current claim started (earlier claim wins a tie). */
  get startedAt(): number | null {
    return this.start;
  }
}
