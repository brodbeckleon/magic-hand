import { HandAssociator, STICKY_FRAMES } from "../../src/core/tracking/associate.ts";
import { assign, PersonTracker } from "../../src/core/tracking/PersonTracker.ts";
import type { HandTrack } from "../../src/core/tracking/HandTracker.ts";
import { ClaimDetector, CLAIM_TIME, isOpenPalm, isRaised } from "../../src/core/speaker/ClaimDetector.ts";
import { MotionEnergy, MouthActivity } from "../../src/core/speaker/activity.ts";
import { Arbiter, type Candidate } from "../../src/core/speaker/Arbiter.ts";
import type { PoseObs } from "../../src/core/types.ts";
import { palmLandmarks } from "../support/landmarks.ts";
import { person } from "../support/poses.ts";

const DT = 1 / 30;

describe("assign", () => {
  it("finds the minimum-cost matching and respects the gate", () => {
    expect(assign([[1, 0.1], [0.2, 1]], 2).sort()).toEqual([[0, 1], [1, 0]]);
    expect(assign([[5]], 2)).toEqual([]);
  });

  it("prefers more matches", () => {
    expect(assign([[0.1, 0.2], [0.15, 9]], 1)).toHaveLength(2);
  });

  it("falls back to greedy for big problems without blowing up", () => {
    const big = Array.from({ length: 10 }, (_, r) => Array.from({ length: 10 }, (_, c) => (r === c ? 0 : 1)));
    expect(assign(big, 2)).toHaveLength(10);
  });
});

describe("PersonTracker", () => {
  it("keeps ids while people move", () => {
    const tr = new PersonTracker();
    let ids: number[] = [];
    for (let i = 0; i < 30; i++) {
      ids = tr.update(i * DT, [person(0.3 + i * 0.002, 0.3, 0.1), person(0.7 - i * 0.002, 0.3, 0.1)]).map((p) => p.id).sort();
    }
    expect(ids).toEqual([1, 2]);
  });

  it("does not swap ids when two people pass each other", () => {
    const tr = new PersonTracker();
    const left = (i: number) => person(0.2 + i * 0.02, 0.3, 0.1);
    const right = (i: number) => person(0.8 - i * 0.02, 0.32, 0.1);
    tr.update(0, [left(0), right(0)]);
    const idLeft = tr.current.find((p) => p.cx < 0.5)!.id;
    for (let i = 1; i <= 30; i++) tr.update(i * DT, [left(i), right(i)]);
    // After crossing, the person that started on the left is now on the right.
    expect(tr.current.find((p) => p.cx > 0.5)!.id).toBe(idLeft);
  });

  it("keeps a track through short dropouts and re-identifies within the window", () => {
    const tr = new PersonTracker();
    tr.update(0, [person(0.5, 0.3, 0.1)]);
    tr.update(0.5, []);
    expect(tr.current).toHaveLength(1);
    tr.update(2.0, []);
    expect(tr.current).toHaveLength(0);
    expect(tr.update(2.5, [person(0.52, 0.3, 0.1)])[0]!.id).toBe(1);
    tr.update(8, []);
    expect(tr.update(9, [person(0.5, 0.3, 0.1)])[0]!.id).toBe(2);
  });
});

describe("HandAssociator", () => {
  const hand = (id: number, x: number, y: number): HandTrack => ({
    id, obs: { landmarks: palmLandmarks(x, y, 0.05, false), side: "right", sideScore: 0.9 },
    hand: { cx: 0, cy: 0, scale: 30 }, side: "right", frozen: false, firstSeen: 0, lastSeen: 0,
  });
  const withWrists = (p: PoseObs, l: [number, number], r: [number, number]): PoseObs => {
    const lms = p.landmarks.slice();
    lms[15] = { x: l[0], y: l[1], z: 0, visibility: 0.9 };
    lms[16] = { x: r[0], y: r[1], z: 0, visibility: 0.9 };
    return { landmarks: lms };
  };

  it("binds a hand to the person whose wrist it is, with the anatomical side", () => {
    const tr = new PersonTracker();
    const persons = tr.update(0, [withWrists(person(0.3, 0.3, 0.1), [0.35, 0.5], [0.25, 0.5]), withWrists(person(0.7, 0.3, 0.1), [0.75, 0.5], [0.65, 0.5])]);
    const a = new HandAssociator();
    a.update([hand(1, 0.65, 0.5)], persons, 4 / 3);
    const p2 = persons.find((p) => p.cx > 0.5)!.id;
    expect(a.binding(1)).toMatchObject({ personId: p2, side: "right" });
  });

  it("is sticky: only consistent disagreement moves a hand to someone else", () => {
    const tr = new PersonTracker();
    const a = new HandAssociator();
    const persons = tr.update(0, [withWrists(person(0.3, 0.3, 0.1), [0.35, 0.5], [0.25, 0.5]), withWrists(person(0.7, 0.3, 0.1), [0.75, 0.5], [0.65, 0.5])]);
    const p1 = persons.find((p) => p.cx < 0.5)!.id;
    const p2 = persons.find((p) => p.cx > 0.5)!.id;
    a.update([hand(1, 0.25, 0.5)], persons, 4 / 3);
    expect(a.binding(1)!.personId).toBe(p1);
    for (let i = 0; i < STICKY_FRAMES - 1; i++) a.update([hand(1, 0.65, 0.5)], persons, 4 / 3);
    expect(a.binding(1)!.personId).toBe(p1);
    a.update([hand(1, 0.65, 0.5)], persons, 4 / 3);
    expect(a.binding(1)!.personId).toBe(p2);
  });

  it("forgets hands that are gone", () => {
    const tr = new PersonTracker();
    const a = new HandAssociator();
    const persons = tr.update(0, [withWrists(person(0.5, 0.3, 0.1), [0.55, 0.5], [0.45, 0.5])]);
    a.update([hand(1, 0.45, 0.5)], persons, 4 / 3);
    a.update([], persons, 4 / 3);
    expect(a.binding(1)).toBeUndefined();
  });

  it("keeps the binding of a hand the detector missed on one frame (track still alive)", () => {
    const tr = new PersonTracker();
    const a = new HandAssociator();
    const persons = tr.update(0, [withWrists(person(0.5, 0.3, 0.1), [0.55, 0.5], [0.45, 0.5])]);
    a.update([hand(1, 0.45, 0.5)], persons, 4 / 3);
    a.update([], persons, 4 / 3, (id) => id === 1);
    expect(a.binding(1)).toMatchObject({ side: "right" });
    a.update([], persons, 4 / 3, () => false);
    expect(a.binding(1)).toBeUndefined();
  });
});

describe("ClaimDetector", () => {
  it("recognises an open palm vs a fist", () => {
    expect(isOpenPalm(palmLandmarks(0.5, 0.5, 0.1, true))).toBe(true);
    expect(isOpenPalm(palmLandmarks(0.5, 0.5, 0.1, false))).toBe(false);
  });

  it("raised = wrist above the shoulders", () => {
    const p = person(0.5, 0.3, 0.1); // shoulders at y = 0.4
    expect(isRaised(palmLandmarks(0.5, 0.35, 0.05, true), p)).toBe(true);
    expect(isRaised(palmLandmarks(0.5, 0.6, 0.05, true), p)).toBe(false);
  });

  it("completes after holding an open, raised, still hand for about a second", () => {
    const c = new ClaimDetector();
    const lms = palmLandmarks(0.5, 0.3, 0.06, true);
    const hand = { cx: 320, cy: 150, scale: 30 };
    let done = -1;
    for (let i = 0; i < 45 && done < 0; i++) if (c.update(i * DT, lms, hand, person(0.5, 0.3, 0.1))) done = i * DT;
    expect(done).toBeGreaterThanOrEqual(CLAIM_TIME - 1e-9);
    expect(done).toBeLessThan(CLAIM_TIME + 0.1);
  });

  it("resets when the hand closes or moves", () => {
    const c = new ClaimDetector();
    const open = palmLandmarks(0.5, 0.3, 0.06, true);
    for (let i = 0; i < 20; i++) c.update(i * DT, open, { cx: 320, cy: 150, scale: 30 });
    expect(c.progress).toBeGreaterThan(0.5);
    c.update(21 * DT, palmLandmarks(0.5, 0.3, 0.06, false), { cx: 320, cy: 150, scale: 30 });
    expect(c.progress).toBe(0);
    for (let i = 22; i < 40; i++) c.update(i * DT, open, { cx: 320 + (i - 22) * 5, cy: 150, scale: 30 });
    expect(c.progress).toBeLessThan(0.5);
  });
});

describe("activity signals", () => {
  it("talking (moving jaw) scores higher than a mouth held open", () => {
    const talking = new MouthActivity();
    const open = new MouthActivity();
    for (let i = 0; i < 10; i++) {
      talking.update(i * 0.2, { jawOpen: i % 2 ? 0.5 : 0.05, lip: null });
      open.update(i * 0.2, { jawOpen: 0.6, lip: null });
    }
    expect(talking.score(1.8)!).toBeGreaterThan(0.2);
    expect(open.score(1.8)!).toBeLessThan(0.01);
    expect(new MouthActivity().score(0)).toBeNull();
  });

  it("movement energy grows with gesturing and decays when still", () => {
    const m = new MotionEnergy();
    const p = (dx: number): PoseObs => ({ landmarks: person(0.5 + dx, 0.3, 0.1).landmarks });
    for (let i = 0; i < 30; i++) m.update(i * DT, p(Math.sin(i / 2) * 0.05), 0.1);
    const moving = m.value;
    for (let i = 30; i < 120; i++) m.update(i * DT, p(0), 0.1);
    expect(moving).toBeGreaterThan(1);
    expect(m.value).toBeLessThan(moving / 5);
  });
});

describe("Arbiter", () => {
  const c = (id: number, o: Partial<Candidate> = {}): Candidate => ({ id, present: true, claimed: false, claimStart: null, mouth: null, motion: 0, midSwipe: false, ...o });

  it("a single person gets control automatically", () => {
    const a = new Arbiter();
    expect(a.update(0, [c(1)], "manual", "both")).toEqual({ id: 1, reason: "only" });
  });

  it("manual: only a palm claim changes the speaker", () => {
    const a = new Arbiter();
    a.update(0, [c(1)], "manual", "both");
    expect(a.update(1, [c(1), c(2, { motion: 10 })], "manual", "both")).toBeNull();
    expect(a.update(2, [c(1), c(2, { claimed: true, claimStart: 1 })], "manual", "both")).toEqual({ id: 2, reason: "claim" });
    expect(a.active).toBe(2);
  });

  it("simultaneous claims: the speaker keeps control, otherwise the earlier claim wins", () => {
    const a = new Arbiter();
    a.update(0, [c(1)], "manual", "both");
    expect(a.update(1, [c(1, { claimed: true, claimStart: 0.5 }), c(2, { claimed: true, claimStart: 0.1 })], "manual", "both")).toBeNull();
    expect(a.active).toBe(1);
    const b = new Arbiter();
    b.update(0, [c(1), c(2), c(3)], "manual", "both");
    expect(b.update(1, [c(1), c(2, { claimed: true, claimStart: 0.4 }), c(3, { claimed: true, claimStart: 0.2 })], "manual", "both")!.id).toBe(3);
  });

  it("never switches while the speaker is mid-swipe", () => {
    const a = new Arbiter();
    a.update(0, [c(1)], "manual", "both");
    expect(a.update(1, [c(1, { midSwipe: true }), c(2, { claimed: true, claimStart: 0.5 })], "manual", "both")).toBeNull();
    expect(a.active).toBe(1);
  });

  it("a speaker out of view loses control after the grace period; the only remaining person takes over", () => {
    const a = new Arbiter();
    a.update(0, [c(1), c(2, { claimed: true, claimStart: 0 })], "manual", "both");
    expect(a.active).toBe(2);
    expect(a.update(2, [c(1), c(2, { present: false })], "manual", "both")).toBeNull();
    expect(a.update(3.5, [c(1), c(2, { present: false })], "manual", "both")).toEqual({ id: 1, reason: "only" });
  });

  it("auto: switches to the clearly more active person after the hold time, with hysteresis", () => {
    const a = new Arbiter();
    let changes = 0;
    for (let i = 0; i <= 300; i++) {
      const t = i * DT;
      const r = a.update(t, [c(1, { motion: t < 3 ? 1 : 0.2 }), c(2, { motion: t < 3 ? 0.2 : 1 })], "auto", "movement");
      if (r) changes++;
    }
    expect(a.active).toBe(2);
    expect(changes).toBe(2); // initial pick of 1, then one switch to 2
  });

  it("auto: does not flap when two people are about equally active", () => {
    const a = new Arbiter();
    const switches: number[] = [];
    for (let i = 0; i <= 600; i++) {
      const t = i * DT;
      const r = a.update(t, [c(1, { motion: 1 + 0.15 * Math.sin(t * 3) }), c(2, { motion: 1 + 0.15 * Math.cos(t * 3) })], "auto", "movement");
      if (r) switches.push(t);
    }
    expect(switches.length).toBeLessThanOrEqual(1);
  });

  it("auto: a palm claim pins the speaker against automatic switching", () => {
    const a = new Arbiter();
    a.update(0, [c(1), c(2, { claimed: true, claimStart: 0 })], "auto", "movement");
    for (let i = 1; i <= 150; i++) a.update(i * DT, [c(1, { motion: 5 }), c(2, { motion: 0.1 })], "auto", "movement");
    expect(a.active).toBe(2); // 5 s later, still pinned
  });

  it("mouth mode uses the jaw signal, falling back to movement without a face", () => {
    const a = new Arbiter();
    for (let i = 0; i <= 120; i++) a.update(i * DT, [c(1, { motion: 1, mouth: 0.01 }), c(2, { motion: 0.1, mouth: 0.3 })], "auto", "mouth");
    expect(a.active).toBe(2);
    const b = new Arbiter();
    for (let i = 0; i <= 120; i++) b.update(i * DT, [c(1, { motion: 1 }), c(2, { motion: 0.1 })], "auto", "mouth");
    expect(b.active).toBe(1);
  });
});
