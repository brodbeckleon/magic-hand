// Test-only hooks for Playwright. Compiled in only when Vite runs in "e2e" mode; production builds
// drop this module entirely (import.meta.env.MODE is replaced at build time).
import type { FrameObs } from "../core/types.ts";
import { ReplaySource } from "../vision/sources/ReplaySource.ts";
import type { Engine } from "./engine/Engine.ts";
import { useEngine } from "./state/engine.ts";
import { useSettings } from "./state/settings.ts";

export interface TestHooks {
  play(frames: FrameObs[]): Promise<void>;
  settings: typeof useSettings;
  engine: typeof useEngine;
  log(): Engine["log"];
}

/** Applied before the engine starts: `?delegate=CPU` forces the CPU delegate in tests. */
export function applyTestParams(): void {
  const delegate = new URLSearchParams(location.search).get("delegate");
  if (delegate === "CPU" || delegate === "GPU") useSettings.getState().update({ delegate });
}

export function installTestHooks(engine: Engine): void {
  const hooks: TestHooks = {
    play: (frames) => new Promise((resolve) => engine.replaceSource(new ReplaySource(frames, { retime: true, onDone: resolve }))),
    settings: useSettings,
    engine: useEngine,
    log: () => engine.log,
  };
  (window as unknown as { __magicHand: TestHooks }).__magicHand = hooks;
}
