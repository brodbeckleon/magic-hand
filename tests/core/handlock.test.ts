import { HandLock } from "../../src/core/swipe/HandLock.ts";
import { DEFAULT_SWIPE_PARAMS } from "../../src/core/swipe/params.ts";
import type { Hand, Side } from "../../src/core/types.ts";

type Hands = Partial<Record<Side, Hand>>;
const DT = 1 / 30;

/** Feeds frames produced by `f(i)` for `seconds`, returns all events. */
function feed(lock: HandLock, t0: number, seconds: number, f: (i: number) => Hands) {
  const events: { side: Side; event: string; t: number }[] = [];
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    const t = t0 + i * DT;
    for (const e of lock.update(t, f(i))) events.push({ side: e.side, event: e.event, t });
  }
  return { events, t: t0 + n * DT };
}

const at = (cx: number, cy = 240, scale = 40): Hand => ({ cx, cy, scale });

function calibrate(lock: HandLock, side: Side = "right") {
  return feed(lock, 0, 1.8, () => ({ [side]: at(320) }));
}

describe("HandLock", () => {
  it("calibrating one hand arms both", () => {
    const lock = new HandLock("either");
    const { events } = calibrate(lock, "right");
    expect(events.map((e) => e.event)).toEqual(["calibrated"]);
    expect(lock.detectors.left.calibrated).toBe(true);
  });

  it("only the preferred hand triggers", () => {
    const lock = new HandLock("left");
    let { t } = calibrate(lock, "left");
    // The swipe stops after 9 frames; the feed goes on past the wind-up hold.
    const r = feed(lock, t, 0.6, (i) => ({ right: at(320 - Math.min(i, 9) * 20) }));
    expect(r.events).toEqual([]);
    t = r.t + 1.5;
    const l = feed(lock, t, 0.6, (i) => ({ left: at(320 - Math.min(i, 9) * 20) }));
    expect(l.events.map((e) => [e.side, e.event])).toEqual([["left", "next"]]);
  });

  it("the non-preferred hand cannot calibrate (MHR01 with the chosen hand)", () => {
    const lock = new HandLock("left");
    calibrate(lock, "right");
    expect(lock.calibrated).toBe(false);
  });

  it("either: the first hand to clearly move takes the lock; the other hand's swipe is discarded", () => {
    const lock = new HandLock("either");
    const { t } = calibrate(lock, "right");
    // Right hand swipes left fast, left hand drifts right more slowly at the same time.
    const r = feed(lock, t, 0.5, (i) => ({ right: at(500 - Math.min(i, 8) * 20), left: at(150 + i * 9) }));
    expect(r.events.map((e) => [e.side, e.event])).toEqual([["right", "next"]]);
  });

  it("a trigger starts the return period on the other hand too", () => {
    const lock = new HandLock("either");
    let { t } = calibrate(lock, "right");
    t = feed(lock, t, 0.3, (i) => ({ right: at(500 - i * 20) })).t;
    // Immediately afterwards the left hand swipes: still within the shared return period.
    const r = feed(lock, t, 0.3, (i) => ({ left: at(150 + i * 20) }));
    expect(r.events.map((e) => e.event)).not.toContain("prev");
  });

  it("at most one trigger per frame", () => {
    const lock = new HandLock("either");
    const { t } = calibrate(lock, "right");
    // Both hands perform the exact same swipe in parallel.
    const r = feed(lock, t, 0.6, (i) => ({ right: at(500 - Math.min(i, 9) * 20), left: at(300 - Math.min(i, 9) * 20, 100) }));
    expect(r.events.filter((e) => e.event === "next" || e.event === "prev")).toHaveLength(1);
  });

  it("switching the preferred hand releases the lock", () => {
    const lock = new HandLock("either");
    lock.locked = "left";
    lock.setPreferred("right");
    expect(lock.locked).toBeNull();
  });
});

describe("HandLock: wind-up before a swipe", () => {
  /** Positions along a path of [dx per frame, frames] segments, starting at x0. */
  function path(x0: number, segments: [number, number][]): number[] {
    const xs = [x0];
    for (const [dx, n] of segments) for (let i = 0; i < n; i++) xs.push(xs[xs.length - 1]! + dx);
    return xs;
  }
  /** The check is off by default; these tests turn it on with a hold of 0.18 s. */
  const HOLD = 0.18;
  function run(xs: number[], params = {}) {
    const lock = new HandLock("either", { ...DEFAULT_SWIPE_PARAMS, windupHold: HOLD, minSpeed: 0, ...params });
    const { t } = calibrate(lock);
    const out: { event: string; t: number; lastDx?: number }[] = [];
    const n = xs.length + 30; // then the hand rests for a second
    for (let i = 0; i < n; i++) {
      const tt = t + i * DT;
      for (const e of lock.update(tt, { right: at(xs[Math.min(i, xs.length - 1)]!) })) out.push({ event: e.event, t: tt, lastDx: e.lastDx });
    }
    return out;
  }
  const names = (r: ReturnType<typeof run>) => r.map((e) => e.event);

  it("a swing left right before a stronger swipe right sends only 'back'", () => {
    // 120 px left in 6 frames (enough to trigger 'next' on its own), then at once 240 px right, faster.
    const r = run(path(320, [[-20, 6], [30, 8]]));
    expect(names(r)).toEqual(["ignored_windup", "prev"]);
    expect(r.find((e) => e.event === "prev")!.lastDx).toBeGreaterThan(0);
  });

  it("a swipe followed by a slower return still sends the swipe", () => {
    const r = run(path(320, [[-22, 8], [-4, 2], [9, 18]]));
    expect(names(r).filter((e) => e === "next" || e === "prev")).toEqual(["next"]);
  });

  it("a plain swipe is sent once the hold is over", () => {
    const r = run(path(320, [[-22, 8]]));
    expect(names(r)).toEqual(["next"]);
    const late = run(path(320, [[-22, 8]]), { windupHold: 0 });
    expect(names(late)).toEqual(["next"]);
    const held = r[0]!.t - late[0]!.t;
    expect(held).toBeGreaterThanOrEqual(HOLD - 1e-9);
    expect(held).toBeLessThan(HOLD + DT + 1e-9);
  });

  it("windupHold 0 (the default) turns the check off, like the prototype", () => {
    const r = run(path(320, [[-20, 6], [30, 8]]), { windupHold: 0 });
    expect(names(r)[0]).toBe("next");
    expect(names(r)).not.toContain("prev");
  });

  it("a turn that does not become a swipe sends the first one late", () => {
    // Back by 50 px quickly, then the hand stops: no second swipe.
    const r = run(path(320, [[-22, 8], [25, 2]]));
    expect(names(r)).toEqual(["next"]);
  });
});
