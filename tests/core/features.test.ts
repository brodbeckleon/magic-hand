import { readFileSync } from "node:fs";
import { join } from "node:path";
import { handFeatures } from "../../src/core/features.ts";

interface Case {
  landmarks: [number, number, number][];
  width: number;
  height: number;
  mirror: boolean;
  expected: { cx: number; cy: number; scale: number };
}

const cases: Case[] = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "fixtures", "hand_features.json"), "utf8"),
);

describe("handFeatures (golden, from prototype hand_features)", () => {
  it.each(cases.map((c, i) => [i, c] as const))("case %i", (_i, c) => {
    const lms = c.landmarks.map(([x, y, z]) => ({ x, y, z }));
    const f = handFeatures(lms, c.width, c.height, c.mirror);
    expect(f.cx).toBeCloseTo(c.expected.cx, 9);
    expect(f.cy).toBeCloseTo(c.expected.cy, 9);
    expect(f.scale).toBeCloseTo(c.expected.scale, 9);
  });
});
