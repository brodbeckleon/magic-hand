import { GesturePipeline, DEFAULT_PIPELINE_SETTINGS, type PipelineEvent } from "../../src/core/pipeline/GesturePipeline.ts";
import type { FrameObs, HandObs, Landmark, PoseObs } from "../../src/core/types.ts";
import { landmarksFor, palmLandmarks } from "../support/landmarks.ts";
import { person } from "../support/poses.ts";

const W = 640;
const H = 480;
const DT = 1 / 30;

/** A person at normalised (unmirrored) x whose right wrist is at `wrist`. */
function presenter(x: number, wrist: Landmark): PoseObs {
  const p = person(x, 0.25, 0.1);
  const lms = p.landmarks.slice();
  lms[16] = { ...wrist, visibility: 0.95 };
  lms[15] = { x: x + 0.05, y: 0.7, z: 0, visibility: 0.95 };
  return { landmarks: lms };
}

/** Hand landmarks for a palm at mirrored-pixel position (cx, cy). */
const swipeHand = (cx: number, cy: number): HandObs => ({ landmarks: landmarksFor({ cx, cy, scale: 40 }, W, H), side: "right", sideScore: 0.9 });
const openHand = (x: number, y: number): HandObs => ({ landmarks: palmLandmarks(x, y, 0.07, true), side: "right", sideScore: 0.9 });

class Scene {
  t = 10;
  events: PipelineEvent[] = [];
  readonly p: GesturePipeline;
  constructor(mode: "manual" | "auto" = "manual") {
    this.p = new GesturePipeline({ ...DEFAULT_PIPELINE_SETTINGS, speaker: { mode, autoSignal: "movement" } });
  }
  /** Runs frames; `hands(i)` gives the hands, poses come from the hands' wrists. */
  run(seconds: number, hands: (i: number) => { a?: HandObs; b?: HandObs }): this {
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      const h = hands(i);
      const wristOf = (o: HandObs | undefined, fallback: Landmark) => (o ? o.landmarks[0]! : fallback);
      const frame: FrameObs = {
        t: this.t, width: W, height: H,
        hands: [h.a, h.b].filter((x): x is HandObs => !!x),
        poses: [presenter(0.3, wristOf(h.a, { x: 0.25, y: 0.7, z: 0 })), presenter(0.7, wristOf(h.b, { x: 0.65, y: 0.7, z: 0 }))],
      };
      this.events.push(...this.p.step(frame).events);
      this.t += DT;
    }
    return this;
  }
  names(): string[] {
    return this.events.map((e) => (e.type === "trigger" ? `${e.command}@${e.person}` : e.type === "speaker" ? `speaker:${e.person}` : `${e.type}@${e.person}`));
  }
}

// In the mirrored view, person A (x=0.3) is on the right, B (x=0.7) on the left.
const aX = (1 - 0.25) * W;
const bX = (1 - 0.65) * W;

describe("GesturePipeline with two presenters", () => {
  it("whoever arms gets control; the other person's swipes are ignored", () => {
    const s = new Scene().run(1.8, () => ({ b: swipeHand(bX, 300) }));
    const p1 = s.p.persons.current;
    const idB = p1.find((p) => p.cx > 0.5)!.id;
    const idA = p1.find((p) => p.cx < 0.5)!.id;
    expect(s.names()).toEqual([`calibrated@${idB}`, `speaker:${idB}`]);
    s.events = [];
    s.run(0.25, (i) => ({ b: swipeHand(bX - i * 20, 300) })).run(1.2, () => ({ b: swipeHand(bX - 140, 300) }));
    expect(s.names()).toContain(`next@${idB}`);
    s.events = [];
    s.run(0.5, () => ({ a: swipeHand(aX, 300) })).run(0.25, (i) => ({ a: swipeHand(aX - i * 20, 300) })).run(0.5, () => ({ a: swipeHand(aX - 140, 300) }));
    expect(s.names()).toEqual([`ignored_not_speaker@${idA}`]);
  });

  it("raising an open hand for a second hands control over (manual)", () => {
    const s = new Scene().run(1.8, () => ({ b: swipeHand(bX, 300) }));
    const idA = s.p.persons.current.find((p) => p.cx < 0.5)!.id;
    s.events = [];
    s.run(1.3, () => ({ a: openHand(0.27, 0.3) }));
    expect(s.names()).toEqual([`speaker:${idA}`]);
    s.events = [];
    s.run(0.6, () => ({ a: swipeHand(aX, 300) })).run(0.25, (i) => ({ a: swipeHand(aX - i * 20, 300) })).run(0.3, () => ({ a: swipeHand(aX - 140, 300) }));
    expect(s.names()).toContain(`next@${idA}`);
  });

  it("the snapshot marks the speaker and greys out the other person's hands", () => {
    const s = new Scene().run(1.8, () => ({ b: swipeHand(bX, 300) }));
    const idB = s.p.persons.current.find((p) => p.cx > 0.5)!.id;
    const snap = s.p.step({ t: s.t, width: W, height: H, hands: [swipeHand(bX, 300), swipeHand(aX, 300)], poses: null }).snapshot;
    expect(snap.speaker).toBe(idB);
    expect(snap.persons.find((p) => p.active)!.id).toBe(idB);
    expect(snap.hands.find((h) => h.person === idB)!.allowed).toBe(true);
    expect(snap.hands.find((h) => h.person !== idB)!.allowed).toBe(false);
  });

  it("without pose data it behaves like a single presenter", () => {
    const p = new GesturePipeline();
    let names: string[] = [];
    for (let i = 0; i < 80; i++) {
      const cx = i < 54 ? 320 : 320 - (i - 54) * 20;
      names = names.concat(p.step({ t: 10 + i * DT, width: W, height: H, hands: [swipeHand(Math.max(cx, 160), 240)] }).events.map((e) => e.type));
    }
    expect(names).toEqual(["calibrated", "trigger"]);
  });
});
