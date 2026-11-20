import { GesturePipeline, DEFAULT_PIPELINE_SETTINGS, EXPLAIN_EVERY_S, type PipelineSettings } from "../../src/core/pipeline/GesturePipeline.ts";
import type { FrameObs } from "../../src/core/types.ts";
import { handObs, toFrames } from "../support/landmarks.ts";
import { TraceBuilder } from "../support/traces.ts";

const typeOf = (e: { type: string; command?: string }) => (e.type === "trigger" ? e.command! : e.type);

function run(frames: FrameObs[], settings: Partial<PipelineSettings> = {}): string[] {
  const p = new GesturePipeline({ ...DEFAULT_PIPELINE_SETTINGS, ...settings });
  return frames.flatMap((f) => p.step(f).events.map(typeOf));
}
const trace = (b: TraceBuilder) => toFrames(b.frames);

// Hand length 40 px, swipe distance 2.5 hand lengths: a swipe needs 100 px within 0.5 s.
describe("almost a swipe (ignored_weak)", () => {
  it("a movement that reaches 60 % of a swipe and stops is explained once", () => {
    const events = run(trace(new TraceBuilder().calibrated().move(-70, 0, 0.25).hold(1)));
    expect(events.filter((e) => e === "ignored_weak")).toHaveLength(1);
    expect(events).not.toContain("next");
  });

  it("a full-length but slow movement is explained (too slow)", () => {
    const events = run(trace(new TraceBuilder().calibrated().move(-160, 0, 1.0).hold(1)));
    expect(events).toEqual(["calibrated", "ignored_weak"]);
  });

  it("small movements while talking are not explained", () => {
    const b = new TraceBuilder().calibrated();
    for (let i = 0; i < 6; i++) b.move(i % 2 ? 40 : -40, 10, 0.3).hold(0.2);
    expect(run(trace(b))).toEqual(["calibrated"]);
  });

  it("a real swipe and the hand coming back are not explained", () => {
    const events = run(trace(new TraceBuilder().calibrated().move(-160, 0, 0.25).hold(0.1).move(80, 0, 0.3).hold(1.5)));
    expect(events).toEqual(["calibrated", "next"]);
  });

  it("a diagonal swipe is explained as diagonal, not also as weak", () => {
    const events = run(trace(new TraceBuilder().calibrated().move(-90, 160, 0.25).hold(1)));
    expect(events).toEqual(["calibrated", "ignored_dir"]);
  });

  it(`at most once every ${EXPLAIN_EVERY_S} s`, () => {
    const b = new TraceBuilder().calibrated();
    for (let i = 0; i < 3; i++) b.move(i % 2 ? 70 : -70, 0, 0.25).hold(0.8); // ~1 s apart
    b.hold(2).move(-70, 0, 0.25).hold(0.8);
    expect(run(trace(b)).filter((e) => e === "ignored_weak")).toHaveLength(2);
  });

  it("not before gesture control is armed", () => {
    expect(run(trace(new TraceBuilder().hold(0.3).move(-70, 0, 0.25).hold(0.5)))).toEqual([]);
  });
});

describe("swipe with the hand that is not the preferred one (ignored_other_hand)", () => {
  /** The left hand arms (held still at the left), then the right hand swipes. */
  function twoHands(): FrameObs[] {
    const frames: FrameObs[] = [];
    let t = 10;
    const left = handObs({ cx: 180, cy: 260, scale: 40 }, "left");
    for (let i = 0; i < 54; i++, t += 1 / 30) frames.push({ t, width: 640, height: 480, hands: [left] });
    for (let i = 0; i < 30; i++, t += 1 / 30) {
      const cx = 480 - Math.min(i, 8) * 20;
      frames.push({ t, width: 640, height: 480, hands: [left, handObs({ cx, cy: 240, scale: 40 }, "right")] });
    }
    return frames;
  }

  it("is explained when only the left hand may change slides", () => {
    const events = run(twoHands(), { preferredHand: "left" });
    expect(events).toEqual(["calibrated", "ignored_other_hand"]);
  });

  it("never happens with either hand allowed (the swipe counts)", () => {
    const events = run(twoHands(), { preferredHand: "either" });
    expect(events).toEqual(["calibrated", "next"]);
  });
});
