import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { localIsoTimestamp, toCsv, type LogEntry } from "../../core/log/csv.ts";
import { GesturePipeline, type PipelineEvent, type PipelineSnapshot } from "../../core/pipeline/GesturePipeline.ts";
import type { FrameObs } from "../../core/types.ts";
import { platform } from "../../platform/index.ts";
import { classifyCameraError, closeCamera, openCamera } from "../../vision/camera.ts";
import { createHandLandmarker, HANDEDNESS_SWAP, type Delegate } from "../../vision/landmarkers.ts";
import { schedule } from "../../core/pipeline/scheduler.ts";
import type { Rect } from "../../core/zone/Zone.ts";
import { ReplaySource } from "../../vision/sources/ReplaySource.ts";
import { LiveSource } from "../../vision/sources/LiveSource.ts";
import type { FrameMeta, LandmarkSource } from "../../vision/sources/types.ts";
import { WorkerSource, type WorkerStats } from "../../vision/sources/WorkerSource.ts";
import { VisionWorker } from "../../vision/worker/VisionWorker.ts";
import { parseResolution } from "../state/schema.ts";
import { encodeFrame, parseRecording, SCHEMA, type RecHeader } from "../../core/recording/format.ts";
import { diffEvents, toReplayEvent, type ReplayEvent } from "../../core/recording/replay.ts";
import { Recorder, readRecordingFile } from "../debug/Recorder.ts";
import { useDev } from "../state/dev.ts";
import { useEngine, type UiEvent, type UiEventKind } from "../state/engine.ts";
import { useSettings, type Settings } from "../state/settings.ts";
import { playCue } from "../sound.ts";
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
  private recorder: Recorder | null = null;
  private recordTimer = 0;
  private frameIndex = 0;
  private lastT = 0;
  private lastSize = { w: 640, h: 480 };
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
          const src = new WorkerSource(video, w.handle, () => this.needs());
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

  private lastPresence = performance.now() / 1000;

  /** Nobody in view for the configured time: turn the camera off (privacy, battery). */
  private checkIdle(t: number, present: boolean): void {
    if (present || this.lastPresence > t) this.lastPresence = t;
    const minutes = useSettings.getState().autoPauseMinutes;
    if (minutes > 0 && !useEngine.getState().paused && t - this.lastPresence > minutes * 60) {
      this.setPaused(true, "idle");
    }
  }

  private cue(events: PipelineEvent[]): void {
    for (const e of events) {
      if (e.type === "trigger") playCue(e.command);
      else if (e.type === "speaker" && e.person !== null) playCue("speaker");
    }
  }

  private anyFar = false;
  private wristCrops: Rect[] = [];
  private numHands = 2;
  private fewPeopleSince = 0;

  /**
   * MediaPipe re-runs palm detection on every frame while fewer hands are tracked than numHands, so
   * we ask for 4 only while several people are in view (back to 2 after 3 s with one person).
   */
  private adaptNumHands(t: number): void {
    const worker = this.worker?.handle;
    if (!worker) return;
    if (this.personCount >= 2) {
      this.fewPeopleSince = t;
      if (this.numHands !== 4) worker.setNumHands((this.numHands = 4));
    } else if (this.numHands !== 2 && t - this.fewPeopleSince > 3) {
      worker.setNumHands((this.numHands = 2));
    }
  }

  private scheduleFrame = 0;
  private loadMs = 0;
  private personCount = 0;

  /** What the next camera frame should be analysed for (zone crop, which models). */
  private needs() {
    const s = useSettings.getState();
    const st = this.workerStats;
    if (st) this.loadMs = 0.9 * this.loadMs + 0.1 * (st.handMs + st.poseMs + st.faceMs + st.cropMs);
    const plan = schedule({
      frame: this.scheduleFrame++,
      persons: this.personCount,
      wantFace: s.speaker.mode === "auto" && s.speaker.autoSignal !== "movement",
      loadMs: this.loadMs,
      forcePose: this.poseRequests > 0,
      far: this.anyFar,
    });
    return { zone: s.zone, fullFrame: this.fullFrameRequests > 0, wristCrops: this.wristCrops, ...plan };
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
  useSource(source: LandmarkSource, followSettings = true): void {
    if (followSettings) this.followSettings();
    source.start((frame, meta) => this.onFrame(frame, meta));
  }

  /** Swaps the frame source (e.g. replaying a recording), keeping the camera open. */
  replaceSource(source: LandmarkSource, followSettings = true): void {
    this.source?.stop();
    this.source = source;
    this.useSource(source, followSettings);
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
  setPaused(paused: boolean, reason: "user" | "idle" = "user"): void {
    if (paused === useEngine.getState().paused) return;
    if (paused) {
      this.generation++;
      this.stopCamera();
      useEngine.getState().set({ paused: true, pausedReason: reason });
    } else if (this.video) {
      this.lastPresence = performance.now() / 1000;
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
    this.recorder?.write({ type: "mark", t: this.lastT, kind: "missed" });
    this.emit("missed");
    this.addLog({ ereignis: "verpasst" });
  }

  /** A slide changed although nobody meant to (prototype key f). */
  markFalse(): void {
    this.recorder?.write({ type: "mark", t: this.lastT, kind: "false" });
    this.emit("false");
    this.addLog({ ereignis: "fehlausloesung" });
  }

  async exportCsv(extended = false): Promise<string | null> {
    const stamp = localIsoTimestamp(new Date()).replace(/[-:]/g, "").replace("T", "_").slice(0, 15);
    return platform.saveTextFile(`magic_hand_log_${stamp}.csv`, "csv", toCsv(this.log, extended));
  }

  // ---- Developer recordings (landmarks only, opt-in, MHR08) ----------------------------------

  static readonly MAX_RECORDING_MS = 30 * 60 * 1000;

  get recording(): boolean {
    return this.recorder !== null;
  }

  startRecording(): void {
    if (this.recorder) return;
    const s = useSettings.getState();
    const header: RecHeader = {
      type: "header", schema: SCHEMA, app: `magic-hand ${__APP_VERSION__}`, created: localIsoTimestamp(new Date()),
      platform: navigator.userAgent, src: this.lastSize, mirror: true, handednessSwap: HANDEDNESS_SWAP,
      zone: s.zone, settings: { swipe: s.swipe, reverse: s.reverse, preferredHand: s.preferredHand, speaker: s.speaker, farAssist: s.farAssist },
    };
    this.recorder = new Recorder();
    this.recorder.write(header);
    this.frameIndex = 0;
    useDev.getState().set({ recording: { startedAt: Date.now(), seconds: 0, frames: 0 } });
    this.recordTimer = window.setInterval(() => {
      const r = this.recorder;
      const st = useDev.getState().recording;
      if (!r || !st) return;
      useDev.getState().set({ recording: { ...st, frames: r.frames, seconds: Math.round((Date.now() - st.startedAt) / 1000) } });
      if (Date.now() - st.startedAt > Engine.MAX_RECORDING_MS) void this.stopRecording(true);
    }, 500);
  }

  /** Ends the recording; `save` asks where to store it, otherwise it is discarded. */
  async stopRecording(save: boolean): Promise<string | null> {
    const r = this.recorder;
    if (!r) return null;
    this.recorder = null;
    window.clearInterval(this.recordTimer);
    useDev.getState().set({ recording: null });
    const bytes = await r.finish();
    if (!save) return null;
    const stamp = localIsoTimestamp(new Date()).replace(/[-:]/g, "").replace("T", "_").slice(0, 15);
    return platform.saveBinaryFile(`magic_hand_${stamp}.jsonl.gz`, bytes);
  }

  /**
   * Plays a recording through the live engine with its recorded settings (no keys sent) and
   * compares the outcome with the events recorded live.
   */
  async replayFile(file: File, speed = 1): Promise<void> {
    const rec = parseRecording(await readRecordingFile(file));
    const release = this.suppressKeys();
    this.unsubscribeSettings?.();
    this.unsubscribeSettings = null;
    this.pipeline.updateSettings(rec.header.settings);
    this.pipeline.resetCalibration();
    const live: ReplayEvent[] = [];
    const total = rec.frames.length;
    let done = 0;
    const progress = (finished: boolean, diff: number | null) =>
      useDev.getState().set({ replay: { name: file.name, done, total, finished, diff } });
    progress(false, null);
    this.eventTap = (e) => live.push(toReplayEvent(e));
    this.frameTap = () => ++done % 10 === 0 && progress(false, null);
    await new Promise<void>((resolve) => this.replaceSource(new ReplaySource(rec.frames, { speed, onDone: resolve }), false));
    this.eventTap = this.frameTap = null;
    release();
    progress(true, diffEvents(rec.events, live).length);
    this.pipeline.resetCalibration();
    this.followSettings();
  }

  /** After a replay: back to the live camera. */
  backToCamera(): void {
    useDev.getState().set({ replay: null });
    if (this.video) void this.start(this.video);
  }

  private eventTap: ((e: PipelineEvent) => void) | null = null;
  private frameTap: (() => void) | null = null;

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
    const patch = { swipe: s.swipe, reverse: s.reverse, preferredHand: s.preferredHand, speaker: s.speaker, farAssist: s.farAssist };
    this.pipeline.updateSettings(patch);
    this.recorder?.write({ type: "settings", t: this.lastT, patch });
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
    this.lastT = frame.t;
    this.lastSize = { w: frame.width, h: frame.height };
    this.observations.publish(frame);
    this.recorder?.write(encodeFrame(this.frameIndex++, frame));
    const { paused } = useEngine.getState();
    const { events, snapshot } = this.pipeline.step(frame, paused);
    for (const e of events) {
      this.recorder?.write({ type: "event", ...toReplayEvent(e) });
      this.eventTap?.(e);
      this.handle(e, meta);
    }
    this.frameTap?.();
    this.personCount = snapshot.persons.length;
    this.checkIdle(frame.t, snapshot.hands.length > 0 || snapshot.persons.length > 0);
    if (events.length && useSettings.getState().sound && this.keySuppressions === 0) this.cue(events);
    this.anyFar = snapshot.persons.some((p) => p.far);
    this.wristCrops = snapshot.wristCrops;
    this.adaptNumHands(frame.t);
    this.frames.publish(snapshot);
    this.updateStats(frame.t, meta, snapshot.calibrated);
  }

  private handle(e: PipelineEvent, meta: FrameMeta): void {
    if (e.type === "speaker") {
      this.emit("speaker", { person: e.person });
      this.addLog({ ereignis: "sprecher_gewechselt", person: e.person ?? undefined });
      return;
    }
    if (e.type !== "trigger") {
      this.emit(e.type, e.type === "ignored_not_speaker" ? { person: e.person } : {});
      this.addLog({ ereignis: e.type, person: e.person || undefined, hand: e.side });
      return;
    }
    const { dev, keyMapping } = useSettings.getState();
    const wischrichtung = e.swipe === "left" ? "links" : "rechts";
    const finish = () => {
      const tKey = performance.now() / 1000;
      const reactionMs = (tKey - e.onset) * 1000;
      this.emit(e.command, { swipe: e.swipe, reactionMs, detectMs: (tKey - meta.captureTime) * 1000 });
      useDev.getState().addTrigger({ detectMs: (tKey - meta.captureTime) * 1000, reactionMs });
      this.addLog({
        ereignis: "ausgeloest", richtung: e.command, wischrichtung, strecke: e.distance,
        reaktionMs: reactionMs, verarbeitungMs: (tKey - meta.captureTime) * 1000, hand: e.side,
        person: e.person || undefined, detectMs: (tKey - meta.captureTime) * 1000,
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
      const w = this.workerStats;
      useDev.getState().addSample({ fps: this.fps, handMs: w ? w.handMs : meta.inferenceMs, pipelineMs: w ? w.pipelineMs : meta.inferenceMs }, w?.dropped ?? 0);
    }
  }
}

const cameraKeyOf = (s: Settings) => `${s.camera.deviceId ?? ""}|${s.camera.resolution}`;
