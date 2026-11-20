/** A steady tick source (WorkerSource's watchdog). */
export interface Ticker {
  start(ms: number, fn: () => void): void;
  stop(): void;
}

export type ClockMessage = { run: true; ms: number } | { run: false };

/**
 * Ticks from a small worker: its timers keep running while the window is not painted, unlike
 * requestVideoFrameCallback (and main-thread timers, which browsers throttle in the background).
 * Falls back to setInterval where workers are not available.
 */
export function workerTicker(): Ticker {
  let worker: Worker | null = null;
  let interval: ReturnType<typeof setInterval> | null = null;
  const stop = () => {
    worker?.terminate();
    worker = null;
    if (interval !== null) clearInterval(interval);
    interval = null;
  };
  return {
    start(ms, fn) {
      stop();
      if (typeof Worker !== "undefined") {
        try {
          worker = new Worker(new URL("../worker/clock.worker.ts", import.meta.url), { type: "module" });
          worker.onmessage = () => fn();
          worker.postMessage({ run: true, ms } satisfies ClockMessage);
          return;
        } catch (err) {
          console.warn("clock worker unavailable, using a timer", err);
          worker = null;
        }
      }
      interval = setInterval(fn, ms);
    },
    stop,
  };
}
