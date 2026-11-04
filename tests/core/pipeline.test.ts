import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { GesturePipeline, DEFAULT_PIPELINE_SETTINGS } from "../../src/core/pipeline/GesturePipeline.ts";
import { PROTOTYPE_SWIPE_PARAMS, type SwipeParams } from "../../src/core/swipe/params.ts";
import type { FrameObs, Hand, Side } from "../../src/core/types.ts";
import { landmarksFor, toFrames } from "../support/landmarks.ts";
import { TraceBuilder } from "../support/traces.ts";

const goldenDir = join(import.meta.dirname, "..", "fixtures", "golden");
const golden = readdirSync(goldenDir).map((f) => JSON.parse(readFileSync(join(goldenDir, f), "utf8")) as {
  name: string; frames: { t: number; hand: Hand | null }[]; expected: { event: string | null }[];
});

const typeOf = (e: { type: string; command?: string }) => (e.type === "trigger" ? e.command! : e.type);

describe("GesturePipeline", () => {
  // Hands far outside the frame give non-physical landmarks but the pipeline must still match.
  it.each(golden.map((g) => [g.name, g] as const))("single hand reproduces golden %s", (_n, g) => {
    const p = new GesturePipeline({ ...DEFAULT_PIPELINE_SETTINGS, swipe: { ...PROTOTYPE_SWIPE_PARAMS } });
    const frames = toFrames(g.frames);
    const got = frames.flatMap((f) => p.step(f).events.map(typeOf));
    const want = g.expected.map((e) => e.event).filter((e): e is string => e !== null);
    expect(got).toEqual(want);
  });

  it("reverse swaps the command but not the swipe direction", () => {
    const p = new GesturePipeline({ ...DEFAULT_PIPELINE_SETTINGS, reverse: true });
    const frames = toFrames(new TraceBuilder().calibrated().move(-160, 0, 0.25).hold(0.3).frames);
    const trig = frames.flatMap((f) => p.step(f).events).find((e) => e.type === "trigger");
    expect(trig).toMatchObject({ command: "prev", swipe: "left" });
  });

  it("paused: draws hands but detects nothing", () => {
    const p = new GesturePipeline();
    const frames = toFrames(new TraceBuilder().calibrated().move(-160, 0, 0.25).frames);
    const res = frames.map((f) => p.step(f, true));
    expect(res.flatMap((r) => r.events)).toEqual([]);
    expect(res.at(-1)!.snapshot.hands).toHaveLength(1);
  });

  it("a flickering side label does not break a swipe", () => {
    const p = new GesturePipeline();
    const flicker = (i: number): Side => (i > 60 && i % 3 === 0 ? "left" : "right");
    const frames = toFrames(new TraceBuilder().calibrated().move(-160, 0, 0.25).hold(0.3).frames, flicker);
    const events = frames.flatMap((f) => p.step(f).events.map(typeOf));
    expect(events).toEqual(["calibrated", "next"]);
  });

  it("reports trigger details for logging", () => {
    const p = new GesturePipeline();
    const frames = toFrames(new TraceBuilder().calibrated().move(-160, 0, 0.25).hold(0.3).frames);
    const trig = frames.flatMap((f) => p.step(f).events).find((e) => e.type === "trigger")!;
    expect(trig).toMatchObject({ command: "next", swipe: "left", side: "right" });
    if (trig.type === "trigger") {
      expect(trig.distance).toBeLessThanOrEqual(-2.5);
      expect(trig.onset).toBeLessThan(trig.t);
    }
  });

  it("snapshot exposes calibration progress while holding still", () => {
    const p = new GesturePipeline();
    const frames = toFrames(new TraceBuilder().hold(0.6).frames);
    const snap = frames.map((f) => p.step(f).snapshot).at(-1)!;
    expect(snap.calibrated).toBe(false);
    expect(snap.calibProgress).toBeGreaterThan(0.4);
  });
});

describe("swipe angle (app defaults)", () => {
  const run = (dx: number, dy: number) => {
    const p = new GesturePipeline();
    const frames = toFrames(new TraceBuilder().calibrated().move(dx, dy, 0.3).hold(0.3).frames);
    return frames.flatMap((f) => p.step(f).events).map((e) => (e.type === "trigger" ? e.command : e.type));
  };

  it("accepts a natural, arc-like swipe tilted by 40 degrees", () => {
    expect(run(-160, 134)).toContain("next");
  });

  it("still rejects movements steeper than 45 degrees", () => {
    expect(run(-120, 208)).toContain("ignored_dir"); // 60 degrees
  });
});

describe("recordings from a Mac (11-18 fps): wind-ups, returns and swapped hands", () => {
  const events = (frames: FrameObs[], swipe: Partial<SwipeParams> = {}) => {
    const p = new GesturePipeline({ ...DEFAULT_PIPELINE_SETTINGS, swipe: { ...DEFAULT_PIPELINE_SETTINGS.swipe, ...swipe } });
    return frames.flatMap((f) => p.step(f).events.map((e) => (e.type === "trigger" ? e.command : e.type)));
  };

  it("lifting the hand before a swipe (slow, then a pause) does not send the other direction", () => {
    // 15 fps: lift 150 px to the right in 0.5 s, wait, then a brisk swipe 200 px to the left.
    const frames = toFrames(new TraceBuilder(15).calibrated().move(150, 0, 0.5).hold(0.25).move(-200, 0, 0.25).hold(0.5).frames);
    expect(events(frames)).toEqual(["calibrated", "next"]);
    expect(events(frames, { minSpeed: 0 })[1]).toBe("prev"); // what happened before
  });

  it("a slow return after a swipe sends nothing", () => {
    const frames = toFrames(new TraceBuilder(15).calibrated().move(-200, 0, 0.25).hold(1.1).move(150, 0, 0.6).hold(0.5).frames);
    expect(events(frames)).toEqual(["calibrated", "next"]);
  });

  it("when the side labels of two hands swap, the jump between them is not a swipe", () => {
    // 10 fps, both hands still, 100 px apart; the hand labelled "right" switches every 3 frames.
    const a = landmarksFor({ cx: 260, cy: 240, scale: 40 });
    const b = landmarksFor({ cx: 360, cy: 240, scale: 40 });
    const frames: FrameObs[] = [];
    for (let i = 0; i < 40; i++) {
      const swap = Math.floor(i / 3) % 2 === 1;
      frames.push({
        t: i * 0.1, width: 640, height: 480,
        hands: [
          { landmarks: a, side: swap ? "left" : "right", sideScore: 0.9 },
          { landmarks: b, side: swap ? "right" : "left", sideScore: 0.9 },
        ],
      });
    }
    expect(events(frames, { minSpeed: 0 }).filter((e) => e === "next" || e === "prev")).toEqual([]);
  });
});
