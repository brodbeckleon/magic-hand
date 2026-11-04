import { GesturePipeline, DEFAULT_PIPELINE_SETTINGS, type PipelineEvent } from "../../src/core/pipeline/GesturePipeline.ts";
import type { FrameObs, HandObs } from "../../src/core/types.ts";
import { aX, bX, H, presenter, swipeHand, W } from "../support/multi.ts";

const DT = 1 / 30;

/** Frames with person A (left in the picture), B (right) or both; each may hold a hand. */
class Scene {
  t = 10;
  events: PipelineEvent[] = [];
  readonly p = new GesturePipeline({ ...DEFAULT_PIPELINE_SETTINGS, maxPeople: 2 });
  run(seconds: number, who: { a?: boolean | HandObs; b?: boolean | HandObs }): this {
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      const hands: HandObs[] = [];
      const poses = [];
      for (const [key, x, def] of [["a", 0.3, 0.25], ["b", 0.7, 0.65]] as const) {
        const v = who[key];
        if (!v) continue;
        const hand = typeof v === "object" ? v : null;
        if (hand) hands.push(hand);
        poses.push(presenter(x, hand ? hand.landmarks[0]! : { x: def, y: 0.7, z: 0 }));
      }
      this.events.push(...this.p.step({ t: this.t, width: W, height: H, hands, poses } as FrameObs).events);
      this.t += DT;
    }
    return this;
  }
  swipeA(): this {
    for (let i = 0; i < 8; i++) this.run(DT, { a: swipeHand(aX - i * 20, 300), b: true });
    return this.run(1.2, { a: swipeHand(aX - 140, 300), b: true });
  }
  triggers() {
    return this.events.filter((e) => e.type === "trigger").length;
  }
}

/** Swipe left with B's hand (A may stand by). */
function swipeB(s: Scene, a: boolean): Scene {
  for (let i = 0; i < 8; i++) s.run(DT, { b: swipeHand(bX - i * 20, 300), a });
  return s.run(1.2, { b: swipeHand(bX - 140, 300), a });
}
const names = (s: Scene) => s.events.map((e) => (e.type === "trigger" ? `${e.command}@${e.person}` : e.type === "speaker" ? `speaker:${e.person}` : `${e.type}@${e.person}`));

describe("the speaker walks out of the picture and comes back", () => {
  it("alone: after 5 s away, the first swipe works again", () => {
    const s = new Scene().run(1.8, { a: swipeHand(aX, 300) });
    s.run(5, {}).run(1, { a: swipeHand(aX, 300) });
    s.events = [];
    for (let i = 0; i < 8; i++) s.run(DT, { a: swipeHand(aX - i * 20, 300) });
    s.run(1.2, { a: swipeHand(aX - 140, 300) });
    expect(names(s).filter((n) => n.startsWith("next"))).toHaveLength(1);
    expect(names(s).some((n) => n.startsWith("ignored_not_speaker"))).toBe(false);
  });

  it("with someone else in view: after 5 s away, the returning speaker's first swipe takes control again", () => {
    const s = new Scene().run(1.8, { a: swipeHand(aX, 300), b: true });
    const idA = s.p.persons.current.find((p) => p.cx < 0.5)!.id;
    s.events = [];
    s.run(5, { b: true });
    expect(names(s)).toEqual(["speaker:null"]); // lost, and not handed to the one who stayed
    s.run(1, { a: swipeHand(aX, 300), b: true });
    const idA2 = s.p.persons.current.find((p) => p.cx < 0.5)!.id;
    expect(idA2).not.toBe(idA); // a new person for the tracker
    s.events = [];
    s.swipeA();
    expect(names(s)).toEqual([`speaker:${idA2}`, `next@${idA2}`]);
  });

  it("the other person may take over instead by swiping first; then the returning speaker raises a hand", () => {
    const s = new Scene().run(1.8, { a: swipeHand(aX, 300), b: true });
    s.run(5, { b: true });
    const idB = s.p.persons.current.find((p) => p.cx > 0.5)!.id;
    s.events = [];
    swipeB(s, false);
    expect(names(s)).toEqual([`speaker:${idB}`, `next@${idB}`]);
    s.run(1, { a: swipeHand(aX, 300), b: true });
    s.events = [];
    s.swipeA();
    expect(names(s).filter((n) => n.startsWith("next"))).toEqual([]);
  });

  it("back within 3 s: still the speaker", () => {
    const s = new Scene().run(1.8, { a: swipeHand(aX, 300), b: true });
    const idA = s.p.persons.current.find((p) => p.cx < 0.5)!.id;
    s.run(2, { b: true }).run(1, { a: swipeHand(aX, 300), b: true });
    s.events = [];
    s.swipeA();
    expect(names(s)).toEqual([`next@${idA}`]);
  });
});
