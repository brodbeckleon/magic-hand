import fc from "fast-check";
import { proposeZone } from "../../src/core/zone/proposeZone.ts";
import { clampRect, contains, cropRect, cropToFull, fullToCrop, mirrorRect, pixelCrop } from "../../src/core/zone/Zone.ts";
import type { PoseObs } from "../../src/core/types.ts";

const rect = fc.record({
  x: fc.double({ min: 0, max: 0.8, noNaN: true }), y: fc.double({ min: 0, max: 0.8, noNaN: true }),
  w: fc.double({ min: 0.1, max: 0.2, noNaN: true }), h: fc.double({ min: 0.1, max: 0.2, noNaN: true }),
});
const unit = fc.double({ min: 0, max: 1, noNaN: true });

/** A standing person: 33 landmarks spread over a box, shoulders at 11/12. */
export function person(cx: number, top: number, shoulder: number): PoseObs {
  const lms = Array.from({ length: 33 }, (_, i) => ({
    x: cx + ((i % 5) - 2) * shoulder * 0.3,
    y: top + (i / 32) * shoulder * 4,
    z: 0,
    visibility: 0.9,
  }));
  lms[11] = { x: cx + shoulder / 2, y: top + shoulder, z: 0, visibility: 0.9 };
  lms[12] = { x: cx - shoulder / 2, y: top + shoulder, z: 0, visibility: 0.9 };
  return { landmarks: lms };
}

describe("zone transforms", () => {
  it("crop -> full -> crop is the identity", () => {
    fc.assert(fc.property(rect, unit, unit, (r, x, y) => {
      const back = fullToCrop(cropToFull({ x, y, z: 0 }, r), r);
      expect(back.x).toBeCloseTo(x, 9);
      expect(back.y).toBeCloseTo(y, 9);
    }));
  });

  it("mirroring twice is the identity and keeps the size", () => {
    fc.assert(fc.property(rect, (r) => {
      const m = mirrorRect(r);
      expect(m.w).toBe(r.w);
      expect(mirrorRect(m).x).toBeCloseTo(r.x, 12);
    }));
  });

  it("pixel crops stay inside the frame and map back onto themselves", () => {
    fc.assert(fc.property(rect, fc.constantFrom([320, 240], [640, 480], [1280, 720]), (r, [w, h]) => {
      const c = pixelCrop(r, w!, h!);
      expect(c.sx + c.sw).toBeLessThanOrEqual(w!);
      expect(c.sy + c.sh).toBeLessThanOrEqual(h!);
      const back = cropRect(c, w!, h!);
      expect(Math.abs(back.x - r.x)).toBeLessThan(1 / w!);
    }));
  });

  it("clampRect keeps zones inside the frame with a minimum size", () => {
    expect(clampRect({ x: -0.2, y: 0.95, w: 0.02, h: 0.5 })).toEqual({ x: 0, y: 0.5, w: 0.1, h: 0.5 });
  });
});

describe("proposeZone", () => {
  it("returns null when nobody was seen", () => {
    expect(proposeZone([[], []])).toBeNull();
  });

  it("covers the presenter with room for a swipe on both sides and reaches the bottom", () => {
    const zone = proposeZone([[person(0.5, 0.2, 0.1)], [person(0.52, 0.2, 0.1)]])!;
    expect(contains(zone, 0.5, 0.3)).toBe(true);
    expect(zone.x).toBeLessThan(0.5 - 0.15 - 0.05); // 1.5 shoulder widths beyond the body
    expect(zone.x + zone.w).toBeGreaterThan(0.52 + 0.15 + 0.05);
    expect(zone.y + zone.h).toBeCloseTo(1, 9);
    expect(zone.y).toBeLessThan(0.2);
  });

  it("covers two presenters", () => {
    const zone = proposeZone([[person(0.25, 0.3, 0.08), person(0.75, 0.3, 0.08)]])!;
    expect(contains(zone, 0.25, 0.4) && contains(zone, 0.75, 0.4)).toBe(true);
  });

  it("ignores poses with too few visible landmarks", () => {
    const ghost = { landmarks: person(0.5, 0.2, 0.1).landmarks.map((l) => ({ ...l, visibility: 0.1 })) };
    expect(proposeZone([[ghost]])).toBeNull();
  });
});
