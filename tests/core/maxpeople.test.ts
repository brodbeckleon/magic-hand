import { DEFAULT_PIPELINE_SETTINGS, GesturePipeline, limitPeople } from "../../src/core/pipeline/GesturePipeline.ts";
import type { FaceObs, FrameObs } from "../../src/core/types.ts";
import { person } from "../support/poses.ts";

const face = (tag: number): FaceObs => ({ landmarks: [{ x: tag, y: 0, z: 0 }] }) as unknown as FaceObs;

/** Two people: a small one (far, e.g. in the audience) listed first, a large one (the presenter). */
const frame = (t: number): FrameObs => ({
  t, width: 640, height: 480, hands: [],
  poses: [person(0.2, 0.3, 0.06), person(0.6, 0.2, 0.2)],
  faces: [face(1), face(2)],
});

describe("maxPeople", () => {
  it("tracks everyone up to the limit", () => {
    const p = new GesturePipeline({ ...DEFAULT_PIPELINE_SETTINGS, maxPeople: 4 });
    expect(p.step(frame(1)).snapshot.persons).toHaveLength(2);
  });

  it("with 1, keeps only the person closest to the camera (widest shoulders)", () => {
    const p = new GesturePipeline({ ...DEFAULT_PIPELINE_SETTINGS, maxPeople: 1 });
    let snap = p.step(frame(1)).snapshot;
    for (let i = 2; i < 10; i++) snap = p.step(frame(1 + i / 30)).snapshot;
    expect(snap.persons).toHaveLength(1);
    expect(snap.persons[0]!.box.x).toBeGreaterThan(0.3); // the large person at x 0.6, not the one at 0.2
  });

  it("keeps each kept person's face with them (faces are matched to poses by index)", () => {
    const f = limitPeople(frame(1), 1);
    expect(f.poses).toHaveLength(1);
    expect(f.poses![0]!.landmarks[11]!.x).toBeCloseTo(0.7); // the large person (0.6 + 0.2 / 2)
    expect(f.faces).toEqual([face(2)]);
    const two = frame(1);
    expect(limitPeople(two, 2)).toBe(two); // at or below the limit the frame is passed through
  });
});
