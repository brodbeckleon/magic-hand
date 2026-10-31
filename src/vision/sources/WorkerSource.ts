import type { FrameObs } from "../../core/types.ts";
import { cropRect, FULL_FRAME, pixelCrop, type Rect } from "../../core/zone/Zone.ts";
import type { VisionBackend } from "../backend.ts";
import type { FrameMeta, LandmarkSource } from "./types.ts";

export interface WorkerSourceNeeds {
  /** Presenter zone (null = whole frame). */
  zone: Rect | null;
  /** Run the pose model on this frame. */
  pose: boolean;
  /** Run the face model on head crops (needs pose). */
  face: boolean;
  /** Wrist regions of far presenters to search for hands (full-frame normalised). */
  wristCrops: Rect[];
  /** Analyse the whole frame regardless of the zone (zone-proposal step only). */
  fullFrame: boolean;
}

export interface WorkerStats {
  dropped: number;
  handMs: number;
  poseMs: number;
  faceMs: number;
  cropMs: number;
  /** Capture -> result, ms. */
  pipelineMs: number;
}

/**
 * Feeds camera frames to the vision backend (worker, or main thread as fallback): crops the presenter zone straight from the <video>
 * (only that part is ever analysed, MHR08), keeps at most one frame in flight and drops the rest.
 */
export class WorkerSource implements LandmarkSource {
  private running = false;
  private busy = false;
  private handle = 0;
  private lastTs = -1;
  private lastCrop = "";
  /** Main-thread fallback: no new frame before this time, so the UI gets a turn. */
  private nextAllowed = 0;
  readonly stats: WorkerStats = { dropped: 0, handMs: 0, poseMs: 0, faceMs: 0, cropMs: 0, pipelineMs: 0 };
  private readonly video: HTMLVideoElement;
  private readonly worker: VisionBackend;
  private readonly needs: () => WorkerSourceNeeds;

  constructor(video: HTMLVideoElement, worker: VisionBackend, needs: () => WorkerSourceNeeds) {
    this.video = video;
    this.worker = worker;
    this.needs = needs;
  }

  start(onFrame: (frame: FrameObs, meta: FrameMeta) => void): void {
    this.running = true;
    const tick = () => {
      if (!this.running) return;
      this.schedule(tick);
      const v = this.video;
      if (v.readyState < 2 || !v.videoWidth) return;
      if (this.busy || performance.now() < this.nextAllowed) {
        this.stats.dropped++;
        return;
      }
      this.busy = true;
      const tCap = performance.now();
      const W = v.videoWidth;
      const H = v.videoHeight;
      const need = this.needs();
      const zone = need.fullFrame || !need.zone ? FULL_FRAME : need.zone;
      const px = pixelCrop(zone, W, H);
      const crop = cropRect(px, W, H);
      const key = `${px.sx},${px.sy},${px.sw},${px.sh}`;
      if (key !== this.lastCrop) {
        if (this.lastCrop) this.worker.reset();
        this.lastCrop = key;
      }
      const ts = Math.max(Math.round(tCap), this.lastTs + 1);
      this.lastTs = ts;
      createImageBitmap(v, px.sx, px.sy, px.sw, px.sh)
        .then((bitmap) => this.worker.detect({ bitmap, ts, crop, pose: need.pose, face: need.face && need.pose, wristCrops: need.wristCrops }))
        .then((r) => {
          if (!this.running) return;
          const tDone = performance.now();
          this.stats.handMs = r.handMs;
          if (r.poses) this.stats.poseMs = r.poseMs;
          if (r.faces) this.stats.faceMs = r.faceMs;
          this.stats.cropMs = r.cropMs;
          this.stats.pipelineMs = tDone - tCap;
          onFrame(
            { t: tCap / 1000, width: W, height: H, hands: r.hands, poses: r.poses, faces: r.faces },
            { captureTime: tCap / 1000, inferenceMs: r.handMs + r.poseMs + r.faceMs + r.cropMs },
          );
        })
        .catch((err) => console.error("frame failed", err))
        .finally(() => {
          this.busy = false;
          // On the main thread (Safari < 17 fallback) inference competes with the interface:
          // pause for half the time the frame took, so the UI stays responsive.
          if (!this.worker.inWorker) this.nextAllowed = performance.now() + 0.5 * (performance.now() - tCap);
        });
    };
    this.schedule(tick);
  }

  stop(): void {
    this.running = false;
    if ("cancelVideoFrameCallback" in this.video) this.video.cancelVideoFrameCallback(this.handle);
    cancelAnimationFrame(this.handle);
  }

  private schedule(tick: () => void): void {
    if ("requestVideoFrameCallback" in this.video) this.handle = this.video.requestVideoFrameCallback(tick);
    else this.handle = requestAnimationFrame(tick);
  }
}
