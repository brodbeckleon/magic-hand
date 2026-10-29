// Synthetic hand traces for tests (TS twin of the builder in prototype/tools/gen_golden.py).
import type { Hand } from "../../src/core/types.ts";

export interface Frame {
  t: number;
  hand: Hand | null;
}

export class TraceBuilder {
  frames: Frame[] = [];
  private t: number;
  private readonly dt: number;
  x = 320;
  y = 240;
  scale = 40;

  constructor(fps = 30, t0 = 10) {
    this.dt = 1 / fps;
    this.t = t0;
  }

  private emit(present = true): void {
    this.frames.push({ t: this.t, hand: present ? { cx: this.x, cy: this.y, scale: this.scale } : null });
    this.t += this.dt;
  }

  at(x: number, y: number, scale = this.scale): this {
    this.x = x;
    this.y = y;
    this.scale = scale;
    return this;
  }

  hold(seconds: number): this {
    for (let i = 0; i < Math.round(seconds / this.dt); i++) this.emit();
    return this;
  }

  move(dx: number, dy: number, seconds: number): this {
    const n = Math.max(1, Math.round(seconds / this.dt));
    const x0 = this.x;
    const y0 = this.y;
    for (let i = 1; i <= n; i++) {
      this.x = x0 + (dx * i) / n;
      this.y = y0 + (dy * i) / n;
      this.emit();
    }
    return this;
  }

  gap(seconds: number): this {
    for (let i = 0; i < Math.round(seconds / this.dt); i++) this.emit(false);
    return this;
  }

  /** Calibration (hold still) plus the block after it. */
  calibrated(): this {
    return this.hold(1.2).hold(0.6);
  }
}

/** Applies an affine map to every hand in a trace: translate, then scale around the origin. */
export function transform(frames: Frame[], k: number, tx: number, ty: number): Frame[] {
  return frames.map(({ t, hand }) => ({
    t,
    hand: hand && { cx: hand.cx * k + tx, cy: hand.cy * k + ty, scale: hand.scale * k },
  }));
}
