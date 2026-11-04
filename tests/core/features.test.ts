import { readFileSync } from "node:fs";
import { join } from "node:path";
import { handFeatures } from "../../src/core/features.ts";
import { palmLandmarks } from "../support/landmarks.ts";

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

describe("handFeatures (golden, from prototype hand_features; 2D like the prototype)", () => {
  it.each(cases.map((c, i) => [i, c] as const))("case %i", (_i, c) => {
    const lms = c.landmarks.map(([x, y, z]) => ({ x, y, z }));
    const f = handFeatures(lms, c.width, c.height, c.mirror, false);
    expect(f.cx).toBeCloseTo(c.expected.cx, 9);
    expect(f.cy).toBeCloseTo(c.expected.cy, 9);
    expect(f.scale).toBeCloseTo(c.expected.scale, 9);
  });
});

describe("handFeatures: hand length in 3D", () => {
  it("a hand tilted towards the camera keeps its length", () => {
    const flat = palmLandmarks(0.5, 0.6, 0.15, true); // fingers up: wrist -> MCP is vertical
    const w = flat[0]!;
    // Tilt 60° about the horizontal axis through the wrist: y shrinks to half, the rest goes into z.
    const tilted = flat.map((l) => ({ x: l.x, y: w.y + (l.y - w.y) * 0.5, z: ((l.y - w.y) * Math.sin(Math.PI / 3) * 480) / 640 }));
    const a = handFeatures(flat, 640, 480);
    const b = handFeatures(tilted, 640, 480);
    expect(b.scale / a.scale).toBeGreaterThan(0.95);
    expect(handFeatures(tilted, 640, 480, true, false).scale / a.scale).toBeLessThan(0.8);
  });
});
