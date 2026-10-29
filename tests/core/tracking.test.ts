import { HandTracker } from "../../src/core/tracking/HandTracker.ts";
import type { Hand, Side } from "../../src/core/types.ts";
import { handObs } from "../support/landmarks.ts";

const step = (tr: HandTracker, t: number, hands: [Hand, Side][]) =>
  tr.update(t, hands.map(([h, s]) => handObs(h, s)), hands.map(([h]) => h));

describe("HandTracker", () => {
  it("keeps the id of a moving hand", () => {
    const tr = new HandTracker();
    const ids = new Set<number>();
    for (let i = 0; i < 20; i++) ids.add(step(tr, i / 30, [[{ cx: 300 - i * 8, cy: 200, scale: 40 }, "right"]])[0]!.id);
    expect(ids.size).toBe(1);
  });

  it("starts a new track after a jump that no hand can make", () => {
    const tr = new HandTracker();
    const a = step(tr, 0, [[{ cx: 100, cy: 200, scale: 40 }, "right"]])[0]!.id;
    const b = step(tr, 1 / 30, [[{ cx: 500, cy: 200, scale: 40 }, "right"]])[0]!.id;
    expect(b).not.toBe(a);
  });

  it("forgets tracks after maxAge", () => {
    const tr = new HandTracker();
    const a = step(tr, 0, [[{ cx: 100, cy: 200, scale: 40 }, "right"]])[0]!.id;
    const b = step(tr, 1.0, [[{ cx: 100, cy: 200, scale: 40 }, "right"]])[0]!.id;
    expect(b).not.toBe(a);
  });

  it("ignores single-frame side flicker (majority vote)", () => {
    const tr = new HandTracker();
    const sides: Side[] = [];
    for (let i = 0; i < 30; i++) {
      const label: Side = i % 4 === 3 ? "left" : "right";
      sides.push(step(tr, i / 30, [[{ cx: 300 + i * 3, cy: 200, scale: 40 }, label]])[0]!.side);
    }
    expect(new Set(sides.slice(1))).toEqual(new Set(["right"]));
  });

  it("freezes the side once it is clear, so a long misclassification does not flip it", () => {
    const tr = new HandTracker();
    for (let i = 0; i < 15; i++) step(tr, i / 30, [[{ cx: 300, cy: 200, scale: 40 }, "right"]]);
    let last: Side = "right";
    for (let i = 15; i < 40; i++) last = step(tr, i / 30, [[{ cx: 300, cy: 200, scale: 40 }, "left"]])[0]!.side;
    expect(last).toBe("right");
  });

  it("never reports two hands on the same side", () => {
    const tr = new HandTracker();
    for (let i = 0; i < 20; i++) {
      const out = step(tr, i / 30, [[{ cx: 200, cy: 200, scale: 40 }, "left"], [{ cx: 450, cy: 200, scale: 40 }, "left"]]);
      expect(out[0]!.side).not.toBe(out[1]!.side);
    }
  });
});

describe("HandTracker after a stalled frame stream", () => {
  it("does not hand another hand's track to a hand that appears far away after a pause", () => {
    const tr = new HandTracker();
    const a = step(tr, 0, [[{ cx: 224, cy: 300, scale: 40 }, "right"]])[0]!.id;
    // 0.2 s without any frame, then a different hand 256 px away.
    const b = step(tr, 0.2, [[{ cx: 480, cy: 300, scale: 40 }, "right"]])[0]!.id;
    expect(b).not.toBe(a);
  });
});

it("keeps one track through a very fast swipe at 15 fps", () => {
  const tr = new HandTracker();
  const ids = new Set<number>();
  for (let i = 0; i < 6; i++) ids.add(step(tr, i / 15, [[{ cx: 500 - i * 100, cy: 300, scale: 40 }, "right"]])[0]!.id); // 37 hand lengths/s
  expect(ids.size).toBe(1);
});
