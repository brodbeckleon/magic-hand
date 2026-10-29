import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { localIsoTimestamp, toCsv, type LogEntry } from "../../core/log/csv.ts";
import { GesturePipeline, type PipelineEvent, type PipelineSnapshot } from "../../core/pipeline/GesturePipeline.ts";
import type { FrameObs } from "../../core/types.ts";
import { platform } from "../../platform/index.ts";
import { classifyCameraError, closeCamera, openCamera } from "../../vision/camera.ts";
import { createHandLandmarker, type Delegate } from "../../vision/landmarkers.ts";
import { LiveSource } from "../../vision/sources/LiveSource.ts";
import type { FrameMeta, LandmarkSource } from "../../vision/sources/types.ts";
import { useEngine, type UiEvent, type UiEventKind } from "../state/engine.ts";
import { useSettings, type Settings } from "../state/settings.ts";
import { FrameBus } from "./FrameBus.ts";

const clock = () => new Date().toLocaleTimeString("de-CH", { hour12: false });

/**
 * Owns the camera, the landmark source and the gesture pipeline; turns triggers into keystrokes
 * and keeps the event log (in memory only, exported on request).
 */
export class Engine {
  readonly pipeline = new GesturePipeline();
  readonly frames = new FrameBus<PipelineSnapshot>();
  /** Fires for every event that should be visualised (arrow flash, toasts). */
  readonly events = new FrameBus<UiEvent>();
  readonly log: LogEntry[] = [];

  private stream: MediaStream | null = null;
  private landmarker: Promise<{ landmarker: HandLandmarker; delegate: Delegate }> | null = null;
  private source: LandmarkSource | null = null;
  private nextEventId = 1;
  private fps = 0;
  private lastFrameAt = 0;
  private lastStatsAt = 0;
  private unsubscribeSettings: (() => void) | null = null;
  private generation = 0;

  /** Opens the camera into `video` and starts detection. Safe to call again after stop(). */
  async start(video: HTMLVideoElement): Promise<void> {
    const gen = ++this.generation;
    this.followSettings();
    useEngine.getState().set({ status: { kind: "starting" } });
    try {
      // Load the model while the camera starts; the preview shows as soon as the camera is ready.
      this.landmarker ??= createHandLandmarker(2, useSettings.getState().delegate);
      this.landmarker.catch(() => undefined);
      const stream = await openCamera();
      if (gen !== this.generation) return closeCamera(stream);
      this.stream = stream;
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      useEngine.getState().set({ status: { kind: "loading" } });
      const hands = await this.landmarker;
      if (gen !== this.generation) return;
      useEngine.getState().set({ delegate: hands.delegate });
      this.source = new LiveSource(video, hands.landmarker);
      this.useSource(this.source);
      useEngine.getState().set({ status: { kind: "live" } });
    } catch (err) {
      if (!(err instanceof DOMException)) this.landmarker = null; // let a retry load the model again
      if (gen !== this.generation) return;
      const isCamera = err instanceof DOMException;
      useEngine.getState().set({ status: { kind: "error", error: isCamera ? classifyCameraError(err) : "model" } });
      console.error(err);
    }
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
    this.source?.stop();
    this.source = null;
    closeCamera(this.stream);
    this.stream = null;
    this.unsubscribeSettings?.();
    this.unsubscribeSettings = null;
    useEngine.getState().set({ status: { kind: "idle" } });
  }

  dispose(): void {
    this.stop();
    void this.landmarker?.then((h) => h.landmarker.close(), () => undefined);
    this.landmarker = null;
  }

  togglePause(): void {
    const paused = !useEngine.getState().paused;
    useEngine.getState().set({ paused });
    this.addLog({ ereignis: paused ? "pause" : "fortgesetzt" });
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

  private followSettings(): void {
    if (this.unsubscribeSettings) return;
    this.applySettings(useSettings.getState());
    this.unsubscribeSettings = useSettings.subscribe((s) => this.applySettings(s));
  }

  private applySettings(s: Settings): void {
    this.pipeline.updateSettings({ swipe: s.swipe, reverse: s.reverse, preferredHand: s.preferredHand });
  }

  private onFrame(frame: FrameObs, meta: FrameMeta): void {
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
    const { dryRun, keyMapping } = useSettings.getState();
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
    if (dryRun) return finish();
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
