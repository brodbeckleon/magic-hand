import type { FrameObs } from "../../core/types.ts";

export interface FrameMeta {
  /** When the frame was taken, in s on the performance clock. */
  captureTime: number;
  /** Time spent in the landmark models for this frame, in ms. */
  inferenceMs: number;
}

/** Anything that produces observations frame by frame: the camera, a recording, a test fake. */
export interface LandmarkSource {
  start(onFrame: (frame: FrameObs, meta: FrameMeta) => void): void;
  stop(): void;
}
