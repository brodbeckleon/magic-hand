import type { Hand } from "../types.ts";

/**
 * One Euro filter (Casiez, Roussel, Vogel 2012): a low-pass filter whose cutoff rises with speed.
 * Still hands are smoothed strongly (no jitter), fast movements barely (almost no lag), which suits
 * swipes better than a fixed filter or a Kalman filter with a constant-velocity model (that one
 * overshoots when a swipe stops abruptly).
 */
export class OneEuro {
  private x: number | null = null;
  private dx = 0;
  private tPrev = 0;

  /** Cutoff at rest, Hz. */
  readonly minCutoff: number;
  /** How fast the cutoff rises with speed (Hz per unit/s). */
  readonly beta: number;
  /** Cutoff for the speed estimate, Hz. */
  readonly dCutoff: number;

  constructor(minCutoff = 1.0, beta = 1.0, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  reset(): void {
    this.x = null;
  }

  /** `scale` turns the value's units into the units beta is defined in (e.g. pixels -> hand lengths). */
  filter(t: number, value: number, scale = 1): number {
    if (this.x === null || t <= this.tPrev) {
      this.x = value;
      this.dx = 0;
      this.tPrev = t;
      return value;
    }
    const dt = t - this.tPrev;
    this.tPrev = t;
    const raw = (value - this.x) / dt;
    this.dx += alpha(this.dCutoff, dt) * (raw - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx / scale);
    this.x += alpha(cutoff, dt) * (value - this.x);
    return this.x;
  }
}

const alpha = (cutoff: number, dt: number): number => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};

/**
 * Smooths a palm position (MHR03: speed in hand lengths per second, so the filter acts the same near
 * and far). Starts over after a gap, since a swipe is restarted then anyway, and after a jump: a
 * palm that moves farther in one frame than a hand can (the other hand taken for this one) must
 * reach the swipe detector as a jump, which it rejects. Smoothed, it would look like a fast swipe.
 */
export class HandSmoother {
  // Tuned at 30 fps, 3 px jitter on a 40 px hand: about a third of the jitter remains, and a swipe is
  // at most one frame late (0.5/1.0 left 43 %, 0.5/2.0 removed no lag but kept half the jitter).
  private readonly fx = new OneEuro(0.5, 0.5);
  private readonly fy = new OneEuro(0.5, 0.5);
  private readonly fs = new OneEuro(1.0, 0);
  private last = -Infinity;
  private lastRaw: Hand | null = null;
  private readonly maxGap: number;
  private readonly maxJump: number;

  /** Same meaning as the SwipeDetector parameters (s, hand lengths per frame). */
  constructor(maxGap = 0.2, maxJump = 1.5) {
    this.maxGap = maxGap;
    this.maxJump = maxJump;
  }

  reset(): void {
    this.fx.reset();
    this.fy.reset();
    this.fs.reset();
  }

  apply(t: number, hand: Hand): Hand {
    const prev = this.lastRaw;
    const jumped = prev !== null && Math.hypot(hand.cx - prev.cx, hand.cy - prev.cy) > this.maxJump * Math.max(hand.scale, prev.scale);
    if (t - this.last > this.maxGap || jumped) this.reset();
    this.last = t;
    this.lastRaw = hand;
    const scale = this.fs.filter(t, hand.scale);
    return { cx: this.fx.filter(t, hand.cx, scale), cy: this.fy.filter(t, hand.cy, scale), scale };
  }
}
