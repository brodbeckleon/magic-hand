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
  };
  (window as unknown as { __magicHand: TestHooks }).__magicHand = hooks;
}
