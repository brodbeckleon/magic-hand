import { DEFAULT_PIPELINE_SETTINGS, GesturePipeline } from "../../src/core/pipeline/GesturePipeline.ts";
import type { FrameObs, PoseObs } from "../../src/core/types.ts";
import { handObs } from "../support/landmarks.ts";
import { person } from "../support/poses.ts";

const W = 640;
const H = 480;
const DT = 1 / 30;

/** One presenter whose right forearm points up with the wrist at (wx, wy). Shoulder width in normalised x. */
function pose(shoulder: number, wx: number, wy: number): PoseObs {
  const p = person(0.5, 0.3, shoulder);
  const lms = p.landmarks.slice();
  lms[16] = { x: wx, y: wy, z: 0, visibility: 0.95 };
  lms[14] = { x: wx, y: wy + shoulder, z: 0, visibility: 0.95 };
  lms[15] = { x: 0.6, y: 0.8, z: 0, visibility: 0.1 }; // left wrist not visible
  return { landmarks: lms };
}

/** Pose-only frames (hand model finds nothing): hold, swipe the wrist left in the mirrored view. */
function run(shoulder: number, opts: { farAssist?: boolean } = {}) {
  const p = new GesturePipeline({ ...DEFAULT_PIPELINE_SETTINGS, ...opts });
  const events: string[] = [];
  let snap = null as ReturnType<GesturePipeline["step"]>["snapshot"] | null;
  let t = 10;
  const frame = (wx: number): FrameObs => ({ t, width: W, height: H, hands: [], poses: [pose(shoulder, wx, 0.45)] });
  // Arm: hold still, then a swipe of ~4.5 hand lengths to the presenter's right (mirrored left).
  const handPx = 0.24 * shoulder * W;
  const xs = [...Array(60).fill(0.4), ...Array.from({ length: 9 }, (_, i) => 0.4 + ((i + 1) * 4.5 * handPx) / 9 / W), ...Array(20).fill(0.4 + (4.5 * handPx) / W)];
  for (const wx of xs) {
    const r = p.step(frame(wx));
    events.push(...r.events.map((e) => (e.type === "trigger" ? e.command : e.type)));
    snap = r.snapshot;
    t += DT;
  }
  return { events, snap: snap! };
}

describe("far-distance assist", () => {
  it("a far presenter (no hand landmarks) still arms and swipes via the pose wrist", () => {
    const { events, snap } = run(0.08); // 51 px shoulders: ~3-4 m at 640 px
    expect(events).toContain("calibrated");
    expect(events).toContain("next");
    expect(snap.persons[0]!.far).toBe(true);
    expect(snap.poseHands.length).toBeGreaterThan(0);
  });

  it("is not used for near presenters (their hands are visible to the hand model)", () => {
    const { events, snap } = run(0.25); // 160 px shoulders
    expect(events.filter((e) => e === "next" || e === "prev")).toEqual([]);
    expect(snap.persons[0]!.far).toBe(false);
  });

  it("can be switched off", () => {
    const { events } = run(0.08, { farAssist: false });
    expect(events.filter((e) => e === "next" || e === "prev")).toEqual([]);
  });

  it("asks for a wrist crop for the far presenter's missing hand", () => {
    const { snap } = run(0.08);
    expect(snap.wristCrops).toHaveLength(1); // the left wrist is not visible
    const c = snap.wristCrops[0]!;
    expect(c.w * W).toBeCloseTo(c.h * H, 3);
  });

  it("keeps the wrist crop while the crop is what finds the hand (no crop/pose flip-flop)", () => {
    // 83 px shoulders: far, but the hand (22 px) is above the "tiny" limit once the crop finds it.
    const crops = (fromCrop: boolean) => {
      const p = new GesturePipeline(DEFAULT_PIPELINE_SETTINGS);
      let snap = null as ReturnType<GesturePipeline["step"]>["snapshot"] | null;
      for (let i = 0; i < 10; i++) {
        const hand = { ...handObs({ cx: (1 - 0.4) * W, cy: 0.45 * H - 10, scale: 22 }, "right"), fromCrop };
        snap = p.step({ t: 10 + i * DT, width: W, height: H, hands: [hand], poses: [pose(0.13, 0.4, 0.45)] }).snapshot;
      }
      return snap!.wristCrops.length;
    };
    expect(crops(false)).toBe(0); // the full-frame pass sees it: no crop needed
    expect(crops(true)).toBe(1);
  });
});
