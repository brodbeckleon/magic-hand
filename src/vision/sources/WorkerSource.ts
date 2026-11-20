import type { FrameObs } from "../../core/types.ts";
import { cropRect, FULL_FRAME, pixelCrop, type Rect } from "../../core/zone/Zone.ts";
import type { VisionBackend } from "../backend.ts";
import { due, nextPeriod } from "../../core/pipeline/governor.ts";
import { workerTicker, type Ticker } from "./clock.ts";
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
  /** Frames the camera delivered (video-frame callbacks). */
  cameraFrames: number;
  /** Frames sent for analysis. */
  analysed: number;
  /** Camera frames dropped because the analysis was still busy with earlier ones. */
  dropped: number;
  /** Camera frames not analysed on purpose: the analysis rate was lowered (nobody, no hand). */
  skipped: number;
  /** Frames the watchdog sent because video-frame callbacks had stopped (window not painted). */
  pumped: number;
  handMs: number;
  poseMs: number;
  faceMs: number;
  cropMs: number;
  /** Capture -> result, ms. */
  pipelineMs: number;
  /** Sum of the model times of all results so far, ms (average = modelMsTotal / results). */
  modelMsTotal: number;
  results: number;
  /** Model time of the newest result (only the models that ran on that frame), ms. */
  lastModelMs: number;
}

/**
 * Frames in flight at once. The worker analyses one and has the next waiting: with only one, a
 * result that came back just after a camera frame waited for the following one, and an analysis
 * of 35 ms at 30 fps gave 15 fps instead of ~28. The main-thread fallback runs one at a time.
 */
const WORKER_IN_FLIGHT = 2;

/**
 * Watchdog. A window that is not painted (the hidden bar, a window behind a full-screen
 * presentation on some systems) gets no video-frame callbacks, and the gestures would stop. A clock
 * worker ticks every PUMP_INTERVAL_MS; once no callback came for PUMP_AFTER_MS, its ticks take
 * over until callbacks resume.
 */
export const PUMP_INTERVAL_MS = 33;
export const PUMP_AFTER_MS = 500;

export interface WorkerSourceOptions {
  /** Clock for the watchdog (tests pass a fake one). */
  ticker?: () => Ticker;
  /** Least time between analysed frames, s (0 = every camera frame); the adaptive analysis rate. */
  minInterval?: () => number;
}

/**
 * Feeds camera frames to the vision backend (worker, or main thread as fallback): crops the presenter zone straight from the <video>
 * (only that part is ever analysed, MHR08), keeps at most two frames in flight and drops the rest.
 * Frames come from video-frame callbacks, or from the watchdog clock while those have stopped.
 */
export class WorkerSource implements LandmarkSource {
  private running = false;
  private inFlight = 0;
  private handle = 0;
  private lastTs = -1;
  private lastCrop = "";
  /** Main-thread fallback: no new frame before this time, so the UI gets a turn. */
  private nextAllowed = 0;
  /** performance.now() of the last video-frame callback. */
  private lastCallback = 0;
  private ticker: Ticker | null = null;
  private onFrame: ((frame: FrameObs, meta: FrameMeta) => void) | null = null;
  readonly stats: WorkerStats = { cameraFrames: 0, analysed: 0, dropped: 0, skipped: 0, pumped: 0, handMs: 0, poseMs: 0, faceMs: 0, cropMs: 0, pipelineMs: 0, modelMsTotal: 0, results: 0, lastModelMs: 0 };
  private readonly video: HTMLVideoElement;
  private readonly worker: VisionBackend;
  private readonly needs: () => WorkerSourceNeeds;
  private readonly makeTicker: () => Ticker;
  private readonly minInterval: () => number;
  /** Capture time of the last frame sent for analysis, s. */
  private lastSent = -Infinity;
  /** The camera's frame period (smoothed time between video-frame callbacks), s. */
  private period = 1 / 30;
  private lastFrameAt = 0;

  constructor(video: HTMLVideoElement, worker: VisionBackend, needs: () => WorkerSourceNeeds, opts: WorkerSourceOptions = {}) {
    this.video = video;
    this.worker = worker;
    this.needs = needs;
    this.makeTicker = opts.ticker ?? workerTicker;
    this.minInterval = opts.minInterval ?? (() => 0);
  }

  start(onFrame: (frame: FrameObs, meta: FrameMeta) => void): void {
    this.running = true;
    this.onFrame = onFrame;
    this.lastCallback = performance.now();
    const onVideoFrame = () => {
      if (!this.running) return;
      const now = performance.now();
      if (this.lastFrameAt) this.period = nextPeriod(this.period, (now - this.lastFrameAt) / 1000);
      this.lastFrameAt = now;
      this.lastCallback = now;
      this.stats.cameraFrames++;
      this.schedule(onVideoFrame);
      this.tick(false);
    };
    this.schedule(onVideoFrame);
    this.ticker = this.makeTicker();
    this.ticker.start(PUMP_INTERVAL_MS, () => {
      if (this.running && performance.now() - this.lastCallback > PUMP_AFTER_MS) this.tick(true);
    });
  }

  /** One camera frame: crop it and send it for analysis, unless too many are in flight. */
  private tick(pumped: boolean): void {
    const onFrame = this.onFrame;
    if (!this.running || !onFrame) return;
    const v = this.video;
    if (v.readyState < 2 || !v.videoWidth) return;
    // Lower analysis rate (nobody in view, no hand): checked first, so these frames do not count
    // as dropped. Watchdog ticks are not camera frames and are not counted at all.
    if (!due(performance.now() / 1000, this.lastSent, this.minInterval(), this.period)) {
      if (!pumped) this.stats.skipped++;
      return;
    }
    if (this.inFlight >= (this.worker.inWorker ? WORKER_IN_FLIGHT : 1) || performance.now() < this.nextAllowed) {
      // A watchdog tick is not a camera frame: only frames the camera delivered count as dropped.
      if (!pumped) this.stats.dropped++;
      return;
    }
    if (pumped) this.stats.pumped++;
    this.stats.analysed++;
    this.inFlight++;
    const tCap = performance.now();
    this.lastSent = tCap / 1000;
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
        this.stats.lastModelMs = r.handMs + r.poseMs + r.faceMs + r.cropMs;
        this.stats.modelMsTotal += this.stats.lastModelMs;
        this.stats.results++;
        onFrame(
          { t: tCap / 1000, width: W, height: H, hands: r.hands, poses: r.poses, faces: r.faces },
          { captureTime: tCap / 1000, inferenceMs: r.handMs + r.poseMs + r.faceMs + r.cropMs },
        );
      })
      .catch((err) => console.error("frame failed", err))
      .finally(() => {
        this.inFlight--;
        // On the main thread (Safari < 17 fallback) inference competes with the interface:
        // pause for half the time the frame took, so the UI stays responsive.
        if (!this.worker.inWorker) this.nextAllowed = performance.now() + 0.5 * (performance.now() - tCap);
      });
  }

  stop(): void {
    this.running = false;
    this.ticker?.stop();
    this.ticker = null;
    // Each API has its own id space: cancel only with the one that issued the handle.
    if ("requestVideoFrameCallback" in this.video) this.video.cancelVideoFrameCallback(this.handle);
    else cancelAnimationFrame(this.handle);
  }

  private schedule(tick: () => void): void {
    if ("requestVideoFrameCallback" in this.video) this.handle = this.video.requestVideoFrameCallback(tick);
    else this.handle = requestAnimationFrame(tick);
  }
}
