import type { Hand } from "../types.ts";

/** One continuous hand movement, measured in hand lengths. */
export interface Movement {
  dx: number;
  dy: number;
  /** Duration from start to stop, s. */
  duration: number;
  /** Time from the start until |dx| first reached `atDistance` hand lengths (null if never). */
  timeTo: (distance: number) => number | null;
}

const START_SPEED = 3; // hand lengths / s
const STOP_SPEED = 1.2;
const STOP_HOLD = 0.12; // s below STOP_SPEED that ends a movement
const MIN_DX = 1.0; // hand lengths; smaller movements are fidgeting

/**
 * Splits a stream of palm positions into movements (start when the hand speeds up, end when it
 * comes to rest) so the practice swipes can be measured in full, not just up to a threshold.
 */
export class MovementSegmenter {
  private prev: { t: number; hand: Hand } | null = null;
  private current: { t: number; hand: Hand }[] | null = null;
  private slowSince: number | null = null;

  /** Feeds one frame; returns a movement when one just ended. */
  update(t: number, hand: Hand | null): Movement | null {
    if (!hand) {
      const done = this.finish();
      this.prev = null;
      return done;
    }
    const prev = this.prev;
    this.prev = { t, hand };
    if (!prev || t <= prev.t) return null;
    const speed = Math.hypot(hand.cx - prev.hand.cx, hand.cy - prev.hand.cy) / hand.scale / (t - prev.t);

    if (!this.current) {
      if (speed >= START_SPEED) this.current = [prev, { t, hand }];
      return null;
    }
    this.current.push({ t, hand });
    if (speed < STOP_SPEED) {
      this.slowSince ??= t;
      if (t - this.slowSince >= STOP_HOLD) return this.finish();
    } else {
      this.slowSince = null;
    }
    return null;
  }

  private finish(): Movement | null {
    const pts = this.current;
    this.current = null;
    this.slowSince = null;
    if (!pts || pts.length < 3) return null;
    const a = pts[0]!;
    const b = pts[pts.length - 1]!;
    const scales = pts.map((p) => p.hand.scale).sort((x, y) => x - y);
    const scale = scales[Math.floor(scales.length / 2)]!;
    const dx = (b.hand.cx - a.hand.cx) / scale;
    const dy = (b.hand.cy - a.hand.cy) / scale;
    if (Math.abs(dx) < MIN_DX) return null;
    return {
      dx,
      dy,
      duration: b.t - a.t,
      timeTo: (distance) => {
        for (const p of pts) if (Math.abs(p.hand.cx - a.hand.cx) / scale >= distance) return p.t - a.t;
        return null;
      },
    };
  }
}
