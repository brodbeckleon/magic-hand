import fc from "fast-check";
import { SwipeDetector, type SwipeEvent } from "../../src/core/swipe/SwipeDetector.ts";
import { TraceBuilder, transform, type Frame } from "../support/traces.ts";

const run = (frames: Frame[]): SwipeEvent[] => {
  const det = new SwipeDetector();
  return frames.map((f) => det.update(f.t, f.hand)).filter((e): e is SwipeEvent => e !== null);
};

// A random gesture: a sequence of moves, holds and gaps.
const step = fc.oneof(
  fc.record({ kind: fc.constant("move" as const), dx: fc.integer({ min: -250, max: 250 }),
    dy: fc.integer({ min: -250, max: 250 }), s: fc.double({ min: 0.05, max: 1.0, noNaN: true }) }),
  fc.record({ kind: fc.constant("hold" as const), s: fc.double({ min: 0.05, max: 1.5, noNaN: true }) }),
  fc.record({ kind: fc.constant("gap" as const), s: fc.double({ min: 0.03, max: 0.5, noNaN: true }) }),
);
type Step = typeof step extends fc.Arbitrary<infer T> ? T : never;

function build(steps: Step[], calibrate: boolean, fps = 30): Frame[] {
  const b = new TraceBuilder(fps);
  if (calibrate) b.calibrated();
  for (const s of steps) {
    if (s.kind === "move") b.move(s.dx, s.dy, s.s);
    else if (s.kind === "hold") b.hold(s.s);
    else b.gap(s.s);
  }
  return b.frames;
}

describe("SwipeDetector properties", () => {
  it("never triggers before calibration (MHR01)", () => {
    // Keep moving all the time so the hand is never still long enough to calibrate.
    fc.assert(fc.property(fc.array(fc.tuple(fc.integer({ min: 40, max: 250 }), fc.boolean()), { minLength: 1, maxLength: 20 }),
      (moves) => {
        const b = new TraceBuilder();
        for (const [d, left] of moves) b.move(left ? -d : d, 0, 0.2);
        const events = run(b.frames);
        expect(events.filter((e) => e === "next" || e === "prev")).toEqual([]);
      }));
  });

  it("gives the same events wherever the presenter stands (translation invariance, MHR02)", () => {
    fc.assert(fc.property(fc.array(step, { maxLength: 12 }), fc.integer({ min: -2000, max: 2000 }),
      fc.integer({ min: -2000, max: 2000 }), (steps, tx, ty) => {
        const frames = build(steps, true);
        expect(run(transform(frames, 1, tx, ty))).toEqual(run(frames));
      }));
  });

  it("gives the same events at any distance / resolution (scale invariance, MHR03/MHR04)", () => {
    // Powers of two keep the float arithmetic exact, so the comparison can be strict.
    fc.assert(fc.property(fc.array(step, { maxLength: 12 }), fc.constantFrom(0.25, 0.5, 2, 4),
      (steps, k) => {
        const frames = build(steps, true);
        expect(run(transform(frames, k, 0, 0))).toEqual(run(frames));
      }));
  });

  it("never fires next/prev for mostly vertical movement (MHR07)", () => {
    fc.assert(fc.property(fc.array(fc.record({ dy: fc.integer({ min: -300, max: 300 }),
      ratio: fc.double({ min: -0.5, max: 0.5, noNaN: true }), s: fc.double({ min: 0.05, max: 0.6, noNaN: true }) }),
    { maxLength: 15 }), (moves) => {
      const b = new TraceBuilder().calibrated();
      // |dx| <= 0.5 |dy| per move. Vertical history may be combined across moves, but each window
      // stays dominated by vertical motion.
      for (const m of moves) b.move(m.dy * m.ratio, m.dy, m.s);
      expect(run(b.frames).filter((e) => e === "next" || e === "prev")).toEqual([]);
    }));
  });

  it("triggers each clean swipe exactly once and ignores the return movement", () => {
    // Speeds stay below maxJump (1.5 hand lengths) per frame; faster motion is treated as a jump
    // to another hand, exactly like in the prototype.
    fc.assert(fc.property(fc.boolean(), fc.integer({ min: 130, max: 300 }), fc.double({ min: 0.2, max: 0.4, noNaN: true }),
      (left, d, s) => {
        const b = new TraceBuilder().calibrated().move(left ? -d : d, 0, s).move(left ? d : -d, 0, s).hold(1.2);
        const events = run(b.frames).filter((e) => e !== "calibrated");
        expect(events[0]).toBe(left ? "next" : "prev");
        expect(events.slice(1).every((e) => e === "ignored_return")).toBe(true);
      }));
  });

  it("is deterministic: running a trace twice gives identical results", () => {
    fc.assert(fc.property(fc.array(step, { maxLength: 15 }), fc.boolean(), (steps, cal) => {
      const frames = build(steps, cal);
      expect(run(frames)).toEqual(run(frames));
    }));
  });
});
