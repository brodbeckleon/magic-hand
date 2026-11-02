import { schedule } from "../../src/core/pipeline/scheduler.ts";

/** n frames at `fps`, feeding back when the face model last ran (as the engine does). */
const run = (n: number, o: Partial<Parameters<typeof schedule>[0]> = {}, fps = 30) => {
  let lastFace = -Infinity;
  return Array.from({ length: n }, (_, frame) => {
    const t = frame / fps;
    const s = schedule({ frame, persons: 1, wantFace: false, loadMs: 10, forcePose: false, sinceFace: t - lastFace, ...o });
    if (s.face) lastFace = t;
    return s;
  });
};

describe("scheduler", () => {
  it("runs pose every 4th frame for one person, every 2nd for several", () => {
    expect(run(12).filter((s) => s.pose)).toHaveLength(3);
    expect(run(12, { persons: 2 }).filter((s) => s.pose)).toHaveLength(6);
  });

  it("runs faces at ~5 Hz only when mouth activity is wanted and several people are in view", () => {
    expect(run(30, { persons: 2 }).some((s) => s.face)).toBe(false);
    expect(run(30, { persons: 1, wantFace: true }).some((s) => s.face)).toBe(false);
    expect(run(30, { persons: 2, wantFace: true }).filter((s) => s.face)).toHaveLength(5);
  });

  it("backs off pose and face under load, never below what forcePose demands", () => {
    expect(run(24, { persons: 2, loadMs: 50 }).filter((s) => s.pose).length).toBeLessThan(12);
    expect(run(24, { persons: 2, wantFace: true, loadMs: 50 }).filter((s) => s.face).length).toBeLessThan(4);
    expect(run(10, { loadMs: 80, forcePose: true }).every((s) => s.pose)).toBe(true);
  });

  it("keeps faces frequent enough for mouth activity when frames are dropped under load", () => {
    // 15 processed frames per second, busy: at least 3 face samples in every 1.5 s.
    const faces = run(60, { persons: 2, wantFace: true, loadMs: 50 }, 15).flatMap((s, i) => (s.face ? [i / 15] : []));
    expect(faces.length).toBeGreaterThanOrEqual(6);
    for (let i = 2; i < faces.length; i++) expect(faces[i]! - faces[i - 2]!).toBeLessThanOrEqual(1.5);
  });
});

it("runs pose every 2nd frame while a presenter is far away", () => {
  expect(run(12, { far: true }).filter((s) => s.pose)).toHaveLength(6);
});
