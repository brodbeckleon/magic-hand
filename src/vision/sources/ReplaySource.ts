import type { FrameObs } from "../../core/types.ts";
import type { FrameMeta, LandmarkSource } from "./types.ts";

export interface ReplayOptions {
  /** Playback speed; 1 = real time. Frame times are not changed by the speed. */
  speed?: number;
  /** Shift frame times onto the live clock (needed when keystroke latency is measured). */
  retime?: boolean;
  onDone?: () => void;
}

/** Plays recorded or synthetic observations with their original timing. */
export class ReplaySource implements LandmarkSource {
  private timer = 0;
  private stopped = false;
  private readonly frames: readonly FrameObs[];
  private readonly opts: ReplayOptions;

  constructor(frames: readonly FrameObs[], opts: ReplayOptions = {}) {
    this.frames = frames;
    this.opts = opts;
  }

  start(onFrame: (frame: FrameObs, meta: FrameMeta) => void): void {
    const { speed = 1, retime = false, onDone } = this.opts;
    if (!this.frames.length) return onDone?.();
    const t0 = this.frames[0]!.t;
    const wall0 = performance.now();
    let i = 0;
    const tick = () => {
      if (this.stopped) return;
      const elapsed = ((performance.now() - wall0) / 1000) * speed;
      while (i < this.frames.length && this.frames[i]!.t - t0 <= elapsed) {
        const f = this.frames[i++]!;
        const t = retime ? wall0 / 1000 + (f.t - t0) : f.t;
        onFrame({ ...f, t }, { captureTime: retime ? t : performance.now() / 1000, inferenceMs: 0 });
      }
      if (i >= this.frames.length) return onDone?.();
      const next = (this.frames[i]!.t - t0 - elapsed) / speed;
      this.timer = window.setTimeout(tick, Math.max(0, next * 1000));
    };
    tick();
  }

  stop(): void {
    this.stopped = true;
    window.clearTimeout(this.timer);
  }
}
