import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { toHandObs } from "../landmarkers.ts";
import type { FrameMeta, LandmarkSource } from "./types.ts";
import type { FrameObs } from "../../core/types.ts";

/** Runs the hand landmarker on every new frame of a playing <video>. */
export class LiveSource implements LandmarkSource {
  private handle = 0;
  private running = false;
  private lastTs = -1;

  private readonly video: HTMLVideoElement;
  private readonly hands: HandLandmarker;

  constructor(video: HTMLVideoElement, hands: HandLandmarker) {
    this.video = video;
    this.hands = hands;
  }

  start(onFrame: (frame: FrameObs, meta: FrameMeta) => void): void {
    this.running = true;
    const tick = () => {
      if (!this.running) return;
      const v = this.video;
      if (v.readyState >= 2 && v.videoWidth > 0) {
        const tCap = performance.now();
        // MediaPipe needs strictly increasing timestamps.
        const ts = Math.max(Math.round(tCap), this.lastTs + 1);
        this.lastTs = ts;
        const result = this.hands.detectForVideo(v, ts);
        const inferenceMs = performance.now() - tCap;
        onFrame(
          { t: tCap / 1000, width: v.videoWidth, height: v.videoHeight, hands: toHandObs(result) },
          { captureTime: tCap / 1000, inferenceMs },
        );
      }
      this.schedule(tick);
    };
    this.schedule(tick);
  }

  stop(): void {
    this.running = false;
    if ("cancelVideoFrameCallback" in this.video) this.video.cancelVideoFrameCallback(this.handle);
    cancelAnimationFrame(this.handle);
  }

  private schedule(tick: () => void): void {
    // requestVideoFrameCallback fires once per new camera frame; rAF is the fallback.
    if ("requestVideoFrameCallback" in this.video) this.handle = this.video.requestVideoFrameCallback(tick);
    else this.handle = requestAnimationFrame(tick);
  }
}
