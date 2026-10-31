import { schedule } from "../../src/core/pipeline/scheduler.ts";

const run = (n: number, o: Partial<Parameters<typeof schedule>[0]> = {}) =>
  Array.from({ length: n }, (_, frame) => schedule({ frame, persons: 1, wantFace: false, loadMs: 10, forcePose: false, ...o }));

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
});

it("runs pose every 2nd frame while a presenter is far away", () => {
  expect(run(12, { far: true }).filter((s) => s.pose)).toHaveLength(6);
});
