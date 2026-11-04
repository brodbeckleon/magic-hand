import { DEFAULT_PIPELINE_SETTINGS, GesturePipeline, madeOpen } from "../../src/core/pipeline/GesturePipeline.ts";
import type { FrameObs, Landmark } from "../../src/core/types.ts";
import { toFrames } from "../support/landmarks.ts";
import { TraceBuilder } from "../support/traces.ts";

/** Sets the finger joints of a hand: stretched upwards from each knuckle, or curled back onto it. */
function withFingers(lms: Landmark[], open: boolean): Landmark[] {
  const out = lms.slice();
  const len = Math.hypot((lms[9]!.x - lms[0]!.x) * (4 / 3), lms[9]!.y - lms[0]!.y);
  for (const mcp of [5, 9, 13, 17]) {
    const k = out[mcp]!;
    const at = (up: number) => ({ x: k.x, y: k.y - up * len, z: 0 });
    out[mcp + 1] = at(0.35);
    out[mcp + 2] = open ? at(0.6) : at(0.25);
    out[mcp + 3] = open ? at(0.85) : at(0.05);
  }
  return out;
}

/** Calibrate, then one swipe to the left; `open(i)` decides the hand shape of frame i. */
function swipe(open: (i: number) => boolean, openHand = true): string[] {
  const p = new GesturePipeline({ ...DEFAULT_PIPELINE_SETTINGS, openHand });
  const frames: FrameObs[] = toFrames(new TraceBuilder().calibrated().move(-160, 0, 0.25).hold(0.3).frames);
  return frames.flatMap((f, i) => {
    const hands = f.hands.map((h) => ({ ...h, landmarks: withFingers(h.landmarks, open(i)) }));
    return p.step({ ...f, hands }).events.map((e) => (e.type === "trigger" ? e.command : e.type));
  });
}

describe("open hand (fingers stretched) required to change slides", () => {
  it("an open hand swipes", () => {
    expect(swipe(() => true)).toEqual(["calibrated", "next"]);
  });

  it("a fist does not, and the movement is reported", () => {
    expect(swipe(() => false)).toEqual(["calibrated", "ignored_closed"]);
  });

  it("calibration does not need an open hand", () => {
    expect(swipe(() => false)[0]).toBe("calibrated");
  });

  it("tolerates blurred frames that look curled during a fast swipe", () => {
    expect(swipe((i) => i % 4 !== 0)).toEqual(["calibrated", "next"]); // 75 % open
    expect(swipe((i) => i % 4 === 0)).toEqual(["calibrated", "ignored_closed"]); // 25 % open
  });

  it("the return movement after a rejected swipe still triggers nothing", () => {
    const p = new GesturePipeline({ ...DEFAULT_PIPELINE_SETTINGS, openHand: true });
    const frames = toFrames(new TraceBuilder().calibrated().move(-160, 0, 0.25).move(160, 0, 0.3).hold(0.3).frames);
    const got = frames.flatMap((f) => p.step({ ...f, hands: f.hands.map((h) => ({ ...h, landmarks: withFingers(h.landmarks, false) })) }).events);
    expect(got.some((e) => e.type === "trigger")).toBe(false);
  });

  it("is off by default: any hand shape swipes", () => {
    expect(swipe(() => false, false)).toEqual(["calibrated", "next"]);
  });
});

describe("madeOpen", () => {
  it("only looks at the frames of the swipe", () => {
    const shapes = [{ t: 0, open: false }, { t: 0.9, open: false }, { t: 1, open: true }, { t: 1.1, open: true }, { t: 1.2, open: false }];
    expect(madeOpen(shapes, 1, 1.2)).toBe(true); // 2 of 3
    expect(madeOpen(shapes, 0.9, 1.2)).toBe(false); // 2 of 4
  });

  it("palms from the pose (no fingers) cannot tell: the swipe passes", () => {
    expect(madeOpen([{ t: 1, open: null }, { t: 1.1, open: null }], 1, 1.1)).toBe(true);
    expect(madeOpen([{ t: 1, open: null }, { t: 1.1, open: false }], 1, 1.1)).toBe(false);
  });
});
