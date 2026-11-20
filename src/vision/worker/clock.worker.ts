/// <reference lib="webworker" />
// Clock for WorkerSource's watchdog: posts a tick every `ms` while running. Timers in a worker keep
// firing when the window is not painted (hidden bar, covered by a full-screen presentation), where
// requestVideoFrameCallback and requestAnimationFrame stop.
import type { ClockMessage } from "../sources/clock.ts";

declare const self: DedicatedWorkerGlobalScope;

let timer: ReturnType<typeof setInterval> | null = null;

self.onmessage = (e: MessageEvent<ClockMessage>) => {
  if (timer !== null) clearInterval(timer);
  timer = e.data.run ? setInterval(() => self.postMessage(0), e.data.ms) : null;
};
