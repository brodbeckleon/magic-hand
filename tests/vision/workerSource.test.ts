import type { VisionBackend } from "../../src/vision/backend.ts";
import type { Ticker } from "../../src/vision/sources/clock.ts";
import { PUMP_AFTER_MS, PUMP_INTERVAL_MS, WorkerSource, type WorkerSourceNeeds } from "../../src/vision/sources/WorkerSource.ts";

/** A <video> whose frame callbacks the test fires by hand. */
class FakeVideo {
  readyState = 4;
  videoWidth = 640;
  videoHeight = 480;
  private callbacks = new Map<number, () => void>();
  private next = 1;
  requestVideoFrameCallback(fn: () => void): number {
    this.callbacks.set(this.next, fn);
    return this.next++;
  }
  cancelVideoFrameCallback(id: number): void {
    this.callbacks.delete(id);
  }
  /** Delivers one camera frame (runs the pending callbacks). */
  frame(): void {
    const fns = [...this.callbacks.values()];
    this.callbacks.clear();
    fns.forEach((fn) => fn());
  }
}

class FakeTicker implements Ticker {
  fn: (() => void) | null = null;
  ms = 0;
  stopped = false;
  start(ms: number, fn: () => void): void {
    this.ms = ms;
    this.fn = fn;
  }
  stop(): void {
    this.stopped = true;
    this.fn = null;
  }
  tick(): void {
    this.fn?.();
  }
}

const needs = (): WorkerSourceNeeds => ({ zone: null, pose: false, face: false, wristCrops: [], fullFrame: false });
const flush = () => new Promise((r) => setTimeout(r, 0));

let now = 0;
let video: FakeVideo;
let ticker: FakeTicker;
let backend: VisionBackend & { detect: ReturnType<typeof vi.fn> };
let frames: number;
let source: WorkerSource;

beforeEach(() => {
  now = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("createImageBitmap", async () => ({ close: () => undefined }));
  video = new FakeVideo();
  ticker = new FakeTicker();
  backend = {
    inWorker: true,
    init: vi.fn(),
    detect: vi.fn(async () => ({ hands: [], poses: null, faces: null, handMs: 1, poseMs: 0, faceMs: 0, cropMs: 0 })),
    reset: vi.fn(),
    setNumHands: vi.fn(),
    setNumPoses: vi.fn(),
    terminate: vi.fn(),
  };
  frames = 0;
  source = new WorkerSource(video as unknown as HTMLVideoElement, backend, needs, { ticker: () => ticker });
  source.start(() => frames++);
});

afterEach(() => {
  source.stop();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("WorkerSource watchdog pump", () => {
  it("ticks about 30 times per second while the camera runs", () => {
    expect(ticker.ms).toBe(PUMP_INTERVAL_MS);
    expect(ticker.fn).not.toBeNull();
  });

  it("stays out of the way while video-frame callbacks arrive", async () => {
    for (let i = 0; i < 20; i++) {
      now += 33;
      video.frame();
      ticker.tick();
      await flush();
    }
    expect(backend.detect).toHaveBeenCalledTimes(20);
    expect(source.stats.pumped).toBe(0);
    expect(frames).toBe(20);
  });

  it("drives the analysis once callbacks stopped for longer than 500 ms (window not painted)", async () => {
    video.frame();
    await flush();
    now += PUMP_AFTER_MS - 10;
    ticker.tick();
    await flush();
    expect(backend.detect).toHaveBeenCalledTimes(1); // not yet
    for (let i = 0; i < 10; i++) {
      now += 33;
      ticker.tick();
      await flush();
    }
    expect(source.stats.pumped).toBe(10);
    expect(frames).toBe(11);
  });

  it("hands back to the callbacks as soon as they resume", async () => {
    now += 2000;
    ticker.tick();
    await flush();
    expect(source.stats.pumped).toBe(1);
    now += 33;
    video.frame();
    await flush();
    now += 10;
    ticker.tick();
    await flush();
    expect(source.stats.pumped).toBe(1);
    expect(backend.detect).toHaveBeenCalledTimes(2);
  });

  it("keeps the in-flight limit, and its ticks are not counted as dropped camera frames", async () => {
    let release: () => void = () => undefined;
    backend.detect.mockImplementation(() => new Promise((r) => (release = () => r({ hands: [], poses: null, faces: null, handMs: 1, poseMs: 0, faceMs: 0, cropMs: 0 }))));
    now += 2000;
    for (let i = 0; i < 5; i++) {
      ticker.tick();
      await flush();
    }
    expect(backend.detect).toHaveBeenCalledTimes(2);
    expect(source.stats.dropped).toBe(0);
    release();
  });

  it("stops with the source", () => {
    source.stop();
    expect(ticker.stopped).toBe(true);
    now += 2000;
    ticker.tick();
    expect(backend.detect).not.toHaveBeenCalled();
  });
});
