import { GesturePipeline, DEFAULT_PIPELINE_SETTINGS, type PipelineEvent } from "../../src/core/pipeline/GesturePipeline.ts";
import { ACTIVE_HOLD_S, due, EMPTY_AFTER_S, govern, initialGovernor, INTERVAL_S, type GovernorInput, type GovernorState } from "../../src/core/pipeline/governor.ts";
import { decimate } from "../../src/core/recording/decimate.ts";
import type { FrameObs, HandObs } from "../../src/core/types.ts";
import { handObs } from "../support/landmarks.ts";
import { person } from "../support/poses.ts";

const DT = 1 / 30;
const step = (s: GovernorState | null, o: Partial<GovernorInput> & { t: number }) => govern(s, { hands: 0, persons: 0, pending: false, force: false, ...o });

describe("governor: modes", () => {
  it("starts watching (15 fps), not empty", () => {
    expect(initialGovernor(0).mode).toBe("watch");
    expect(step(null, { t: 0 }).mode).toBe("watch");
  });

  it("a hand means every frame, for 1.5 s after it was last seen", () => {
    let s = step(null, { t: 0, hands: 1, persons: 1 });
    expect(s.mode).toBe("active");
    s = step(s, { t: ACTIVE_HOLD_S - 0.01, persons: 1 });
    expect(s.mode).toBe("active");
    s = step(s, { t: ACTIVE_HOLD_S + 0.05, persons: 1 });
    expect(s.mode).toBe("watch");
  });

  it("nobody and no hand for 5 s: empty (5 fps); somebody appears: watch again", () => {
    let s = step(null, { t: 0, persons: 1 });
    s = step(s, { t: EMPTY_AFTER_S - 0.1 });
    expect(s.mode).toBe("watch");
    s = step(s, { t: EMPTY_AFTER_S + 0.1 });
    expect(s.mode).toBe("empty");
    s = step(s, { t: EMPTY_AFTER_S + 0.3, persons: 1 });
    expect(s.mode).toBe("watch");
    s = step(s, { t: EMPTY_AFTER_S + 0.5, hands: 1 });
    expect(s.mode).toBe("active");
  });

  it("a held-back trigger and forcing keep every frame", () => {
    const empty = step(step(null, { t: 0 }), { t: 10 });
    expect(empty.mode).toBe("empty");
    expect(step(empty, { t: 10.1, pending: true }).mode).toBe("active");
    expect(step(empty, { t: 10.1, force: true }).mode).toBe("active");
  });

  /** Analysed frames per second for a camera at `fps` (±10 % jitter) in a mode. */
  const analysedFps = (fps: number, mode: keyof typeof INTERVAL_S) => {
    let last = -Infinity;
    let n = 0;
    for (let i = 0; i < fps * 20; i++) {
      const t = i / fps + (((i * 7919) % 11) - 5) * (0.02 / fps); // ±10 % of a frame
      if (due(t, last, INTERVAL_S[mode], 1 / fps)) {
        n++;
        last = t;
      }
    }
    return n / 20;
  };

  it("due(): a 30 fps camera is analysed at 15 fps watching (every 2nd frame) and 5 fps empty (every 6th)", () => {
    expect(analysedFps(30, "watch")).toBeGreaterThanOrEqual(15);
    expect(analysedFps(30, "watch")).toBeLessThan(17); // jitter lets a few extra frames through
    expect(analysedFps(30, "empty")).toBeCloseTo(5, 1);
    expect(analysedFps(30, "active")).toBe(30);
  });

  it("due(): never below 15 fps while watching, whatever the camera delivers", () => {
    for (const fps of [15, 18, 20, 24, 25, 27, 30, 50, 60]) expect(analysedFps(fps, "watch"), `${fps} fps camera`).toBeGreaterThanOrEqual(14.9);
    expect(analysedFps(20, "watch")).toBe(20); // skipping one frame of 20 would mean 10 fps
    expect(analysedFps(20, "empty")).toBeGreaterThanOrEqual(5);
    expect(analysedFps(20, "empty")).toBeLessThan(6);
  });
});

/** Frames of a scene: who is in view and where the hand is (null = no hand). */
function scene(parts: { s: number; poses: boolean; hand: (i: number) => number | null }[]): FrameObs[] {
  const frames: FrameObs[] = [];
  let t = 10;
  for (const part of parts) {
    const n = Math.round(part.s / DT);
    for (let i = 0; i < n; i++, t += DT) {
      const cx = part.hand(i);
      const hands: HandObs[] = cx === null ? [] : [handObs({ cx, cy: 250, scale: 40 })];
      frames.push({ t, width: 640, height: 480, hands, poses: part.poses ? [person(0.45, 0.22, 0.12)] : [] });
    }
  }
  return frames;
}

const still = (cx: number) => () => cx;
const swipe = (from: number, perFrame: number, frames: number) => (i: number) => from + Math.min(i, frames) * perFrame;

function triggers(frames: FrameObs[], governed: boolean): { t: number; command: string }[] {
  const p = new GesturePipeline({ ...DEFAULT_PIPELINE_SETTINGS });
  const out: { t: number; command: string }[] = [];
  const analyse = (f: FrameObs) => {
    const { events, snapshot } = p.step(f);
    for (const e of events as PipelineEvent[]) if (e.type === "trigger") out.push({ t: e.t, command: e.command });
    return { hands: snapshot.hands.length, persons: snapshot.persons.filter((x) => x.confirmed).length, pending: p.pending };
  };
  if (governed) decimate(frames, analyse);
  else frames.forEach(analyse);
  return out;
}

describe("governor: no swipe is lost", () => {
  // Armed first (hand held still), then the scene; swipes of 160 px at 20 px per frame (fast).
  const arm = { s: 1.8, poses: true, hand: still(400) };
  const scenes: Record<string, FrameObs[]> = {
    "the hand stays up between swipes": scene([arm, { s: 0.3, poses: true, hand: swipe(400, -20, 8) }, { s: 1.5, poses: true, hand: still(240) }, { s: 0.4, poses: true, hand: swipe(240, 20, 8) }, { s: 1, poses: true, hand: still(400) }]),
    "a fast swipe that starts the moment the hand appears (from watching, 15 fps)": scene([arm, { s: 3, poses: true, hand: () => null }, { s: 0.5, poses: true, hand: swipe(400, -20, 8) }, { s: 1, poses: true, hand: still(240) }]),
    "the same, one frame later (the other phase of the 15 fps grid)": scene([arm, { s: 3 + DT, poses: true, hand: () => null }, { s: 0.5, poses: true, hand: swipe(400, -20, 8) }, { s: 1, poses: true, hand: still(240) }]),
    "nobody for a while (empty, 5 fps), then someone comes in, raises a hand and swipes": scene([arm, { s: 7, poses: false, hand: () => null }, { s: 1, poses: true, hand: () => null }, { s: 0.4, poses: true, hand: still(400) }, { s: 0.5, poses: true, hand: swipe(400, -20, 8) }, { s: 1, poses: true, hand: still(240) }]),
    "a slow return movement after a swipe stays ignored": scene([arm, { s: 0.3, poses: true, hand: swipe(400, -20, 8) }, { s: 0.6, poses: true, hand: swipe(240, 6, 26) }, { s: 1.5, poses: true, hand: still(400) }]),
  };

  it.each(Object.entries(scenes))("%s: same triggers as at full rate, at most one frame later", (_name, frames) => {
    const full = triggers(frames, false);
    const gov = triggers(frames, true);
    expect(full.length).toBeGreaterThan(0);
    expect(gov.map((x) => x.command)).toEqual(full.map((x) => x.command));
    gov.forEach((g, i) => expect(g.t - full[i]!.t).toBeLessThanOrEqual(DT + 1e-6));
  });

  it("analyses far fewer frames while nobody is there", () => {
    const frames = scene([{ s: 20, poses: false, hand: () => null }]);
    const r = decimate(frames, () => ({ hands: 0, persons: 0, pending: false }));
    expect(r.analysed).toBeLessThan(frames.length * 0.3);
    expect(r.modes.empty).toBeGreaterThan(0);
  });
});
