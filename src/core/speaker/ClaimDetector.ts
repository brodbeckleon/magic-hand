import { dist } from "../geometry.ts";
import type { Hand, Landmark, PoseObs } from "../types.ts";

const TIPS = [8, 12, 16, 20];
const PIPS = [6, 10, 14, 18];

/** All four fingers stretched: each fingertip clearly farther from the wrist than its middle joint. */
export function isOpenPalm(lms: readonly Landmark[], aspect = 4 / 3): boolean {
  const w = lms[0]!;
  const d = (a: Landmark) => Math.hypot((a.x - w.x) * aspect, a.y - w.y);
  return TIPS.every((tip, i) => d(lms[tip]!) > 1.1 * d(lms[PIPS[i]!]!));
}

/** Hand raised: wrist above the shoulders when the pose is known, otherwise fingers pointing up. */
export function isRaised(lms: readonly Landmark[], pose?: PoseObs): boolean {
  const wrist = lms[0]!;
  const ls = pose?.landmarks[11];
  const rs = pose?.landmarks[12];
  if (ls && rs && (ls.visibility ?? 1) > 0.5 && (rs.visibility ?? 1) > 0.5) return wrist.y < Math.max(ls.y, rs.y);
  return lms[12]!.y < wrist.y - 0.02; // middle fingertip above the wrist
}

export const CLAIM_TIME = 1.0;
const STILL = 0.5; // hand lengths

/**
 * "Raise an open hand for about a second" = take over as presenter. Tracks one hand: progress grows
 * while the hand is open, raised and roughly still, and resets otherwise.
 */
export class ClaimDetector {
  private start: number | null = null;
  private anchor: [number, number] | null = null;
  progress = 0;

  reset(): void {
    this.start = null;
    this.anchor = null;
    this.progress = 0;
  }

  /** Returns true once, when the claim completes. */
  update(t: number, lms: readonly Landmark[] | null, hand: Hand | null, pose?: PoseObs, aspect = 4 / 3): boolean {
    if (!lms || !hand || !isOpenPalm(lms, aspect) || !isRaised(lms, pose)) {
      this.reset();
      return false;
    }
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
