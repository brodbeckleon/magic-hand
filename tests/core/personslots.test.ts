import { GesturePipeline, DEFAULT_PIPELINE_SETTINGS } from "../../src/core/pipeline/GesturePipeline.ts";
import { PersonTracker } from "../../src/core/tracking/PersonTracker.ts";
import type { PoseObs } from "../../src/core/types.ts";
import { person } from "../support/poses.ts";

const DT = 1 / 30;
const slots = (tr: PersonTracker) => tr.current.map((p) => [p.cx < 0.5 ? "L" : "R", p.slot] as const).sort();

describe("person numbers (slots)", () => {
  it("a person gets a number on the second pose frame; a one-frame phantom never does", () => {
    const tr = new PersonTracker();
    tr.update(0, [person(0.3, 0.3, 0.1)]);
    expect(tr.current[0]!.slot).toBeNull();
    tr.update(DT, [person(0.3, 0.3, 0.1)]);
    expect(tr.current[0]!.slot).toBe(1);
    // A phantom far away for one frame: tracked (raw id) but without a number.
    tr.update(2 * DT, [person(0.3, 0.3, 0.1), person(0.8, 0.3, 0.1)]);
    expect(slots(tr)).toEqual([["L", 1], ["R", null]]);
    for (let i = 3; i < 40; i++) tr.update(i * DT, [person(0.3, 0.3, 0.1)]);
    expect(slots(tr)).toEqual([["L", 1]]);
  });

  it("numbers are reused: someone new gets the lowest free number, not an ever-growing id", () => {
    const tr = new PersonTracker();
    for (let i = 0; i < 3; i++) tr.update(i * DT, [person(0.3, 0.3, 0.1), person(0.7, 0.3, 0.1)]);
    expect(slots(tr)).toEqual([["L", 1], ["R", 2]]);
    // L leaves for good (longer than the re-identification window).
    let t = 3 * DT;
    for (; t < 6; t += DT) tr.update(t, [person(0.7, 0.3, 0.1)]);
    expect(slots(tr)).toEqual([["R", 2]]);
    // Someone else comes in on the left: raw id 3, but number 1 again.
    tr.update(t, [person(0.25, 0.3, 0.1), person(0.7, 0.3, 0.1)]);
    tr.update(t + DT, [person(0.25, 0.3, 0.1), person(0.7, 0.3, 0.1)]);
    const left = tr.current.find((p) => p.cx < 0.5)!;
    expect(left.id).toBe(3);
    expect(left.slot).toBe(1);
  });

  it("a person who is briefly gone keeps the number when re-identified", () => {
    const tr = new PersonTracker();
    for (let i = 0; i < 3; i++) tr.update(i * DT, [person(0.3, 0.3, 0.1), person(0.7, 0.3, 0.1)]);
    const right = tr.current.find((p) => p.cx > 0.5)!;
    // R hidden for 2 s (track lost after 1 s, re-identified within 3 s).
    let t = 3 * DT;
    for (; t < 2; t += DT) tr.update(t, [person(0.3, 0.3, 0.1)]);
    expect(tr.current.some((p) => p.id === right.id)).toBe(false);
    expect(tr.slotOf(right.id)).toBe(2);
    // Meanwhile someone new may not take number 2.
    tr.update(t, [person(0.3, 0.3, 0.1), person(0.5, 0.65, 0.1)]);
    tr.update(t + DT, [person(0.3, 0.3, 0.1), person(0.5, 0.65, 0.1)]);
    expect(tr.current.find((p) => p.cy > 0.6)!.slot).toBe(3);
    t += 2 * DT;
    tr.update(t, [person(0.3, 0.3, 0.1), person(0.5, 0.65, 0.1), person(0.71, 0.3, 0.1)]);
    const back = tr.current.find((p) => p.cx > 0.6)!;
    expect(back.id).toBe(right.id);
    expect(back.slot).toBe(2);
  });

  it("never above maxPeople, also when the setting is lowered", () => {
    const tr = new PersonTracker({ maxSlots: 2 });
    const three = [person(0.2, 0.3, 0.08), person(0.5, 0.3, 0.08), person(0.8, 0.3, 0.08)];
    for (let i = 0; i < 3; i++) tr.update(i * DT, three);
    expect(tr.current.map((p) => p.slot).sort()).toEqual([1, 2, null]);
    tr.setMaxSlots(1);
    expect(tr.current.every((p) => p.slot === null || p.slot <= 1)).toBe(true);
  });

  it("reset() frees every number; raw ids keep counting", () => {
    const tr = new PersonTracker();
    for (let i = 0; i < 3; i++) tr.update(i * DT, [person(0.3, 0.3, 0.1)]);
    tr.reset();
    for (let i = 0; i < 3; i++) tr.update(1 + i * DT, [person(0.7, 0.3, 0.1)]);
    expect(tr.current[0]!.slot).toBe(1);
    expect(tr.current[0]!.id).toBe(2);
  });

  it("the pipeline shows numbers and marks unconfirmed people", () => {
    const p = new GesturePipeline({ ...DEFAULT_PIPELINE_SETTINGS, maxPeople: 2 });
    const frame = (t: number, poses: PoseObs[]) => p.step({ t, width: 640, height: 480, hands: [], poses }).snapshot;
    expect(frame(0, [person(0.3, 0.3, 0.1)]).persons[0]).toMatchObject({ slot: null, confirmed: false });
    expect(frame(DT, [person(0.3, 0.3, 0.1)]).persons[0]).toMatchObject({ slot: 1, confirmed: true });
  });
});

describe("id churn", () => {
  it("someone gesturing and leaning keeps one id (shoulder centre, torso box)", () => {
    const tr = new PersonTracker();
    for (let i = 0; i < 300; i++) {
      const p = person(0.5, 0.3, 0.1);
      const lms = p.landmarks.slice();
      // Arms swing wide (the full box changes a lot), shoulders sway a little.
      const swing = Math.sin(i / 4) * 0.25;
      for (const k of [13, 14, 15, 16, 17, 18, 19, 20, 21, 22]) lms[k] = { ...lms[k]!, x: 0.5 + swing, y: 0.35 + Math.abs(swing) };
      const sway = Math.sin(i / 10) * 0.03;
      for (const k of [11, 12]) lms[k] = { ...lms[k]!, x: lms[k]!.x + sway };
      tr.update(i * DT, [{ landmarks: lms }]);
    }
    expect(tr.issued).toBe(1);
  });

  it("reports raw ids handed out per minute", () => {
    const tr = new PersonTracker();
    for (let t = 0; t <= 60; t += 0.5) tr.update(t, [person(0.3, 0.3, 0.1), ...(t < 1 ? [person(0.7, 0.3, 0.1)] : [])]);
    expect(tr.issued).toBe(2);
    expect(tr.idsPerMinute()).toBeCloseTo(2, 5);
  });

  it("a person missed by the gate on one frame (fast step) continues the same track", () => {
    const tr = new PersonTracker();
    for (let i = 0; i < 5; i++) tr.update(i * DT, [person(0.4, 0.3, 0.1)]);
    // Jump of 1.4 shoulder widths with a smaller box (turning): beyond the gate, within rematch.
    tr.update(5 * DT, [person(0.4 + 0.14 / (4 / 3), 0.3, 0.07)]);
    expect(tr.current).toHaveLength(1);
    expect(tr.issued).toBe(1);
  });
});
