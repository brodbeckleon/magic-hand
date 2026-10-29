import { HandLock } from "../../src/core/swipe/HandLock.ts";
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
    const r = feed(lock, t, 0.3, (i) => ({ right: at(320 - i * 20) }));
    expect(r.events).toEqual([]);
    t = r.t + 1.5;
    const l = feed(lock, t, 0.3, (i) => ({ left: at(320 - i * 20) }));
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
    const r = feed(lock, t, 0.3, (i) => ({ right: at(500 - i * 20), left: at(300 - i * 20, 100) }));
    expect(r.events.filter((e) => e.event === "next" || e.event === "prev")).toHaveLength(1);
  });

  it("switching the preferred hand releases the lock", () => {
    const lock = new HandLock("either");
    lock.locked = "left";
    lock.setPreferred("right");
    expect(lock.locked).toBeNull();
  });
});
