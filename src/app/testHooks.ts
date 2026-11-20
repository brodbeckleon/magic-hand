// Test-only hooks for Playwright. Compiled in only when Vite runs in "e2e" mode; production builds
// drop this module entirely (import.meta.env.MODE is replaced at build time).
import type { FrameObs } from "../core/types.ts";
import { blockedRequests } from "../platform/networkGuard.ts";
import { ReplaySource } from "../vision/sources/ReplaySource.ts";
import type { Engine } from "./engine/Engine.ts";
import { useEngine } from "./state/engine.ts";
import { useSettings } from "./state/settings.ts";

export interface TestHooks {
  play(frames: FrameObs[]): Promise<void>;
  /** Plays frames with their own timestamps (no retiming), e.g. to jump minutes ahead. */
  playRaw(frames: FrameObs[]): Promise<void>;
  settings: typeof useSettings;
  engine: typeof useEngine;
  log(): Engine["log"];
  /** Requests the privacy guard had to block (must stay empty). */
  blocked(): string[];
  workerStats(): Engine["workerStats"];
  /**
   * Benchmark: replaces the detections of every live camera frame with a looped scene (the models
   * still run on the real frames). Poses only where the pose model ran. null = the camera's own.
   */
  scene(frames: Pick<FrameObs, "hands" | "poses">[] | null, fps?: number): void;
  /** Benchmark counters: frames analysed, skipped (lower analysis rate), dropped, model time. */
  benchStats(): BenchStats;
  /** Benchmark: fixes the analysis rate ("full" = every frame, as before the governor); null = adaptive. */
  pinRate(mode: "full" | null): void;
}

export interface BenchStats {
  analysed: number;
  skipped: number;
  dropped: number;
  pumped: number;
  modelMsTotal: number;
  results: number;
  /** Analysis mode right now (adaptive rate), or "full". */
  mode: string;
  fps: number;
}

/**
 * WebKit (the engine of the macOS app) has no fake-camera switch in Playwright: in e2e mode
 * ?camera=fake replaces the camera with an animated canvas stream.
 */
function installFakeCamera(): void {
  const canvas = Object.assign(document.createElement("canvas"), { width: 640, height: 480 });
  const ctx = canvas.getContext("2d")!;
  let n = 0;
  const draw = () => {
    ctx.fillStyle = `hsl(${(n++ * 2) % 360} 40% 30%)`;
    ctx.fillRect(0, 0, 640, 480);
    ctx.fillStyle = "white";
    ctx.fillRect(40 + (n % 560), 200, 40, 40);
    requestAnimationFrame(draw);
  };
  draw();
  const stream = canvas.captureStream(30);
  (window as unknown as { __fakeCamera: () => MediaStream }).__fakeCamera = () => stream.clone();
}

export function applyTestParams(): void {
  const params = new URLSearchParams(location.search);
  if (params.get("camera") === "fake") installFakeCamera();
  // Most tests start from a configured app; ?firstRun=1 keeps the first-run wizard.
  if (params.get("firstRun") !== "1" && !useSettings.getState().firstRunDone) useSettings.getState().update({ firstRunDone: true });
}

export function installTestHooks(engine: Engine): void {
  const hooks: TestHooks = {
    play: (frames) => new Promise((resolve) => engine.replaceSource(new ReplaySource(frames, { retime: true, onDone: resolve }))),
    playRaw: (frames) => new Promise((resolve) => engine.replaceSource(new ReplaySource(frames, { speed: 1000, onDone: resolve }))),
    settings: useSettings,
    engine: useEngine,
    log: () => engine.log,
    blocked: () => blockedRequests.slice(),
    workerStats: () => engine.workerStats,
    scene: (frames, fps = 30) => {
      if (!frames?.length) {
        engine.sceneOverride = null;
        return;
      }
      let t0: number | null = null;
      engine.sceneOverride = (f) => {
        t0 ??= f.t;
        const s = frames[Math.floor((f.t - t0) * fps) % frames.length]!;
        return { ...f, hands: s.hands, poses: f.poses ? (s.poses ?? []) : null, faces: null };
      };
    },
    benchStats: () => {
      const w = engine.workerStats;
      return {
        analysed: w?.analysed ?? 0, skipped: engine.skippedFrames, dropped: w?.dropped ?? 0, pumped: w?.pumped ?? 0,
        modelMsTotal: w?.modelMsTotal ?? 0, results: w?.results ?? 0, mode: engine.rateMode, fps: engine.analysedFps,
      };
    },
    pinRate: (mode) => engine.pinRate(mode),
  };
  (window as unknown as { __magicHand: TestHooks }).__magicHand = hooks;
}
