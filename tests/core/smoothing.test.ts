import type { SwipeParams } from "../../src/core/swipe/params.ts";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { HandSmoother, OneEuro } from "../../src/core/filter/OneEuro.ts";
import { DEFAULT_PIPELINE_SETTINGS, GesturePipeline } from "../../src/core/pipeline/GesturePipeline.ts";
import { toFrames } from "../support/landmarks.ts";
import { TraceBuilder, type Frame } from "../support/traces.ts";

/** Deterministic Gaussian noise (LCG + Box-Muller). */
function noise(seed = 1) {
  let s = seed;
  const u = () => ((s = (s * 1664525 + 1013904223) % 2 ** 32) + 1) / (2 ** 32 + 1);
  return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
}

const std = (v: number[]) => {
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
};

/** Adds palm jitter of `sigma` hand lengths to every frame. */
function jitter(frames: Frame[], sigma: number, seed = 1): Frame[] {
  const n = noise(seed);
  return frames.map((f) => ({ t: f.t, hand: f.hand && { ...f.hand, cx: f.hand.cx + n() * sigma * f.hand.scale, cy: f.hand.cy + n() * sigma * f.hand.scale } }));
}

describe("One Euro filter", () => {
  it("passes a constant through and starts at the first value", () => {
    const f = new OneEuro();
    expect(f.filter(0, 5)).toBe(5);
    expect(f.filter(0.1, 5)).toBe(5);
  });

  it("removes most jitter from a still hand", () => {
    const s = new HandSmoother();
    const n = noise(7);
    const raw: number[] = [];
    const out: number[] = [];
    for (let i = 0; i < 300; i++) {
      const x = 320 + n() * 3; // 3 px jitter, hand length 40 px
      raw.push(x);
      out.push(s.apply(i / 30, { cx: x, cy: 240, scale: 40 }).cx);
    }
    expect(std(out.slice(30))).toBeLessThan(0.4 * std(raw.slice(30)));
  });

  it("follows a swipe almost without lag", () => {
    const s = new HandSmoother();
    let maxLag = 0;
    for (let i = 0; i <= 30; i++) {
      const t = i / 30;
      const x = i < 10 ? 320 : Math.max(160, 320 - (i - 10) * 21); // 160 px in ~0.25 s
      maxLag = Math.max(maxLag, Math.abs(s.apply(t, { cx: x, cy: 240, scale: 40 }).cx - x));
    }
    expect(maxLag).toBeLessThan(21); // less than one frame of movement
  });

  it("lets a jump through unsmoothed (other hand taken for this one), so the detector can reject it", () => {
    const s = new HandSmoother();
    s.apply(0, { cx: 100, cy: 100, scale: 40 });
    s.apply(1 / 30, { cx: 100, cy: 100, scale: 40 });
    expect(s.apply(2 / 30, { cx: 300, cy: 100, scale: 40 }).cx).toBe(300);
  });

  it("starts over after a gap instead of sliding from the old position", () => {
    const s = new HandSmoother();
    s.apply(0, { cx: 100, cy: 100, scale: 40 });
    expect(s.apply(1, { cx: 400, cy: 100, scale: 40 }).cx).toBe(400);
  });
});

describe("pipeline with smoothing", () => {
  const run = (frames: Frame[], smoothing: boolean, swipe: Partial<SwipeParams> = {}) => {
    const p = new GesturePipeline({ ...DEFAULT_PIPELINE_SETTINGS, smoothing, swipe: { ...DEFAULT_PIPELINE_SETTINGS.swipe, ...swipe } });
    return toFrames(frames).flatMap((f) => p.step(f).events.map((e) => ({ type: e.type === "trigger" ? e.command : e.type, t: e.t })));
  };

  it("triggers the same swipe at most one frame later", () => {
    const frames = new TraceBuilder().calibrated().move(-160, 0, 0.25).hold(0.3).frames;
    const a = run(frames, false).find((e) => e.type === "next")!;
    const b = run(frames, true).find((e) => e.type === "next")!;
    expect(b.t - a.t).toBeLessThanOrEqual(1 / 30 + 1e-9);
  });

  it("changes no prototype scenario (golden traces)", () => {
    const dir = join(import.meta.dirname, "..", "fixtures", "golden");
    for (const f of readdirSync(dir)) {
      const g = JSON.parse(readFileSync(join(dir, f), "utf8")) as { frames: Frame[] };
      // Without the minimum speed, which the prototype did not have: smoothing lowers the top speed a little.
      const types = (smoothing: boolean) => run(g.frames, smoothing, { minSpeed: 0 }).map((e) => e.type);
      expect(types(true), f).toEqual(types(false));
    }
  });

  it("a jittery hand still calibrates and swipes", () => {
    const frames = jitter(new TraceBuilder().calibrated().move(-160, 0, 0.25).hold(0.3).frames, 0.12, 3);
    expect(run(frames, true).map((e) => e.type)).toEqual(["calibrated", "next"]);
  });
});
