import { autotune, AUTOTUNE_BOUNDS } from "../../src/core/calibration/autotune.ts";
import { checkFraming, meanLuma } from "../../src/core/calibration/framingCheck.ts";
import { MovementSegmenter, type Movement } from "../../src/core/calibration/practice.ts";
import { DEFAULT_SWIPE_PARAMS } from "../../src/core/swipe/params.ts";
import { TraceBuilder } from "../support/traces.ts";
import { person } from "../support/poses.ts";

function segment(frames: TraceBuilder["frames"]): Movement[] {
  const seg = new MovementSegmenter();
  return frames.map((f) => seg.update(f.t, f.hand)).filter((m): m is Movement => m !== null);
}

describe("MovementSegmenter", () => {
  it("measures each swipe in full", () => {
    const moves = segment(new TraceBuilder().hold(0.5).move(-160, 8, 0.3).hold(0.5).move(200, -20, 0.4).hold(0.5).frames);
    expect(moves).toHaveLength(2);
    expect(moves[0]!.dx).toBeCloseTo(-4, 1);
    expect(moves[0]!.dy).toBeCloseTo(0.2, 1);
    expect(moves[1]!.dx).toBeCloseTo(5, 1);
    expect(moves[0]!.duration).toBeGreaterThan(0.25);
    expect(moves[0]!.duration).toBeLessThan(0.5);
  });

  it("ignores slow drifting and small fidgets", () => {
    expect(segment(new TraceBuilder().move(-100, 0, 2.0).hold(0.3).frames)).toEqual([]);
    expect(segment(new TraceBuilder().hold(0.3).move(-25, 0, 0.1).hold(0.3).frames)).toEqual([]);
  });

  it("ends a movement when the hand disappears", () => {
    expect(segment(new TraceBuilder().hold(0.3).move(-160, 0, 0.3).gap(0.3).frames)).toHaveLength(1);
  });

  it("reports when a distance was reached", () => {
    const [m] = segment(new TraceBuilder().hold(0.3).move(-160, 0, 0.4).hold(0.4).frames);
    expect(m!.timeTo(2)).toBeGreaterThan(0.15);
    expect(m!.timeTo(2)).toBeLessThan(0.25);
    expect(m!.timeTo(10)).toBeNull();
  });
});

describe("autotune", () => {
  const mv = (dx: number, dy: number, duration: number): Movement => ({ dx, dy, duration, timeTo: (d) => (Math.abs(dx) >= d ? (duration * d) / Math.abs(dx) : null) });

  it("keeps the defaults with fewer than two usable swipes", () => {
    expect(autotune([mv(4, 0.5, 0.3)]).params.distance).toBe(DEFAULT_SWIPE_PARAMS.distance);
    expect(autotune([mv(1, 3, 0.3), mv(1, 3, 0.3)]).used).toBe(0); // steeper than any allowed angle
  });

  it("derives thresholds from the presenter's own swipes", () => {
    const r = autotune([mv(-5, 0.5, 0.3), mv(-4.5, 0.2, 0.35), mv(5, -1, 0.3), mv(5.5, 0.3, 0.25)]);
    expect(r.used).toBe(4);
    expect(r.params.distance).toBeCloseTo(0.6 * 5, 5);
    expect(r.params.maxSlope).toBe(AUTOTUNE_BOUNDS.maxSlope[0]); // 1.3 x 0.2 = 0.26, below the 0.4 floor
    expect(r.params.window).toBeGreaterThanOrEqual(AUTOTUNE_BOUNDS.window[0]);
  });

  it("clamps to safe bounds", () => {
    const tiny = autotune([mv(-1.2, 1.3, 0.9), mv(1.1, 1.2, 1.0)]);
    expect(tiny.params.distance).toBe(AUTOTUNE_BOUNDS.distance[0]);
    expect(tiny.params.maxSlope).toBe(AUTOTUNE_BOUNDS.maxSlope[1]);
    const huge = autotune([mv(-12, 0, 0.1), mv(12, 0, 0.1)]);
    expect(huge.params.distance).toBe(AUTOTUNE_BOUNDS.distance[1]);
    expect(huge.params.window).toBe(AUTOTUNE_BOUNDS.window[0]);
  });

  it("tuned values still accept the swipes they were learned from", () => {
    const moves = segment(new TraceBuilder().hold(0.4).move(-150, 10, 0.3).hold(0.5).move(160, 0, 0.3).hold(0.5).move(-170, -10, 0.35).hold(0.5).frames);
    const { params } = autotune(moves);
    for (const m of moves) {
      expect(Math.abs(m.dx)).toBeGreaterThan(params.distance);
      expect(m.timeTo(params.distance)!).toBeLessThan(params.window);
    }
  });
});

describe("checkFraming", () => {
  it("judges light from the mean luma", () => {
    expect(meanLuma([10, 10, 10, 255, 20, 20, 20, 255])).toBeCloseTo(15, 5);
    expect(checkFraming(30, null, null).light).toBe("low");
    expect(checkFraming(120, null, null).light).toBe("ok");
    expect(checkFraming(250, null, null).light).toBe("high");
  });

  it("judges distance from the closest person's shoulder width", () => {
    expect(checkFraming(null, [person(0.5, 0.3, 0.03)], null).distance).toBe("low");
    expect(checkFraming(null, [person(0.5, 0.3, 0.15)], null).distance).toBe("ok");
    expect(checkFraming(null, [person(0.5, 0.1, 0.6)], null).distance).toBe("high");
    expect(checkFraming(null, [], null).distance).toBe("unknown");
  });

  it("judges whether the hand is big enough to track", () => {
    expect(checkFraming(null, null, 12).hand).toBe("low");
    expect(checkFraming(null, null, 40).hand).toBe("ok");
  });
});
