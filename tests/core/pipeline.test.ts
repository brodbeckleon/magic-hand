import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { GesturePipeline, DEFAULT_PIPELINE_SETTINGS } from "../../src/core/pipeline/GesturePipeline.ts";
import type { Hand, Side } from "../../src/core/types.ts";
import { toFrames } from "../support/landmarks.ts";
import { TraceBuilder } from "../support/traces.ts";

const goldenDir = join(import.meta.dirname, "..", "fixtures", "golden");
const golden = readdirSync(goldenDir).map((f) => JSON.parse(readFileSync(join(goldenDir, f), "utf8")) as {
  name: string; frames: { t: number; hand: Hand | null }[]; expected: { event: string | null }[];
});

const typeOf = (e: { type: string; command?: string }) => (e.type === "trigger" ? e.command! : e.type);

describe("GesturePipeline", () => {
  // Hands far outside the frame give non-physical landmarks but the pipeline must still match.
  it.each(golden.map((g) => [g.name, g] as const))("single hand reproduces golden %s", (_n, g) => {
    const p = new GesturePipeline();
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
