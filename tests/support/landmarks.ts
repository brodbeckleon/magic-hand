import type { Hand, HandObs, Landmark, Side } from "../../src/core/types.ts";
import type { Frame } from "./traces.ts";

// Offsets (in hand lengths) of the palm landmarks 0, 5, 9, 13, 17; centroid 0, wrist->MCP9 = 1.
const PALM_OFFSETS: Record<number, [number, number]> = {
  0: [0, 0.6], 5: [-0.3, -0.3], 9: [0, -0.4], 13: [0.1, -0.3], 17: [0.2, 0.4],
};

/** 21 landmarks (normalised, unmirrored source) whose handFeatures() are exactly `hand`. */
export function landmarksFor(hand: Hand, width = 640, height = 480): Landmark[] {
  return Array.from({ length: 21 }, (_, i) => {
    const [ox, oy] = PALM_OFFSETS[i] ?? [0, -0.8];
    const mx = hand.cx + ox * hand.scale; // mirrored px
    const my = hand.cy + oy * hand.scale;
    return { x: 1 - mx / width, y: my / height, z: 0 };
  });
}

export function handObs(hand: Hand, side: Side = "right", sideScore = 0.95, width = 640, height = 480): HandObs {
  return { landmarks: landmarksFor(hand, width, height), side, sideScore };
}

/** Turns a single-hand trace into FrameObs, with an optional per-frame side label. */
export function toFrames(frames: Frame[], side: (i: number) => Side = () => "right", width = 640, height = 480) {
  return frames.map((f, i) => ({
    t: f.t, width, height,
    hands: f.hand ? [handObs(f.hand, side(i), 0.9, width, height)] : [],
  }));
}
