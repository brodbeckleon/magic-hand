import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { localIsoTimestamp, toCsv, type LogEntry } from "../../core/log/csv.ts";
import { GesturePipeline, type PipelineEvent, type PipelineSnapshot } from "../../core/pipeline/GesturePipeline.ts";
import type { FrameObs } from "../../core/types.ts";
import { platform } from "../../platform/index.ts";
import { classifyCameraError, closeCamera, openCamera } from "../../vision/camera.ts";
import { createHandLandmarker, type Delegate } from "../../vision/landmarkers.ts";
import { LiveSource } from "../../vision/sources/LiveSource.ts";
import type { FrameMeta, LandmarkSource } from "../../vision/sources/types.ts";
import { WorkerSource, type WorkerStats } from "../../vision/sources/WorkerSource.ts";
import { VisionWorker } from "../../vision/worker/VisionWorker.ts";
import { parseResolution } from "../state/schema.ts";
import { useEngine, type UiEvent, type UiEventKind } from "../state/engine.ts";
import { useSettings, type Settings } from "../state/settings.ts";
import { FrameBus } from "./FrameBus.ts";

const clock = () => new Date().toLocaleTimeString("de-CH", { hour12: false });

/**
 * Owns the camera, the landmark source and the gesture pipeline; turns triggers into keystrokes
 * and keeps the event log (in memory only, exported on request).
 *
 * The camera runs only while gesture control is on: pausing closes it (MHR08).
 */
export class Engine {
  readonly pipeline = new GesturePipeline();
  readonly frames = new FrameBus<PipelineSnapshot>();
  /** Fires for every event that should be visualised (arrow flash, toasts). */
  readonly events = new FrameBus<UiEvent>({ replay: false });
  /** Raw observations of every frame (wizards read poses from here). */
  readonly observations = new FrameBus<FrameObs>({ replay: false });
  readonly log: LogEntry[] = [];
  /** Worker timings (developer metrics); null when running on the main thread. */
  workerStats: WorkerStats | null = null;

  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private landmarker: Promise<{ landmarker: HandLandmarker; delegate: Delegate }> | null = null;
  private worker: { handle: VisionWorker; ready: Promise<Delegate> } | null = null;
  private workerFailed = false;
  private poseRequests = 0;
  private keySuppressions = 0;
  private fullFrameRequests = 0;
  private source: LandmarkSource | null = null;
  private nextEventId = 1;
  private fps = 0;
  private lastFrameAt = 0;
  private lastStatsAt = 0;
  private unsubscribeSettings: (() => void) | null = null;
  private generation = 0;
  private cameraKey = "";

  /** Opens the camera into `video` and starts detection. Safe to call again after stop(). */
  async start(video: HTMLVideoElement): Promise<void> {
    this.video = video;
    const gen = ++this.generation;
    this.followSettings();
    const settings = useSettings.getState();
    this.cameraKey = cameraKeyOf(settings);
    useEngine.getState().set({ status: { kind: "starting" }, paused: false });
    try {
      // Load the model while the camera starts; the preview shows as soon as the camera is ready.
      const vision = this.loadVision(settings.dev.delegate);
      const stream = await openCamera({
        deviceId: settings.camera.deviceId ?? undefined,
        ...parseResolution(settings.camera.resolution),
      });
      if (gen !== this.generation) return closeCamera(stream);
      this.stream = stream;
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      useEngine.getState().set({ status: { kind: "loading" } });
      const source = await vision(video);
      if (gen !== this.generation) return;
      this.source = source;
      this.useSource(source);
      useEngine.getState().set({ status: { kind: "live" } });
    } catch (err) {
      if (!(err instanceof DOMException)) {
        this.landmarker = null; // let a retry load the model again
        this.worker?.handle.terminate();
        this.worker = null;
      }
      if (gen !== this.generation) return;
      const isCamera = err instanceof DOMException;
      useEngine.getState().set({ status: { kind: "error", error: isCamera ? classifyCameraError(err) : "model" } });
      console.error(err);
    }
  }

  /**
   * Prefers the vision worker (inference off the UI thread, zone crop); falls back to the main
   * thread if workers or the model cannot start there.
   */
  private loadVision(pref: Settings["dev"]["delegate"]): (video: HTMLVideoElement) => Promise<LandmarkSource> {
    if (!this.workerFailed && typeof Worker !== "undefined") {
      if (!this.worker) {
        const handle = new VisionWorker();
        this.worker = { handle, ready: handle.init(pref, 2) };
      }
      const w = this.worker;
      w.ready.catch(() => undefined);
      return async (video) => {
        try {
          const delegate = await w.ready;
          useEngine.getState().set({ delegate, worker: true });
          const src = new WorkerSource(video, w.handle, () => ({
            zone: useSettings.getState().zone,
            pose: this.poseRequests > 0,
            fullFrame: this.fullFrameRequests > 0,
          }));
          this.workerStats = src.stats;
          return src;
        } catch (err) {
          console.warn("vision worker unavailable, using the main thread", err);
          this.workerFailed = true;
          w.handle.terminate();
          this.worker = null;
          return this.loadVision(pref)(video);
        }
      };
    }
    this.landmarker ??= createHandLandmarker(2, pref);
    this.landmarker.catch(() => undefined);
    const lm = this.landmarker;
    return async (video) => {
      const hands = await lm;
      useEngine.getState().set({ delegate: hands.delegate, worker: false });
      this.workerStats = null;
      return new LiveSource(video, hands.landmarker);
    };
  }

  /**
   * Asks for pose landmarks on every frame until the returned function is called. `fullFrame`
   * analyses the whole picture instead of the presenter zone (only for proposing a new zone).
   */
  requestPose(opts: { fullFrame?: boolean } = {}): () => void {
    this.poseRequests++;
    if (opts.fullFrame) this.fullFrameRequests++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.poseRequests--;
      if (opts.fullFrame) this.fullFrameRequests--;
    };
  }

  /** No keystrokes until the returned function is called (wizards: practice swipes). */
  suppressKeys(): () => void {
    this.keySuppressions++;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.keySuppressions--;
      }
    };
  }

  /** Feeds frames from any source (live camera, recording replay, tests). */
  useSource(source: LandmarkSource): void {
    this.followSettings();
    source.start((frame, meta) => this.onFrame(frame, meta));
  }

  /** Swaps the frame source (e.g. replaying a recording), keeping the camera open. */
  replaceSource(source: LandmarkSource): void {
    this.source?.stop();
    this.source = source;
    this.useSource(source);
  }

  stop(): void {
    this.generation++;
    this.stopCamera();
    this.unsubscribeSettings?.();
    this.unsubscribeSettings = null;
    useEngine.getState().set({ status: { kind: "idle" } });
  }

  dispose(): void {
    this.stop();
    void this.landmarker?.then((h) => h.landmarker.close(), () => undefined);
    this.landmarker = null;
    this.worker?.handle.terminate();
    this.worker = null;
  }

  /** Pause = camera off (LED off), nothing is analysed. Resume reopens it; calibration is kept. */
  setPaused(paused: boolean): void {
    if (paused === useEngine.getState().paused) return;
    if (paused) {
      this.generation++;
      this.stopCamera();
      useEngine.getState().set({ paused: true });
    } else if (this.video) {
      void this.start(this.video);
    }
    this.addLog({ ereignis: paused ? "pause" : "fortgesetzt" });
  }

  togglePause(): void {
    this.setPaused(!useEngine.getState().paused);
  }

  recalibrate(): void {
    this.pipeline.resetCalibration();
    useEngine.getState().set({ calibrated: false });
    this.addLog({ ereignis: "kalibrierung_zurueckgesetzt" });
  }

  /** The presenter swiped but nothing happened (prototype key m). */
  markMissed(): void {
    this.emit("missed");
    this.addLog({ ereignis: "verpasst" });
  }

  /** A slide changed although nobody meant to (prototype key f). */
  markFalse(): void {
    this.emit("false");
    this.addLog({ ereignis: "fehlausloesung" });
  }

  async exportCsv(extended = false): Promise<string | null> {
    const stamp = localIsoTimestamp(new Date()).replace(/[-:]/g, "").replace("T", "_").slice(0, 15);
    return platform.saveTextFile(`magic_hand_log_${stamp}.csv`, "csv", toCsv(this.log, extended));
  }

  private stopCamera(): void {
    this.source?.stop();
    this.source = null;
    closeCamera(this.stream);
    this.stream = null;
    if (this.video) this.video.srcObject = null;
  }

  private followSettings(): void {
    if (this.unsubscribeSettings) return;
    this.applySettings(useSettings.getState());
    this.unsubscribeSettings = useSettings.subscribe((s) => this.applySettings(s));
  }

  private applySettings(s: Settings): void {
    this.pipeline.updateSettings({ swipe: s.swipe, reverse: s.reverse, preferredHand: s.preferredHand });
    // A different camera or resolution needs a new stream.
    const key = cameraKeyOf(s);
    if (key !== this.cameraKey && this.stream && this.video) {
      this.cameraKey = key;
      this.generation++;
      this.stopCamera();
      void this.start(this.video);
    }
  }

  private onFrame(frame: FrameObs, meta: FrameMeta): void {
    this.observations.publish(frame);
    const { paused } = useEngine.getState();
    const { events, snapshot } = this.pipeline.step(frame, paused);
    for (const e of events) this.handle(e, meta);
    this.frames.publish(snapshot);
    this.updateStats(frame.t, meta, snapshot.calibrated);
  }

  private handle(e: PipelineEvent, meta: FrameMeta): void {
    if (e.type !== "trigger") {
      this.emit(e.type);
      this.addLog({ ereignis: e.type });
      return;
    }
    const { dev, keyMapping } = useSettings.getState();
    const wischrichtung = e.swipe === "left" ? "links" : "rechts";
    const finish = () => {
      const tKey = performance.now() / 1000;
      const reactionMs = (tKey - e.onset) * 1000;
      this.emit(e.command, { swipe: e.swipe, reactionMs });
      this.addLog({
        ereignis: "ausgeloest", richtung: e.command, wischrichtung, strecke: e.distance,
        reaktionMs: reactionMs, verarbeitungMs: (tKey - meta.captureTime) * 1000, hand: e.side,
      });
    };
    if (dev.dryRun || this.keySuppressions > 0) return finish();
    platform.sendKey(e.command, keyMapping).then(finish, (err) => {
      console.error("send_key failed", err);
      finish();
    });
  }

  private emit(kind: UiEventKind, extra: Partial<UiEvent> = {}): void {
    const ev: UiEvent = { id: this.nextEventId++, kind, clock: clock(), ...extra };
    useEngine.getState().push(ev);
    this.events.publish(ev);
  }

  private addLog(entry: Omit<LogEntry, "zeit">): void {
    this.log.push({ zeit: localIsoTimestamp(new Date()), ...entry });
  }

  private updateStats(t: number, meta: FrameMeta, calibrated: boolean): void {
    if (this.lastFrameAt) this.fps = 0.9 * this.fps + 0.1 / Math.max(t - this.lastFrameAt, 1e-6);
    this.lastFrameAt = t;
    const s = useEngine.getState();
    if (calibrated !== s.calibrated) s.set({ calibrated });
    if (t - this.lastStatsAt > 0.25) {
      this.lastStatsAt = t;
      s.set({ fps: this.fps, inferenceMs: meta.inferenceMs });
    }
  }
}

const cameraKeyOf = (s: Settings) => `${s.camera.deviceId ?? ""}|${s.camera.resolution}`;
